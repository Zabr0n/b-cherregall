// Adresse der Konto-API (Ordner api/, läuft auf Railway).
// Lokal: `cd api && npm start` → http://localhost:3000
// Vorerst die Railway-Adresse; sobald das Zertifikat für api.buchbrett.de aktiv ist,
// kann hier https://api.buchbrett.de eingetragen werden (beide zeigen auf denselben Server).
export const API_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:3000'
  : 'https://api-production-6045.up.railway.app';
