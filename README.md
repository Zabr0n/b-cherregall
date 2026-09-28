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

## Daten

Alles liegt nur im `localStorage` deines Browsers. Es gibt kein Konto und keinen Server,
der deine Daten sieht. Buchdaten werden von [Open Library](https://openlibrary.org) und
Google Books abgefragt. Erstelle regelmäßig eine Sicherung unter ⚙ Einstellungen.

## Aufbau

```
index.html          App-Hülle und Navigation
css/style.css       Gestaltung (Hell/Dunkel automatisch)
js/app.js           Hash-Router
js/store.js         Datenmodell & Persistenz (localStorage)
js/api.js           Open Library / Google Books, ISBN-Prüfung
js/recommend.js     Geschmacksprofil & Empfehlungen
js/views/*.js       Regal, Buch, Hinzufügen, Statistik, Empfehlungen, Einstellungen
server.js           Minimaler statischer Server für `npm start`
```
