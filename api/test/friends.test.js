// Braucht eine leere Test-Datenbank (siehe api.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/db.js';
import { createApp } from '../src/app.js';
import { sharedBooks } from '../src/friends.js';

const url = process.env.TEST_DATABASE_URL;
let db;
let server;
let base;

before(async () => {
  if (!url) return;
  db = await connect(url);
  await db.query('TRUNCATE users, sessions, libraries, friendships RESTART IDENTITY CASCADE');
  const app = createApp(db);
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

async function signup(username, extra = {}) {
  let token;
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const r = await call('/api/register', {
    method: 'POST',
    body: { username, email: `${username}@example.com`, password: 'passwort1', ...extra },
  });
  token = r.body.token;
  call.id = r.body.user.id;
  return call;
}

let anna;
let ben;
let carla;

t('user search respects discoverability', async () => {
  anna = await signup('anna', { displayName: 'Anna Leser' });
  ben = await signup('ben');
  carla = await signup('carla');
  await carla('/api/me', { method: 'PUT', body: { discoverable: false } });

  let r = await anna('/api/users/search?q=be');
  assert.deepEqual(r.body.users.map((u) => u.username), ['ben']);
  assert.equal(r.body.users[0].relation, 'none');
  assert.equal(r.body.users[0].email, undefined);

  // Nicht auffindbar per Teilsuche, aber per exaktem Namen oder E-Mail.
  assert.equal((await anna('/api/users/search?q=carl')).body.users.length, 0);
  assert.equal((await anna('/api/users/search?q=CARLA')).body.users.length, 1);
  assert.equal((await anna('/api/users/search?q=carla@example.com')).body.users.length, 1);

  // Suche nach Anzeigename, man findet sich nicht selbst, % ist kein Platzhalter.
  assert.deepEqual((await ben('/api/users/search?q=Leser')).body.users.map((u) => u.username), ['anna']);
  assert.equal((await anna('/api/users/search?q=anna')).body.users.length, 0);
  assert.equal((await anna('/api/users/search?q=%25%25')).body.users.length, 0);
  assert.equal((await fetch(`${base}/api/users/search?q=ben`)).status, 401);
});

t('friend request, accept, list', async () => {
  let r = await anna(`/api/friends/${ben.id}`, { method: 'POST', body: {} });
  assert.equal(r.status, 201);
  assert.equal(r.body.relation, 'outgoing');

  r = await ben('/api/friends');
  assert.deepEqual(r.body.incoming.map((u) => u.username), ['anna']);
  assert.equal((await ben('/api/users/search?q=anna')).body.users[0].relation, 'incoming');

  // Noch nicht befreundet: kein Zugriff auf die Bücher.
  assert.equal((await anna(`/api/friends/${ben.id}/library`)).status, 403);

  // Gegenanfrage = annehmen.
  r = await ben(`/api/friends/${anna.id}`, { method: 'POST', body: {} });
  assert.equal(r.body.relation, 'friend');
  r = await anna('/api/friends');
  assert.deepEqual(r.body.friends.map((u) => u.username), ['ben']);
  assert.equal(r.body.outgoing.length, 0);

  assert.equal((await anna(`/api/friends/${anna.id}`, { method: 'POST', body: {} })).status, 400);
  assert.equal((await anna('/api/friends/99999', { method: 'POST', body: {} })).status, 404);
});

t('friends only see books marked visible, without private fields', async () => {
  const books = [
    { id: 'a', title: 'Momo', rating: 5, review: 'Wunderbar', friendsVisible: true, location: 'Flur', lentTo: 'Oma' },
    { id: 'b', title: 'Geheimes Buch', rating: 4, friendsVisible: false },
    { id: 'c', title: 'Altes Buch ohne Angabe', rating: 3 },
  ];
  await ben('/api/library', { method: 'PUT', body: { data: { books, settings: {} } } });

  const r = await anna(`/api/friends/${ben.id}/library`);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.username, 'ben');
  assert.deepEqual(r.body.books.map((b) => b.title), ['Momo', 'Altes Buch ohne Angabe']);
  assert.equal(r.body.books[0].review, 'Wunderbar');
  assert.equal(r.body.books[0].location, undefined);
  assert.equal(r.body.books[0].lentTo, undefined);

  assert.equal((await anna('/api/friends')).body.friends[0].bookCount, 2);
  // Carla ist keine Freundin von Ben.
  assert.equal((await carla(`/api/friends/${ben.id}/library`)).status, 403);
});

t('removing a friend revokes access', async () => {
  assert.equal((await ben(`/api/friends/${anna.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await anna(`/api/friends/${ben.id}/library`)).status, 403);
  assert.equal((await anna('/api/friends')).body.friends.length, 0);
});

test('sharedBooks handles empty libraries', () => {
  assert.deepEqual(sharedBooks(null), []);
  assert.deepEqual(sharedBooks({ books: [{ id: 'x', friendsVisible: false }] }), []);
});
