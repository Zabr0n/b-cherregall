import { connect } from './src/db.js';
import { createApp } from './src/app.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL fehlt. Auf Railway: Variable DATABASE_URL = ${{Postgres.DATABASE_URL}} setzen.');
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://buchbrett.de,https://www.buchbrett.de')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const db = await connect(process.env.DATABASE_URL);
const app = createApp(db, { allowedOrigins });
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Bücherregal-API läuft auf Port ${port} (erlaubte Origins: ${allowedOrigins.join(', ')})`);
});
