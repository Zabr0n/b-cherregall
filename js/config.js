// Adresse der Konto-API (Ordner api/, läuft auf Railway).
// Lokal: `cd api && npm start` → http://localhost:3000
export const API_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:3000'
  : 'https://api.buchbrett.de';
