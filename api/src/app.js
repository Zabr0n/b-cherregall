import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.js';

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    bio: row.bio,
    createdAt: row.created_at,
  };
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  }
  if (password.length > 200) return 'Das Passwort ist zu lang.';
  return null;
}

/**
 * @param {import('pg').Pool} db
 * @param {{ allowedOrigins?: string[] }} options
 */
export function createApp(db, { allowedOrigins = [] } = {}) {
  const app = express();
  const origins = new Set(allowedOrigins);
  const failedLogins = new Map(); // ip -> { count, since }

  // Damit unbekannte Nutzer genauso lange brauchen wie falsche Passwörter.
  const dummyHash = hashPassword(randomBytes(16).toString('hex'));

  async function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      sha256(token),
      userId,
      new Date(Date.now() + SESSION_TTL_MS),
    ]);
    return token;
  }

  const userById = async (id) => (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway sitzt vor der App

  // CORS: Die Web-App liegt auf buchbrett.de (GitHub Pages), die API auf Railway.
  // Angemeldet wird per Bearer-Token statt Cookie, daher ist kein CSRF-Schutz nötig.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Angemeldeten Nutzer aus dem Bearer-Token ermitteln.
  app.use(async (req, _res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (match) {
      const tokenHash = sha256(match[1]);
      const { rows } = await db.query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [tokenHash],
      );
      if (rows[0]) {
        req.user = rows[0];
        req.tokenHash = tokenHash;
      }
    }
    next();
  });

  const requireAuth = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Nicht angemeldet.' });

  app.post('/api/register', async (req, res) => {
    const { username, email, password, displayName } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Der Benutzername muss 3–32 Zeichen lang sein (Buchstaben, Zahlen, _ . -).',
      });
    }
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
    }
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });
    const name = typeof displayName === 'string' ? displayName.trim().slice(0, 64) : '';

    let user;
    try {
      const { rows } = await db.query(
        `INSERT INTO users (username, email, password_hash, display_name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [username, email.trim(), await hashPassword(password), name || username],
      );
      user = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
      }
      throw err;
    }
    res.status(201).json({ token: await createSession(user.id), user: publicUser(user) });
  });

  app.post('/api/login', async (req, res) => {
    const ip = req.ip;
    const fails = failedLogins.get(ip);
    if (fails && Date.now() - fails.since < LOGIN_WINDOW_MS && fails.count >= LOGIN_MAX_FAILS) {
      return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
    }

    const { login, password } = req.body ?? {};
    if (typeof login !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Benutzername/E-Mail und Passwort angeben.' });
    }
    const { rows } = await db.query(
      'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
      [login.trim()],
    );
    const user = rows[0];
    const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash);
    if (!user || !ok) {
      const since = fails && Date.now() - fails.since < LOGIN_WINDOW_MS ? fails.since : Date.now();
      const count = since === fails?.since ? fails.count + 1 : 1;
      failedLogins.set(ip, { count, since });
      return res.status(401).json({ error: 'Benutzername/E-Mail oder Passwort ist falsch.' });
    }
    failedLogins.delete(ip);
    res.json({ token: await createSession(user.id), user: publicUser(user) });
  });

  app.post('/api/logout', requireAuth, async (req, res) => {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [req.tokenHash]);
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.put('/api/me', requireAuth, async (req, res) => {
    const { displayName, bio } = req.body ?? {};
    const name = typeof displayName === 'string' && displayName.trim()
      ? displayName.trim().slice(0, 64)
      : req.user.display_name;
    const about = typeof bio === 'string' ? bio.slice(0, 1000) : req.user.bio;
    const { rows } = await db.query(
      'UPDATE users SET display_name = $1, bio = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [name, about, req.user.id],
    );
    res.json({ user: publicUser(rows[0]) });
  });

  app.put('/api/me/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, req.user.password_hash))) {
      return res.status(403).json({ error: 'Das aktuelle Passwort ist falsch.' });
    }
    const pwError = passwordError(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });
    await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      await hashPassword(newPassword),
      req.user.id,
    ]);
    // Nach einer Passwortänderung alle anderen Geräte abmelden.
    await db.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, req.tokenHash]);
    res.json({ ok: true });
  });

  app.delete('/api/me', requireAuth, async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || !(await verifyPassword(password, req.user.password_hash))) {
      return res.status(403).json({ error: 'Das Passwort ist falsch.' });
    }
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  });

  app.get('/api/library', requireAuth, async (req, res) => {
    const { rows } = await db.query('SELECT data, updated_at FROM libraries WHERE user_id = $1', [req.user.id]);
    res.json(rows[0] ? { data: rows[0].data, updatedAt: rows[0].updated_at } : { data: null, updatedAt: null });
  });

  app.put('/api/library', requireAuth, async (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.books)) {
      return res.status(400).json({ error: 'Ungültige Bibliotheksdaten.' });
    }
    const { rows } = await db.query(
      `INSERT INTO libraries (user_id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
       RETURNING updated_at`,
      [req.user.id, data],
    );
    res.json({ updatedAt: rows[0].updated_at });
  });

  app.use((_req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Die Daten sind zu groß.' });
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  });

  return app;
}
