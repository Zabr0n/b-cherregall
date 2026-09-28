# Bücherregal

Ein digitales Bücherregal für deine **physischen Bücher**: katalogisieren, bewerten,
kurze Rezensionen schreiben, Lesestatistik ansehen und passende Empfehlungen bekommen.

## Starten

Es gibt keine Abhängigkeiten, nur Node.js (≥ 18) für den kleinen lokalen Server:

```bash
npm start
```

Danach http://localhost:8080 öffnen. Alternativ funktioniert jeder statische Webserver
(z. B. GitHub Pages), denn die App besteht nur aus HTML, CSS und JavaScript.

## Funktionen

- **Regal** – Cover-Ansicht auf Regalbrettern oder als Liste; Filter nach Gelesen, Lese ich,
  Ungelesen, Wunschliste und Verliehen; Suche über Titel, Autor:in, Genre und Standort.
- **Bücher erfassen** – per ISBN (Daten und Cover von Open Library, Google Books als Fallback),
  per **Barcode-Scan** mit der Handykamera (Chrome/Android, braucht HTTPS), per Titelsuche oder manuell.
- **Buchseite** – Lesestatus, 1–5 Sterne, Kurzrezension, Lesezeitraum, Standort im Regal,
  Format, „verliehen an“, Genres/Schlagwörter. Alles wird automatisch gespeichert.
- **Statistik** – Jahresziel mit Fortschritt, gelesene Seiten, Ø-Bewertung, Bücher pro Monat,
  Bewertungsverteilung, eine Zeitleiste „Gelesen in …“ mit deinen Rezensionen, Top-Genres und -Autor:innen.
- **Empfehlungen**
  - *Dein Geschmack*: Genres und Autor:innen, die du magst bzw. eher nicht.
  - *Als Nächstes aus deinem Regal*: deine ungelesenen Bücher, nach Passung sortiert.
  - *Neu entdecken*: Vorschläge von Open Library, jeweils mit Begründung
    („Weil dir … gefallen hat“). Mit einem Klick auf die Wunschliste, als „Hab ich“ ins Regal
    oder mit „Kein Interesse“ ausblenden.
- **Sicherung** – Export/Import als JSON (Einstellungen), dazu Beispieldaten zum Ausprobieren.

## So funktionieren die Empfehlungen

Jede Bewertung wird um 3 Sterne zentriert (5★ → +2, 4★ → +1, 3★ → 0, 2★ → −1, 1★ → −2) und auf
die Genres und Autor:innen des Buchs verteilt. So entsteht ein Geschmacksprofil, in dem sich
Allerweltsbegriffe wie „fiction“ gegenseitig aufheben. Kandidaten werden gegen dieses Profil
gewertet, wobei höchstens zwei Vorschläge pro Autor:in in die Liste kommen. Bewerte also auch
Bücher, die dir *nicht* gefallen haben – das schärft die Vorschläge.

## Daten & Konto

Ohne Konto liegt alles nur im `localStorage` deines Browsers. Unter **Anmelden** (`#/konto`)
kann man sich registrieren und anmelden. Dann wird die Bibliothek (Bücher, Bewertungen,
Rezensionen, Einstellungen) im Konto auf dem Server gespeichert und zwischen Geräten
synchronisiert. Beim ersten Anmelden werden die Bücher aus dem Browser ins Konto übernommen.
Buchdaten werden von [Open Library](https://openlibrary.org) und Google Books abgefragt.

Die Web-App bleibt statisch (GitHub Pages, buchbrett.de). Konten und Daten verwaltet die kleine
API im Ordner `api/` (Node.js + PostgreSQL), die auf [Railway](https://railway.com) läuft.
Passwörter werden nur als scrypt-Hash gespeichert. Die Anmeldung läuft über ein Token
(90 Tage gültig), von dem der Server nur einen Hash speichert.

### Freunde

Unter **Freunde** (`#/freunde`) sucht man andere Nutzer (Benutzername, Anzeigename oder E-Mail),
schickt Freundschaftsanfragen und sieht nach dem Annehmen das Regal der Freunde mit Status,
Bewertungen und Rezensionen. Bücher von Freunden lassen sich mit einem Klick auf die eigene
Wunschliste setzen.

- Jedes Buch hat einen Schalter **„Für Freunde sichtbar“** (beim Hinzufügen und auf der Buchseite).
  Private Bücher sind im eigenen Regal mit 🔒 markiert und werden vom Server nie an Freunde ausgeliefert.
- Standort und „verliehen an“ sehen Freunde nie.
- In den Freunde-Einstellungen: Standard für neue Bücher, alle Bücher auf einmal umstellen und
  ob man in der Suche auftaucht (über den genauen Benutzernamen oder die E-Mail ist man immer auffindbar).

### API auf Railway einrichten

1. In Railway ein neues Projekt anlegen → **Deploy from GitHub repo** → dieses Repo wählen.
2. Im Service unter **Settings**:
   - **Source → Branch**: `buecherregal-app`
   - **Source → Root Directory**: `/api`
3. Im Projekt **+ New → Database → PostgreSQL** hinzufügen.
4. Im API-Service unter **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - optional `ALLOWED_ORIGINS` (Standard: `https://buchbrett.de,https://www.buchbrett.de`)
5. Unter **Settings → Networking → Custom Domain** `api.buchbrett.de` eintragen und den
   angezeigten CNAME-Eintrag beim Domain-Anbieter anlegen.

Die Tabellen legt die API beim Start selbst an. Soll eine andere API-Adresse verwendet werden,
wird sie in `js/config.js` eingetragen.

### Lokal entwickeln

```bash
cd api && npm install
DATABASE_URL=postgres://localhost/buecherregal ALLOWED_ORIGINS=http://localhost:8080 npm start
# in einem zweiten Terminal im Hauptordner:
npm start   # http://localhost:8080 – nutzt automatisch die API auf localhost:3000
```

Tests der API (brauchen eine leere Test-Datenbank):
`cd api && TEST_DATABASE_URL=postgres://localhost/buecher_test npm test`

## Aufbau

```
index.html          App-Hülle und Navigation
css/style.css       Gestaltung (Hell/Dunkel automatisch)
js/app.js           Hash-Router
js/store.js         Datenmodell & Persistenz (localStorage)
js/account.js       Konto & Synchronisierung mit der API
js/friends.js       Freunde-API (Suche, Anfragen, Regale von Freunden)
js/config.js        Adresse der API
js/api.js           Open Library / Google Books, ISBN-Prüfung
js/recommend.js     Geschmacksprofil & Empfehlungen
js/views/*.js       Regal, Buch, Hinzufügen, Statistik, Empfehlungen, Einstellungen
server.js           Minimaler statischer Server für `npm start`
api/                Konto-API für Railway (Express + PostgreSQL)
```
