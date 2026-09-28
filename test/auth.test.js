import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let base;

before(async () => {
  const app = createApp({ dbFile: ':memory:' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

// Minimal cookie-aware client.
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null), setCookie };
  };
}

const alice = { username: 'alice', email: 'alice@example.com', password: 'geheim123', displayName: 'Alice' };

test('register, stay logged in, update profile, logout, login', async () => {
  const c = client();

  let r = await c('/api/register', { method: 'POST', body: alice });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.username, 'alice');
  assert.equal(r.body.user.password_hash, undefined);
  assert.match(r.setCookie, /HttpOnly/i);

  r = await c('/api/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, 'alice@example.com');

  r = await c('/api/me', { method: 'PUT', body: { displayName: 'Alice W.', bio: 'Liest gern Krimis.' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.bio, 'Liest gern Krimis.');

  r = await c('/api/logout', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  r = await c('/api/me');
  assert.equal(r.status, 401);

  r = await c('/api/login', { method: 'POST', body: { login: 'ALICE@example.com', password: alice.password } });
  assert.equal(r.status, 200);
  r = await c('/api/me');
  assert.equal(r.body.user.displayName, 'Alice W.');
});

test('rejects duplicate accounts and invalid input', async () => {
  const c = client();
  let r = await c('/api/register', { method: 'POST', body: { ...alice, email: 'other@example.com' } });
  assert.equal(r.status, 409);
  r = await c('/api/register', { method: 'POST', body: { ...alice, username: 'Alice2', email: 'x' } });
  assert.equal(r.status, 400);
  r = await c('/api/register', { method: 'POST', body: { ...alice, username: 'bob', email: 'b@x.de', password: 'kurz' } });
  assert.equal(r.status, 400);
});

test('wrong password and unknown user give the same error', async () => {
  const c = client();
  const wrong = await c('/api/login', { method: 'POST', body: { login: 'alice', password: 'falsch123' } });
  const unknown = await c('/api/login', { method: 'POST', body: { login: 'niemand', password: 'falsch123' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
});

test('non-JSON writes are rejected', async () => {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'login=alice&password=geheim123',
  });
  assert.equal(res.status, 415);
});

test('password change signs out other sessions', async () => {
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

  r = await b('/api/login', { method: 'POST', body: { login: 'alice', password: 'neuesPasswort' } });
  assert.equal(r.status, 200);
});

test('account deletion removes the user', async () => {
  const c = client();
  await c('/api/register', { method: 'POST', body: { username: 'carol', email: 'carol@example.com', password: 'passwort1' } });
  let r = await c('/api/me', { method: 'DELETE', body: { password: 'passwort1' } });
  assert.equal(r.status, 200);
  assert.equal((await c('/api/me')).status, 401);
  r = await c('/api/login', { method: 'POST', body: { login: 'carol', password: 'passwort1' } });
  assert.equal(r.status, 401);
});

test('serves the HTML pages', async () => {
  for (const page of ['/', '/login', '/register', '/profile']) {
    const res = await fetch(base + page);
    assert.equal(res.status, 200, page);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
});
