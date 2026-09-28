// Braucht eine leere Test-Datenbank, z. B.:
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/buecher_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/db.js';
import { createApp } from '../src/app.js';

const url = process.env.TEST_DATABASE_URL;
const ORIGIN = 'https://buchbrett.de';
let db;
let server;
let base;

before(async () => {
  if (!url) return;
  db = await connect(url);
  await db.query('TRUNCATE users, sessions, libraries RESTART IDENTITY CASCADE');
  const app = createApp(db, { allowedOrigins: [ORIGIN] });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await db?.end();
});

const t = (name, fn) => test(name, { skip: !url && 'TEST_DATABASE_URL nicht gesetzt' }, fn);

function client() {
  let token = null;
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (json?.token) token = json.token;
    return { status: res.status, body: json };
  };
  call.forgetToken = () => { token = null; };
  return call;
}

const alice = { username: 'alice', email: 'alice@example.com', password: 'geheim123', displayName: 'Alice' };

t('register, profile, library sync, logout, login', async () => {
  const c = client();
  let r = await c('/api/register', { method: 'POST', body: alice });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.username, 'alice');
  assert.equal(r.body.user.password_hash, undefined);

  r = await c('/api/me', { method: 'PUT', body: { displayName: 'Alice W.', bio: 'Liest gern Krimis.' } });
  assert.equal(r.body.user.bio, 'Liest gern Krimis.');

  r = await c('/api/library');
  assert.deepEqual(r.body, { data: null, updatedAt: null });

  const library = { books: [{ id: 'b1', title: 'Der Name der Rose', rating: 5 }], settings: { yearlyGoal: 12 } };
  r = await c('/api/library', { method: 'PUT', body: { data: library } });
  assert.equal(r.status, 200);

  r = await c('/api/logout', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.equal((await c('/api/me')).status, 401);

  // Anderes Gerät: Login per E-Mail (Groß-/Kleinschreibung egal) holt dieselben Daten.
  const other = client();
  r = await other('/api/login', { method: 'POST', body: { login: 'ALICE@example.com', password: alice.password } });
  assert.equal(r.status, 200);
  r = await other('/api/library');
  assert.deepEqual(r.body.data, library);
  assert.equal((await other('/api/me')).body.user.displayName, 'Alice W.');
});

t('rejects duplicates and invalid input', async () => {
  const c = client();
  assert.equal((await c('/api/register', { method: 'POST', body: { ...alice, email: 'x@example.com' } })).status, 409);
  assert.equal((await c('/api/register', { method: 'POST', body: { ...alice, username: 'ALICE', email: 'y@example.com' } })).status, 409);
  assert.equal((await c('/api/register', { method: 'POST', body: { ...alice, username: 'bob', email: 'kaputt' } })).status, 400);
  assert.equal((await c('/api/register', { method: 'POST', body: { ...alice, username: 'bob', email: 'b@x.de', password: 'kurz' } })).status, 400);
  assert.equal((await c('/api/library', { method: 'PUT', body: { data: { books: [] } } })).status, 401);
});

t('wrong password and unknown user give the same error', async () => {
  const c = client();
  const wrong = await c('/api/login', { method: 'POST', body: { login: 'alice', password: 'falsch123' } });
  const unknown = await c('/api/login', { method: 'POST', body: { login: 'niemand', password: 'falsch123' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
});

t('password change signs out other devices', async () => {
  const a = client();
  const b = client();
  const creds = { login: 'alice', password: alice.password };
  await a('/api/login', { method: 'POST', body: creds });
  await b('/api/login', { method: 'POST', body: creds });

  let r = await a('/api/me/password', { method: 'PUT', body: { currentPassword: 'falsch', newPassword: 'neuesPasswort' } });
  assert.equal(r.status, 403);
  r = await a('/api/me/password', { method: 'PUT', body: { currentPassword: alice.password, newPassword: 'neuesPasswort' } });
  assert.equal(r.status, 200);
  assert.equal((await a('/api/me')).status, 200);
  assert.equal((await b('/api/me')).status, 401);
});

t('account deletion removes user and library', async () => {
  const c = client();
  await c('/api/register', { method: 'POST', body: { username: 'carol', email: 'carol@example.com', password: 'passwort1' } });
  await c('/api/library', { method: 'PUT', body: { data: { books: [{ id: 'x' }] } } });
  assert.equal((await c('/api/me', { method: 'DELETE', body: { password: 'falsch' } })).status, 403);
  assert.equal((await c('/api/me', { method: 'DELETE', body: { password: 'passwort1' } })).status, 200);
  assert.equal((await c('/api/me')).status, 401);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM libraries l JOIN users u ON u.id = l.user_id WHERE u.username = 'carol'");
  assert.equal(rows[0].n, 0);
});

t('CORS only for allowed origins', async () => {
  let res = await fetch(`${base}/api/login`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
  res = await fetch(`${base}/health`, { headers: { Origin: 'https://boese.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

t('login is rate limited after repeated failures', async () => {
  const c = client();
  for (let i = 0; i < 10; i++) {
    await c('/api/login', { method: 'POST', body: { login: 'dave', password: 'falsch123' } });
  }
  const r = await c('/api/login', { method: 'POST', body: { login: 'dave', password: 'falsch123' } });
  assert.equal(r.status, 429);
});
