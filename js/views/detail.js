import { getState, getBook, updateBook, removeBook, today, STATUS, FORMATS } from '../store.js';
import { $, $$, esc, coverHtml, starsHtml, authorsText, toast } from '../ui.js';
import { cleanSubjects, findCover, editionCovers } from '../api.js';
import { refresh as refreshCover } from '../covers.js';

const REVIEW_MAX = 1000;

export function render(main, id) {
  const b = getBook(id);
  if (!b) {
    main.innerHTML = `<section class="page"><p>Dieses Buch gibt es nicht (mehr). <a href="#/regal">Zurück zum Regal</a></p></section>`;
    return;
  }

  main.innerHTML = `
    <section class="page detail">
      <a class="back" href="#/regal">← Regal</a>
      <div class="detail-grid">
        <aside class="detail-cover">
          ${coverHtml(b, 'cover-lg')}
          <button class="btn btn-sm" id="pick-cover">Anderes Cover wählen</button>
          <dl class="facts">
            ${b.year ? `<dt>Jahr</dt><dd>${b.year}</dd>` : ''}
            ${b.pages ? `<dt>Seiten</dt><dd>${b.pages}</dd>` : ''}
            ${b.publisher ? `<dt>Verlag</dt><dd>${esc(b.publisher)}</dd>` : ''}
            ${b.isbn ? `<dt>ISBN</dt><dd>${esc(b.isbn)}</dd>` : ''}
            <dt>Im Regal seit</dt><dd>${new Date(b.addedAt).toLocaleDateString('de-DE')}</dd>
          </dl>
          ${b.workKey ? `<a class="small" href="https://openlibrary.org${esc(b.workKey)}" target="_blank" rel="noopener">Bei Open Library ansehen ↗</a>` : ''}
        </aside>

        <div class="detail-main">
          <h1>${esc(b.title)}</h1>
          <p class="author">${esc(authorsText(b))}</p>

          <div class="field">
            <span class="label">Status</span>
            <div class="seg seg-wide" role="radiogroup" aria-label="Lesestatus">
              ${Object.entries(STATUS).map(([k, label]) => `
                <button type="button" role="radio" data-status="${k}" aria-checked="${b.status === k}" class="${b.status === k ? 'active' : ''}">${label}</button>`).join('')}
            </div>
          </div>

          <div class="field">
            <span class="label">Deine Bewertung</span>
            <div id="rating">${starsHtml(b.rating, { interactive: true, size: 'lg' })}</div>
          </div>

          <div class="field-row">
            <label class="field">
              <span class="label">Begonnen</span>
              <input type="date" name="startedAt" value="${esc(b.startedAt)}">
            </label>
            <label class="field">
              <span class="label">Beendet</span>
              <input type="date" name="finishedAt" value="${esc(b.finishedAt)}">
            </label>
          </div>

          <label class="field">
            <span class="label">Kurzrezension <span class="muted" id="rev-count"></span></span>
            <textarea name="review" rows="5" maxlength="${REVIEW_MAX}" placeholder="Was hat dir gefallen, was nicht? Ein paar Sätze reichen.">${esc(b.review)}</textarea>
          </label>

          <h2 class="section-title">Im Regal</h2>
          <div class="field-row">
            <label class="field">
              <span class="label">Standort</span>
              <input name="location" value="${esc(b.location)}" placeholder="z. B. Wohnzimmer, Regal 2" list="locations">
            </label>
            <label class="field">
              <span class="label">Format</span>
              <select name="format">
                <option value="">–</option>
                ${FORMATS.map((f) => `<option ${b.format === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="label">Verliehen an</span>
              <input name="lentTo" value="${esc(b.lentTo)}" placeholder="Name">
            </label>
          </div>

          <label class="field">
            <span class="label">Genres &amp; Schlagwörter <span class="muted">(kommagetrennt – fließen in die Empfehlungen ein)</span></span>
            <input name="subjects" value="${esc((b.subjects || []).join(', '))}" placeholder="fantasy, magic, …">
          </label>

          <details class="edit-meta">
            <summary>Buchdaten bearbeiten</summary>
            <div class="field-row">
              <label class="field grow"><span class="label">Titel</span><input name="title" value="${esc(b.title)}" required></label>
              <label class="field grow"><span class="label">Autor:innen (kommagetrennt)</span><input name="authors" value="${esc((b.authors || []).join(', '))}"></label>
            </div>
            <div class="field-row">
              <label class="field"><span class="label">Jahr</span><input name="year" type="number" value="${b.year ?? ''}"></label>
              <label class="field"><span class="label">Seiten</span><input name="pages" type="number" min="0" value="${b.pages ?? ''}"></label>
              <label class="field"><span class="label">Verlag</span><input name="publisher" value="${esc(b.publisher)}"></label>
              <label class="field"><span class="label">ISBN</span><input name="isbn" value="${esc(b.isbn)}"></label>
            </div>
            <label class="field"><span class="label">Cover-URL</span><input name="coverUrl" type="url" value="${esc(b.coverUrl)}"></label>
          </details>

          <div class="row between">
            <span class="muted small" id="saved">Änderungen werden automatisch gespeichert.</span>
            <button class="btn btn-danger" id="delete">Aus dem Regal entfernen</button>
          </div>
        </div>
      </div>
      <datalist id="locations"></datalist>
    </section>
    <dialog class="cover-dialog" id="cover-dialog">
      <div class="row between"><h2>Cover wählen</h2><button class="btn btn-ghost" id="cover-close" aria-label="Schließen">✕</button></div>
      <p class="muted small">Wähle den Einband deiner Ausgabe. Deutsche Ausgaben stehen vorne.</p>
      <div id="cover-options"></div>
    </dialog>`;

  // Bereits benutzte Standorte als Vorschläge anbieten.
  const locs = [...new Set(getState().books.map((x) => x.location).filter(Boolean))];
  $('#locations', main).innerHTML = locs.map((l) => `<option value="${esc(l)}">`).join('');

  const saved = $('#saved', main);
  const flash = () => {
    saved.textContent = 'Gespeichert ✓';
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (saved.textContent = 'Änderungen werden automatisch gespeichert.'), 1500);
  };
  const save = (patch) => {
    updateBook(id, patch);
    flash();
  };

  // Status
  $$('[data-status]', main).forEach((btn) =>
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      const patch = { status };
      if (status === 'reading' && !b.startedAt) patch.startedAt = today();
      if (status === 'read' && !b.finishedAt) patch.finishedAt = today();
      save(patch);
      if (patch.startedAt) $('[name=startedAt]', main).value = patch.startedAt;
      if (patch.finishedAt) $('[name=finishedAt]', main).value = patch.finishedAt;
      $$('[data-status]', main).forEach((x) => {
        x.classList.toggle('active', x === btn);
        x.setAttribute('aria-checked', x === btn);
      });
      if (status === 'read' && !b.rating) toast('Fertig gelesen! Wie viele Sterne gibst du?');
    }),
  );

  // Bewertung – erneuter Klick auf denselben Stern entfernt die Bewertung.
  $('#rating', main).addEventListener('click', (e) => {
    const star = e.target.closest('[data-rate]');
    if (!star) return;
    const r = +star.dataset.rate;
    const rating = b.rating === r ? 0 : r;
    save({ rating });
    $('#rating', main).innerHTML = starsHtml(rating, { interactive: true, size: 'lg' });
  });

  // Rezension mit Zeichenzähler, gespeichert nach kurzer Tipppause.
  const review = $('[name=review]', main);
  const count = $('#rev-count', main);
  const updateCount = () => (count.textContent = `${review.value.length}/${REVIEW_MAX}`);
  updateCount();
  let t;
  review.addEventListener('input', () => {
    updateCount();
    clearTimeout(t);
    t = setTimeout(() => save({ review: review.value.trim() }), 500);
  });

  // Alle übrigen Felder speichern beim Verlassen.
  const parsers = {
    subjects: (v) => cleanSubjects(v.split(','), 40),
    authors: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
    year: (v) => (v ? +v : null),
    pages: (v) => (v ? +v : null),
    title: (v) => v.trim() || b.title,
  };
  $$('input[name], select[name]', main).forEach((input) =>
    input.addEventListener('change', () => {
      const parse = parsers[input.name] || ((v) => v.trim());
      save({ [input.name]: parse(input.value) });
      if (['title', 'authors', 'coverUrl'].includes(input.name)) render(main, id);
    }),
  );

  // Cover-Auswahl aus allen Ausgaben des Werks
  const dialog = $('#cover-dialog', main);
  $('#cover-close', main).addEventListener('click', () => dialog.close());
  $('#pick-cover', main).addEventListener('click', async () => {
    const box = $('#cover-options', main);
    box.innerHTML = `<p class="muted loading">Suche Ausgaben …</p>`;
    dialog.showModal();
    try {
      if (!b.workKey) {
        const found = await findCover(b);
        if (found) updateBook(id, { workKey: found.workKey });
      }
      const covers = b.workKey ? await editionCovers(b.workKey) : [];
      if (!covers.length) {
        box.innerHTML = `<p class="muted">Keine weiteren Cover gefunden. Unter „Buchdaten bearbeiten“ kannst du eine eigene Cover-URL eintragen.</p>`;
        return;
      }
      box.innerHTML = `<div class="cover-options">${covers.map((c, i) => `
        <button class="cover-option ${c.url === b.coverUrl ? 'active' : ''}" data-pick="${i}" title="${esc(c.title || '')}${c.year ? ` (${c.year})` : ''}">
          <img src="${esc(c.url)}" alt="" loading="lazy" onload="if(this.naturalWidth<10)this.parentElement.remove()" onerror="this.parentElement.remove()">
          <span>${c.german ? 'DE' : ''}${c.year ? ` ${c.year}` : ''}</span>
        </button>`).join('')}</div>`;
      $$('[data-pick]', box).forEach((btn) =>
        btn.addEventListener('click', () => {
          save({ coverUrl: covers[+btn.dataset.pick].url, coverTried: true });
          refreshCover(id);
          $('[name=coverUrl]', main).value = b.coverUrl;
          dialog.close();
        }),
      );
    } catch (e) {
      console.error(e);
      box.innerHTML = `<p class="error">Die Ausgaben konnten nicht geladen werden.</p>`;
    }
  });

  $('#delete', main).addEventListener('click', () => {
    if (!confirm(`„${b.title}“ wirklich aus dem Regal entfernen?`)) return;
    removeBook(id);
    toast('Buch entfernt');
    location.hash = '#/regal';
  });

  return () => {
    // Noch nicht gespeicherte Rezension beim Verlassen sichern.
    clearTimeout(t);
    if (getBook(id) && review.value.trim() !== (getBook(id).review || '')) updateBook(id, { review: review.value.trim() });
  };
}
