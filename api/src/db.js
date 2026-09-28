import pg from 'pg';

export async function connect(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    // Railways internes Netz (…railway.internal) braucht kein TLS, der öffentliche Proxy schon.
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL,
      email         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL DEFAULT '',
      bio           TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

    -- Ob man in der Nutzersuche auftaucht (über exakten Benutzernamen/E-Mail immer auffindbar).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE;

    -- Freundschaften: erst Anfrage (pending), nach Annahme accepted. Pro Paar nur eine Zeile.
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (requester_id, addressee_id),
      CHECK (requester_id <> addressee_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair
      ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
    CREATE INDEX IF NOT EXISTS friendships_addressee ON friendships (addressee_id);

    -- Die komplette Bibliothek (Bücher, Einstellungen, …) eines Nutzers als JSON.
    CREATE TABLE IF NOT EXISTS libraries (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  return pool;
}
