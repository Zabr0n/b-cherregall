// Freunde: Nutzersuche, Anfragen, Freundesliste und die für Freunde sichtbaren Bücher.

// Nur diese Felder eines Buchs sehen Freunde – Standort und „verliehen an“ bleiben privat.
const SHARED_BOOK_FIELDS = [
  'id', 'title', 'authors', 'coverUrl', 'year', 'pages', 'publisher', 'isbn', 'subjects', 'workKey',
  'format', 'status', 'rating', 'review', 'startedAt', 'finishedAt', 'addedAt',
];

// Bücher ohne Angabe (aus der Zeit vor den Freunden) gelten als sichtbar.
export const isShared = (book) => book && book.friendsVisible !== false;

export function sharedBooks(library) {
  const books = Array.isArray(library?.books) ? library.books : [];
  return books.filter(isShared).map((b) => Object.fromEntries(SHARED_BOOK_FIELDS.map((k) => [k, b[k] ?? null])));
}

const person = (row) => ({ id: row.id, username: row.username, displayName: row.display_name });
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * @param {import('express').Express} app
 * @param {import('pg').Pool} db
 * @param {import('express').RequestHandler} requireAuth
 */
export function friendRoutes(app, db, requireAuth) {
  /** Beziehung zu allen anderen Nutzern: id -> 'friend' | 'outgoing' | 'incoming' */
  async function relations(userId) {
    const { rows } = await db.query(
      'SELECT requester_id, addressee_id, status FROM friendships WHERE $1 IN (requester_id, addressee_id)',
      [userId],
    );
    const map = new Map();
    for (const r of rows) {
      const outgoing = r.requester_id === userId;
      const other = outgoing ? r.addressee_id : r.requester_id;
      map.set(other, r.status === 'accepted' ? 'friend' : outgoing ? 'outgoing' : 'incoming');
    }
    return map;
  }

  const parseId = (req, res) => {
    const id = Number(req.params.userId);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ error: 'Nutzer nicht gefunden.' });
      return null;
    }
    return id;
  };

  app.get('/api/users/search', requireAuth, async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 64);
    if (q.length < 2) return res.json({ users: [] });
    const { rows } = await db.query(
      `SELECT id, username, display_name FROM users
       WHERE id <> $1 AND (
         (discoverable AND (username ILIKE $2 OR display_name ILIKE $2))
         OR lower(username) = lower($3) OR lower(email) = lower($3)
       )
       ORDER BY lower(username) = lower($3) DESC, lower(username)
       LIMIT 20`,
      [req.user.id, `%${escapeLike(q)}%`, q],
    );
    const rel = await relations(req.user.id);
    res.json({ users: rows.map((r) => ({ ...person(r), relation: rel.get(r.id) || 'none' })) });
  });

  app.get('/api/friends', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.display_name, u.bio, f.status, f.requester_id,
         (SELECT count(*)::int FROM jsonb_array_elements(COALESCE(l.data->'books', '[]'::jsonb)) b
           WHERE COALESCE(b->>'friendsVisible', 'true') <> 'false') AS book_count
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN libraries l ON l.user_id = u.id
       WHERE $1 IN (f.requester_id, f.addressee_id)
       ORDER BY lower(u.display_name), lower(u.username)`,
      [req.user.id],
    );
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const r of rows) {
      if (r.status === 'accepted') out.friends.push({ ...person(r), bio: r.bio, bookCount: r.book_count });
      else if (r.requester_id === req.user.id) out.outgoing.push(person(r));
      else out.incoming.push(person(r));
    }
    res.json(out);
  });

  // Anfrage senden – oder annehmen, falls die andere Person schon angefragt hat.
  app.post('/api/friends/:userId', requireAuth, async (req, res) => {
    const other = parseId(req, res);
    if (other == null) return;
    if (other === req.user.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst hinzufügen.' });
    const exists = await db.query('SELECT 1 FROM users WHERE id = $1', [other]);
    if (!exists.rowCount) return res.status(404).json({ error: 'Nutzer nicht gefunden.' });

    const current = (await relations(req.user.id)).get(other);
    if (current === 'incoming') {
      await db.query(
        "UPDATE friendships SET status = 'accepted' WHERE requester_id = $1 AND addressee_id = $2",
        [other, req.user.id],
      );
      return res.json({ relation: 'friend' });
    }
    if (current) return res.json({ relation: current });
    await db.query(
      "INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING",
      [req.user.id, other],
    );
    res.status(201).json({ relation: 'outgoing' });
  });

  // Freundschaft beenden, Anfrage ablehnen oder zurückziehen.
  app.delete('/api/friends/:userId', requireAuth, async (req, res) => {
    const other = parseId(req, res);
    if (other == null) return;
    await db.query(
      `DELETE FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [req.user.id, other],
    );
    res.json({ relation: 'none' });
  });

  app.get('/api/friends/:userId/library', requireAuth, async (req, res) => {
    const other = parseId(req, res);
    if (other == null) return;
    if ((await relations(req.user.id)).get(other) !== 'friend') {
      return res.status(403).json({ error: 'Ihr seid (noch) nicht befreundet.' });
    }
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.display_name, u.bio, l.data
       FROM users u LEFT JOIN libraries l ON l.user_id = u.id WHERE u.id = $1`,
      [other],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Nutzer nicht gefunden.' });
    res.json({ user: { ...person(rows[0]), bio: rows[0].bio }, books: sharedBooks(rows[0].data) });
  });
}
