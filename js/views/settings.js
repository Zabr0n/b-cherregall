import { getState, updateSettings, exportJSON, importJSON, resetDismissed, addBook } from '../store.js';
import { $, toast } from '../ui.js';
import { DEMO_BOOKS } from '../demo.js';
import { isLoggedIn } from '../account.js';

export function render(main) {
  const { settings, books, dismissed } = getState();

  main.innerHTML = `
    <section class="page narrow">
      <h1>Einstellungen</h1>

      <div class="card">
        <h2 class="card-title">Lesen</h2>
        <label class="field"><span class="label">Jahresziel (Bücher)</span>
          <input type="number" id="goal" min="0" value="${settings.yearlyGoal}"></label>
        <label class="check"><input type="checkbox" id="german" ${settings.germanRecs ? 'checked' : ''}>
          Nur deutschsprachige Bücher empfehlen</label>
        ${dismissed.length ? `<p class="small">${dismissed.length} Empfehlung(en) ausgeblendet.
          <button class="link" id="undismiss">Wieder anzeigen</button></p>` : ''}
      </div>

      <div class="card">
        <h2 class="card-title">Daten</h2>
        <p class="muted small">${isLoggedIn()
          ? `Deine Bibliothek (${books.length} Bücher) wird in deinem <a href="#/konto">Konto</a> gespeichert
             und auf all deinen Geräten synchronisiert. Eine zusätzliche Sicherung schadet trotzdem nicht.`
          : `Deine Bibliothek (${books.length} Bücher) wird nur lokal in diesem Browser gespeichert.
             <a href="#/konto">Melde dich an</a>, um sie in einem Konto zu speichern, oder erstelle regelmäßig eine Sicherung.`}</p>
        <div class="row wrap">
          <button class="btn btn-primary" id="export">Sicherung herunterladen</button>
          <label class="btn">Sicherung importieren<input type="file" id="import" accept="application/json,.json" hidden></label>
          <label class="check"><input type="checkbox" id="replace"> Bestehende Daten ersetzen</label>
        </div>
        <div class="row wrap">
          <button class="btn" id="demo">Beispieldaten hinzufügen</button>
          <button class="btn btn-danger" id="wipe">Alle Daten löschen</button>
        </div>
      </div>

      <p class="muted small">Buchdaten und Cover: <a href="https://openlibrary.org" target="_blank" rel="noopener">Open Library</a>
        und Google Books.</p>
    </section>`;

  $('#goal', main).addEventListener('change', (e) => {
    updateSettings({ yearlyGoal: Math.max(0, parseInt(e.target.value, 10) || 0) });
    toast('Jahresziel gespeichert');
  });
  $('#german', main).addEventListener('change', (e) => {
    updateSettings({ germanRecs: e.target.checked });
    toast('Gespeichert');
  });
  $('#undismiss', main)?.addEventListener('click', () => {
    resetDismissed();
    render(main);
  });

  $('#export', main).addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `buecherregal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#import', main).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const replace = $('#replace', main).checked;
    if (replace && !confirm('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')) return;
    try {
      const n = importJSON(await file.text(), replace ? 'replace' : 'merge');
      toast(`${n} Bücher importiert`);
      render(main);
    } catch (err) {
      alert(`Import fehlgeschlagen: ${err.message}`);
    }
    e.target.value = '';
  });

  $('#demo', main).addEventListener('click', () => {
    DEMO_BOOKS.forEach((b) => addBook(b));
    toast(`${DEMO_BOOKS.length} Beispielbücher hinzugefügt`);
    render(main);
  });

  $('#wipe', main).addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Bücher, Bewertungen und Rezensionen löschen? Das kann nicht rückgängig gemacht werden.')) return;
    importJSON(JSON.stringify({ books: [] }), 'replace');
    toast('Alle Daten gelöscht');
    render(main);
  });
}
