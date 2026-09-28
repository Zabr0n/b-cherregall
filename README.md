# b-cherregall
digitales bücherregall

## Starten

Benötigt Node.js ≥ 22.13 (nutzt das eingebaute `node:sqlite`).

```bash
npm install
npm start        # http://localhost:3000
npm test
```

Umgebungsvariablen:

| Variable   | Standard               | Bedeutung                                       |
|------------|------------------------|-------------------------------------------------|
| `PORT`     | `3000`                 | Port des Servers                                |
| `DB_FILE`  | `data/b-cherregall.db` | Pfad zur SQLite-Datenbank                       |
| `NODE_ENV` | –                      | `production` setzt das Session-Cookie `Secure` (nur HTTPS) |

## Benutzerkonten

Seiten: `/register`, `/login`, `/profile`.

Die Benutzerdaten (Benutzername, E-Mail, Anzeigename, „Über mich“, Registrierungsdatum) werden in der SQLite-Datenbank gespeichert. Passwörter werden nur als scrypt-Hash mit Salt abgelegt. Die Anmeldung läuft über ein `HttpOnly`-Session-Cookie (30 Tage gültig); in der Datenbank steht nur ein Hash des Session-Tokens.

API (JSON):

| Methode  | Pfad               | Beschreibung                                           |
|----------|--------------------|--------------------------------------------------------|
| `POST`   | `/api/register`    | `{ username, email, password, displayName? }`          |
| `POST`   | `/api/login`       | `{ login, password }` – `login` = Benutzername oder E-Mail |
| `POST`   | `/api/logout`      | Abmelden                                               |
| `GET`    | `/api/me`          | Eigene Benutzerdaten                                   |
| `PUT`    | `/api/me`          | `{ displayName?, bio? }`                               |
| `PUT`    | `/api/me/password` | `{ currentPassword, newPassword }` – meldet andere Geräte ab |
| `DELETE` | `/api/me`          | `{ password }` – Konto löschen                         |
