import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 3000;
const app = createApp({
  dbFile: process.env.DB_FILE || 'data/b-cherregall.db',
  secureCookies: process.env.NODE_ENV === 'production',
});

app.listen(port, () => {
  console.log(`b-cherregall läuft auf http://localhost:${port}`);
});
