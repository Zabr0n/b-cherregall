import { addBook, findDuplicate, getState, STATUS, FORMATS } from '../store.js';
import { isLoggedIn } from '../account.js';
import { lookupIsbn, searchBooks, normalizeIsbn, isValidIsbn } from '../api.js';
import { $, $$, esc, coverHtml, authorsText, toast } from '../ui.js';

let tab = 'isbn';
// Gilt für alle Bücher, die auf dieser Seite hinzugefügt werden (Standard aus den Freunde-Einstellungen).
let shareNew = true;
// Kamera reicht: Wo der Browser keinen eigenen BarcodeDetector hat (z. B. Safari auf dem iPhone),
// wird beim ersten Scan die mitgelieferte Erkennung aus js/vendor/ nachgeladen.
const canScan = !!navigator.mediaDevices?.getUserMedia;
const EAN_FORMATS = ['ean_13', 'ean_8', 'upc_a'];

let detectorPromise = null;
function getDetector() {
  detectorPromise ??= (async () => {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported.includes('ean_13')) return new BarcodeDetector({ formats: EAN_FORMATS.filter((f) => supported.includes(f)) });
      } catch { /* dann die mitgelieferte Erkennung */ }
    }
    const { BarcodeDetector: Fallback, prepareZXingModule } = await import('../vendor/barcode-detector.js');
    const wasm = new URL('../vendor/zxing_reader.wasm', import.meta.url).href;
    await prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm : prefix + path) },
      fireImmediately: true,
    });
    return new Fallback({ formats: EAN_FORMATS });
  })().catch((e) => {
    detectorPromise = null; // beim nächsten Versuch erneut laden
    throw e;
  });
  return detectorPromise;
}

export function render(main) {
  shareNew = getState().settings.shareByDefault !== false;
  main.innerHTML = `
    <section class="page narrow">
      <h1>Buch hinzufügen</h1>
      <div class="tabs" role="tablist">
        <button role="tab" class="tab" data-tab="isbn">ISBN / Barcode</button>
        <button role="tab" class="tab" data-tab="search">Titelsuche</button>
        <button role="tab" class="tab" data-tab="manual">Manuell</button>
      </div>
      ${isLoggedIn() ? `<label class="check share-toggle">
        <input type="checkbox" id="share-new" ${shareNew ? 'checked' : ''}>
        <span>👥 Für Freunde sichtbar <span class="muted small">– ausschalten, wenn das Buch nur dich etwas angeht</span></span>
      </label>` : ''}
      <div id="panel"></div>
    </section>`;

  let stopScan = null;
  const show = (name) => {
    tab = name;
    stopScan?.();
    stopScan = null;
    $$('[data-tab]', main).forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === name);
      b.setAttribute('aria-selected', b.dataset.tab === name);
    });
    const panel = $('#panel', main);
    if (name === 'isbn') stopScan = isbnPanel(panel);
    if (name === 'search') searchPanel(panel);
    if (name === 'manual') manualPanel(panel);
  };
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show(tab);
  $('#share-new', main)?.addEventListener('change', (e) => (shareNew = e.target.checked));

  return () => stopScan?.();
}

// ---------- ISBN ----------

function isbnPanel(panel) {
  panel.innerHTML = `
    <form class="card" id="isbn-form">
      <label class="field">
        <span class="label">ISBN (10 oder 13 Stellen – steht auf der Rückseite über dem Barcode)</span>
        <div class="row">
          <input name="isbn" inputmode="numeric" autocomplete="off" placeholder="978-3-…" required autofocus>
          <button class="btn btn-primary">Suchen</button>
          ${canScan ? '<button type="button" class="btn" id="scan">📷 Scannen</button>' : ''}
        </div>
      </label>
      ${canScan ? '' : '<p class="muted small">Tipp: Auf dem Smartphone kannst du den Barcode auf der Buchrückseite direkt mit der Kamera scannen.</p>'}
      <p class="muted small scan-status" hidden></p>
      <div class="scanner" hidden><video playsinline muted></video><div class="scan-line"></div>
        <button type="button" class="btn" id="scan-stop">Scannen beenden</button></div>
    </form>
    <div id="result"></div>`;

  const form = $('#isbn-form', panel);
  const input = $('[name=isbn]', form);
  let scanner = null;

  const run = async (raw) => {
    const isbn = normalizeIsbn(raw);
    const result = $('#result', panel);
    if (!isValidIsbn(isbn)) {
      result.innerHTML = `<p class="error">„${esc(raw)}“ ist keine gültige ISBN. Bitte prüfe die Ziffern.</p>`;
      return;
    }
    result.innerHTML = `<p class="muted loading">Suche Buchdaten …</p>`;
    try {
      const book = await lookupIsbn(isbn);
      if (!book) {
        result.innerHTML = `<div class="card"><p>Zu dieser ISBN wurde nichts gefunden.</p>
          <button class="btn" id="to-manual">Manuell erfassen</button></div>`;
        $('#to-manual', result).addEventListener('click', () => {
          tab = 'manual';
          $('[data-tab=manual]').click();
          $('[name=isbn]').value = isbn;
        });
        return;
      }
      preview(result, book);
    } catch (e) {
      console.error(e);
      result.innerHTML = `<p class="error">Die Buchdatenbank ist gerade nicht erreichbar. Versuch es gleich nochmal oder erfasse das Buch manuell.</p>`;
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
  });

  if (canScan) {
    const box = $('.scanner', form);
    const video = $('video', box);
    const status = $('.scan-status', form);
    let attempt = 0; // erkennt, ob während des Startens schon wieder gestoppt wurde
    const stop = () => {
      attempt++;
      scanner?.stop();
      scanner = null;
      box.hidden = true;
      status.hidden = true;
    };
    $('#scan', form).addEventListener('click', async () => {
      stop();
      const mine = attempt;
      status.textContent = 'Scanner wird vorbereitet …';
      status.hidden = false;
      try {
        const detector = await getDetector();
        if (mine !== attempt) return;
        box.hidden = false;
        status.textContent = 'Halte den Barcode auf der Buchrückseite vor die Kamera.';
        const started = await startScanner(video, detector, (code) => {
          stop();
          input.value = code;
          navigator.vibrate?.(80);
          run(code);
        });
        if (mine !== attempt) started.stop();
        else scanner = started;
      } catch (e) {
        console.error(e);
        if (mine !== attempt) return;
        stop();
        toast(e?.name === 'NotAllowedError' ? 'Kamerazugriff wurde nicht erlaubt' : 'Scannen ist gerade nicht möglich – gib die ISBN einfach ein');
      }
    });
    $('#scan-stop', form).addEventListener('click', stop);
    return stop;
  }
}

async function startScanner(video, detector, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  try {
    await video.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  let alive = true;
  const tick = async () => {
    if (!alive) return;
    try {
      const codes = await detector.detect(video);
      const hit = codes.find((c) => isValidIsbn(normalizeIsbn(c.rawValue)) && /^97[89]/.test(c.rawValue));
      if (hit) return onCode(hit.rawValue);
    } catch { /* nächster Frame */ }
    setTimeout(tick, 200);
  };
  tick();
  return {
    stop() {
      alive = false;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Vorschau eines gefundenen Buchs mit Status-Auswahl. */
function preview(container, book) {
  const dup = findDuplicate(book);
  container.innerHTML = `
    <div class="card preview">
      ${coverHtml(book, 'cover-md')}
      <div class="grow">
        <h2>${esc(book.title)}</h2>
        <p class="author">${esc(authorsText(book))}</p>
        <p class="muted small">${[book.year, book.publisher, book.pages && `${book.pages} Seiten`].filter(Boolean).map(esc).join(' · ')}</p>
        ${book.subjects?.length ? `<div class="chips">${book.subjects.slice(0, 6).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
        ${dup ? `<p class="warn">Dieses Buch steht schon in deinem Regal: <a href="#/buch/${dup.id}">${esc(dup.title)}</a></p>` : ''}
        <div class="field-row">
          <label class="field"><span class="label">Status</span>
            <select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === 'unread' ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </label>
          <label class="field"><span class="label">Format</span>
            <select name="format"><option value="">–</option>${FORMATS.map((f) => `<option>${f}</option>`).join('')}</select>
          </label>
        </div>
        <div class="row">
          <button class="btn btn-primary" id="add">${dup ? 'Trotzdem hinzufügen' : 'Ins Regal stellen'}</button>
        </div>
      </div>
    </div>`;
  $('#add', container).addEventListener('click', () => {
    const saved = addBook({ ...book, status: $('[name=status]', container).value, format: $('[name=format]', container).value, friendsVisible: shareNew });
    toast(`„${saved.title}“ hinzugefügt`);
    location.hash = `#/buch/${saved.id}`;
  });
}

// ---------- Titelsuche ----------

function searchPanel(panel) {
  panel.innerHTML = `
    <form class="card" id="search-form">
      <label class="field"><span class="label">Titel und/oder Autor:in</span>
        <div class="row">
          <input name="q" placeholder="z. B. Momo Michael Ende" required autofocus>
          <button class="btn btn-primary">Suchen</button>
        </div>
      </label>
    </form>
    <div id="results"></div>`;

  $('#search-form', panel).addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    const out = $('#results', panel);
    out.innerHTML = `<p class="muted loading">Suche …</p>`;
    try {
      const results = await searchBooks(q, { limit: 15 });
      if (!results.length) {
        out.innerHTML = `<p class="muted">Nichts gefunden. Versuch einen anderen Suchbegriff oder erfasse das Buch manuell.</p>`;
        return;
      }
      out.innerHTML = `<div class="results">${results.map((b, i) => {
        const dup = findDuplicate(b);
        return `
          <div class="result">
            ${coverHtml(b, 'cover-sm')}
            <div class="grow">
              <strong>${esc(b.title)}</strong>
              <span class="muted">${esc(authorsText(b))}${b.year ? ` · ${b.year}` : ''}</span>
              ${dup ? `<a class="small" href="#/buch/${dup.id}">✓ schon im Regal</a>` : ''}
            </div>
            <div class="result-actions">
              <button class="btn btn-sm btn-primary" data-add="${i}" data-status="unread">Ins Regal</button>
              <button class="btn btn-sm" data-add="${i}" data-status="read">Gelesen</button>
              <button class="btn btn-sm btn-ghost" data-add="${i}" data-status="wishlist">♡ Wunschliste</button>
            </div>
          </div>`;
      }).join('')}</div>`;
      $$('[data-add]', out).forEach((btn) =>
        btn.addEventListener('click', () => {
          const book = results[+btn.dataset.add];
          const saved = addBook({ ...book, status: btn.dataset.status, friendsVisible: shareNew });
          toast(`„${saved.title}“ → ${STATUS[saved.status]}`);
          if (saved.status === 'read') location.hash = `#/buch/${saved.id}`;
          else btn.closest('.result-actions').innerHTML = `<a class="btn btn-sm" href="#/buch/${saved.id}">Öffnen</a>`;
        }),
      );
    } catch (err) {
      console.error(err);
      out.innerHTML = `<p class="error">Die Suche ist gerade nicht erreichbar.</p>`;
    }
  });
}

// ---------- Manuell ----------

function manualPanel(panel) {
  panel.innerHTML = `
    <form class="card" id="manual-form">
      <div class="field-row">
        <label class="field grow"><span class="label">Titel *</span><input name="title" required autofocus></label>
        <label class="field grow"><span class="label">Autor:innen (kommagetrennt)</span><input name="authors"></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="label">ISBN</span><input name="isbn"></label>
        <label class="field"><span class="label">Jahr</span><input name="year" type="number"></label>
        <label class="field"><span class="label">Seiten</span><input name="pages" type="number" min="0"></label>
      </div>
      <div class="field-row">
        <label class="field grow"><span class="label">Genres / Schlagwörter (kommagetrennt)</span><input name="subjects" placeholder="fantasy, krimi, …"></label>
        <label class="field"><span class="label">Status</span>
          <select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === 'unread' ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
      </div>
      <button class="btn btn-primary">Ins Regal stellen</button>
    </form>`;

  $('#manual-form', panel).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    const saved = addBook({
      title: f.get('title').trim(),
      authors: list(f.get('authors')),
      isbn: normalizeIsbn(f.get('isbn')),
      year: +f.get('year') || null,
      pages: +f.get('pages') || null,
      subjects: list(f.get('subjects')).map((s) => s.toLowerCase()),
      status: f.get('status'),
      friendsVisible: shareNew,
    });
    toast(`„${saved.title}“ hinzugefügt`);
    location.hash = `#/buch/${saved.id}`;
  });
}
