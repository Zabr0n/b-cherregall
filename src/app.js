import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { hashPassword, verifyPassword } from './passwords.js';

const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

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

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  }
  if (password.length > 200) return 'Das Passwort ist zu lang.';
  return null;
}

export function createApp({ dbFile = 'data/b-cherregall.db', secureCookies = false } = {}) {
  const db = openDatabase(dbFile);
  const app = express();

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByLogin: db.prepare('SELECT * FROM users WHERE username = ? OR email = ?'),
    insertUser: db.prepare(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
    ),
    updateProfile: db.prepare(
      "UPDATE users SET display_name = ?, bio = ?, updated_at = datetime('now') WHERE id = ?",
    ),
    updatePassword: db.prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    ),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  // Used so unknown usernames take as long as wrong passwords (no user enumeration by timing).
  const dummyHash = hashPassword(randomBytes(16).toString('hex'));

  function startSession(res, userId) {
    const token = randomBytes(32).toString('base64url');
    q.purgeSessions.run(Date.now());
    q.insertSession.run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
  }

  function endSession(req, res) {
    if (req.sessionTokenHash) q.deleteSession.run(req.sessionTokenHash);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  // Resolve the logged-in user from the session cookie.
  app.use((req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const tokenHash = sha256(token);
      const row = q.sessionUser.get(tokenHash, Date.now());
      if (row) {
        req.user = row;
        req.sessionTokenHash = tokenHash;
      }
    }
    next();
  });

  // Mutating API calls must be JSON; together with SameSite cookies this blocks form-based CSRF.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type muss application/json sein.' });
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
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
    }
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });
    const name = typeof displayName === 'string' ? displayName.trim().slice(0, 64) : '';

    const passwordHash = await hashPassword(password);
    let result;
    try {
      result = q.insertUser.run(username, email.trim(), passwordHash, name || username);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
      }
      throw err;
    }
    const user = q.userById.get(result.lastInsertRowid);
    startSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post('/api/login', async (req, res) => {
    const { login, password } = req.body ?? {};
    if (typeof login !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Benutzername/E-Mail und Passwort angeben.' });
    }
    const user = q.userByLogin.get(login.trim(), login.trim());
    const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Benutzername/E-Mail oder Passwort ist falsch.' });
    }
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/logout', (req, res) => {
    endSession(req, res);
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.put('/api/me', requireAuth, (req, res) => {
    const { displayName, bio } = req.body ?? {};
    const name = typeof displayName === 'string' ? displayName.trim().slice(0, 64) : req.user.display_name;
    const about = typeof bio === 'string' ? bio.slice(0, 1000) : req.user.bio;
    q.updateProfile.run(name, about, req.user.id);
    res.json({ user: publicUser(q.userById.get(req.user.id)) });
  });

  app.put('/api/me/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, req.user.password_hash))) {
      return res.status(403).json({ error: 'Das aktuelle Passwort ist falsch.' });
    }
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });
    q.updatePassword.run(await hashPassword(newPassword), req.user.id);
    // Sign out all other devices after a password change.
    q.deleteOtherSessions.run(req.user.id, req.sessionTokenHash);
    res.json({ ok: true });
  });

  app.delete('/api/me', requireAuth, async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || !(await verifyPassword(password, req.user.password_hash))) {
      return res.status(403).json({ error: 'Das Passwort ist falsch.' });
    }
    q.deleteUser.run(req.user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Ungültiges JSON.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  });

  app.locals.db = db;
  return app;
}
