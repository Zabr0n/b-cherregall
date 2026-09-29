// Startseite: erklärt kurz, was das Bücherregal kann, und führt zu Registrierung oder Regal.

import { isLoggedIn } from '../account.js';
import { getState } from '../store.js';
import { esc } from '../ui.js';

// Buchrücken für das Regal im Kopfbereich: [Titel, Farbton, Höhe in %, schräg?]
const SPINES = [
  ['Momo', 350, 88], ['Der Hobbit', 95, 96], ['1984', 12, 78], ['Stolz und Vorurteil', 320, 92],
  ['Das Parfum', 140, 84], ['Der Schwarm', 260, 98], ['Die Physiker', 28, 74, true],
];

const FEATURES = [
  ['📷', 'Schnell erfasst', 'ISBN eintippen, Barcode mit der Handykamera scannen oder nach dem Titel suchen – Cover und Buchdaten kommen automatisch.'],
  ['⭐', 'Bewerten & rezensieren', 'Vergib Sterne, schreib ein paar Sätze dazu und halte fest, wann du ein Buch begonnen und beendet hast.'],
  ['📊', 'Deine Lesestatistik', 'Jahresziel, gelesene Seiten, Lieblingsgenres und eine Zeitleiste mit allem, was du gelesen hast.'],
  ['✨', 'Passende Empfehlungen', 'Aus deinen Bewertungen entsteht ein Geschmacksprofil – daraus kommen Vorschläge, jeweils mit Begründung.'],
  ['👥', 'Freunde', 'Schau in die Regale deiner Freunde, lies ihre Rezensionen und setz dir gute Tipps direkt auf die Wunschliste.'],
  ['🔒', 'Du entscheidest', 'Für jedes Buch legst du fest, ob Freunde es sehen. Standort und „verliehen an“ bleiben immer privat.'],
];

const STEPS = [
  ['Konto anlegen', 'Benutzername, E-Mail, Passwort – fertig. Deine Bücher sind dann auf all deinen Geräten da.'],
  ['Bücher erfassen', 'Einfach das Regal entlang scannen. Status, Sterne und Rezension kannst du jederzeit ergänzen.'],
  ['Freunde finden', 'Such nach Freunden, schick eine Anfrage und entdeckt gegenseitig eure Lieblingsbücher.'],
];

const FAQ = [
  ['Was kostet das?', 'Nichts. Das Bücherregal ist kostenlos.'],
  ['Brauche ich ein Konto?', 'Nein. Ohne Konto werden deine Bücher nur in diesem Browser gespeichert. Mit Konto sind sie gesichert, auf allen Geräten verfügbar und du kannst Freunde hinzufügen.'],
  ['Wer sieht meine Bücher?', 'Nur Menschen, deren Freundschaftsanfrage du angenommen hast – und auch nur die Bücher, die du für Freunde freigegeben hast.'],
  ['Geht das auch für E-Books?', 'Gedacht ist es für deine gedruckten Bücher im Regal, aber du kannst natürlich jedes Buch eintragen.'],
];

export function render(main) {
  const known = isLoggedIn() || getState().books.length > 0;
  const primary = isLoggedIn()
    ? '<a class="btn btn-primary btn-lg" href="#/regal">Zu meinem Regal</a>'
    : '<a class="btn btn-primary btn-lg" href="#/konto/registrieren">Kostenlos registrieren</a>';
  const secondary = isLoggedIn()
    ? '<a class="btn btn-lg" href="#/freunde">Freunde finden</a>'
    : `<a class="btn btn-lg" href="#/regal">${known ? 'Weiter ohne Konto' : 'Ohne Konto ausprobieren'}</a>`;

  main.innerHTML = `
    <div class="landing">
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">Dein digitales Bücherregal</p>
          <h1>Alle deine Bücher.<br>Ein Regal. Überall dabei.</h1>
          <p class="lead">Erfasse deine gedruckten Bücher in Sekunden, bewerte sie, schreib kurze Rezensionen
            und entdecke, was deine Freunde gerade lesen.</p>
          <div class="row wrap">${primary}${secondary}</div>
          ${isLoggedIn() ? '' : '<p class="small muted">Schon dabei? <a href="#/konto">Anmelden</a></p>'}
        </div>
        <div class="hero-shelf" aria-hidden="true">
          <div class="spines">${SPINES.map(([t, hue, h, tilt]) => `
            <span class="spine${tilt ? ' tilt' : ''}" style="--hue:${hue};--h:${h}%"><span>${esc(t)}</span></span>`).join('')}
          </div>
          <div class="plank"></div>
          <div class="hero-card">
            <strong>Der Hobbit</strong>
            <span class="stars sm"><span class="star on">★</span><span class="star on">★</span><span class="star on">★</span><span class="star on">★</span><span class="star on">★</span></span>
            <span class="small">„Mein liebstes Abenteuer – jedes Jahr wieder.“</span>
          </div>
        </div>
      </section>

      <section class="landing-section">
        <h2>Was du damit machen kannst</h2>
        <div class="feature-grid">${FEATURES.map(([icon, title, text]) => `
          <div class="feature card">
            <span class="feature-icon" aria-hidden="true">${icon}</span>
            <h3>${title}</h3>
            <p class="muted">${text}</p>
          </div>`).join('')}
        </div>
      </section>

      <section class="landing-section">
        <h2>So funktioniert's</h2>
        <ol class="steps">${STEPS.map(([title, text]) => `
          <li><h3>${title}</h3><p class="muted">${text}</p></li>`).join('')}
        </ol>
      </section>

      <section class="landing-section narrow-section">
        <h2>Häufige Fragen</h2>
        ${FAQ.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p class="muted">${a}</p></details>`).join('')}
      </section>

      <section class="landing-cta card">
        <h2>Bereit für dein Regal?</h2>
        <p class="muted">In zwei Minuten eingerichtet – dein erstes Buch ist nur einen Scan entfernt.</p>
        <div class="row center">${primary}</div>
      </section>
    </div>`;
}
