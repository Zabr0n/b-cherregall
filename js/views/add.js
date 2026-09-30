import { addBook, findDuplicate, getState, statusLabel, AUDIOBOOK, STATUS, FORMATS } from '../store.js';
import { isLoggedIn } from '../account.js';
import { lookupIsbn, searchBooks, normalizeIsbn, isValidIsbn } from '../api.js';
import { $, $$, esc, coverHtml, authorsText, toast, googleNote, parseDuration } from '../ui.js';

let tab = 'isbn';
// Gilt für alle Bücher, die auf dieser Seite hinzugefügt werden (Standard aus den Freunde-Einstellungen).
let shareNew = true;
// Kamera reicht: Wo der Browser keine verlässliche eigene Barcode-Erkennung hat (z. B. Safari auf
// dem iPhone), wird beim ersten Scan die mitgelieferte Erkennung aus js/vendor/ nachgeladen.
const canScan = !!navigator.mediaDevices?.getUserMedia;
const EAN_FORMATS = ['ean_13', 'ean_8', 'upc_a'];
// Safari meldet inzwischen einen eigenen BarcodeDetector, der bei Kamerabildern aber nichts findet.
// Die eingebaute Erkennung daher nur in Chrome/Chromium außerhalb von iOS nutzen.
const trustNative = /Chrome\/|Chromium\//.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent);

let fallbackPromise = null;
function getFallbackDetector() {
  fallbackPromise ??= (async () => {
    const { BarcodeDetector: Fallback, prepareZXingModule } = await import('../vendor/barcode-detector.js');
    const wasm = new URL('../vendor/zxing_reader.wasm', import.meta.url).href;
    await prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm : prefix + path) },
      fireImmediately: true,
    });
    return new Fallback({ formats: EAN_FORMATS });
  })().catch((e) => {
    fallbackPromise = null; // beim nächsten Versuch erneut laden
    throw e;
  });
  return fallbackPromise;
}

async function getDetector() {
  if (trustNative && 'BarcodeDetector' in window) {
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      if (supported.includes('ean_13')) {
        const native = new BarcodeDetector({ formats: EAN_FORMATS.filter((f) => supported.includes(f)) });
        native.isNative = true;
        return native;
      }
    } catch { /* dann die mitgelieferte Erkennung */ }
  }
  return getFallbackDetector();
}

const isbnFrom = (codes) =>
  codes.map((c) => c.rawValue).find((v) => /^97[89]/.test(v) && isValidIsbn(normalizeIsbn(v)));

/** Sucht in einem Bild (Foto) nach einer ISBN – auch um 90° gedreht. */
async function isbnFromImage(file) {
  const bitmap = await createImageBitmap(file);
  const detector = await getFallbackDetector();
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  for (const rotate of [false, true]) {
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = rotate ? h : w;
    canvas.height = rotate ? w : h;
    const g = canvas.getContext('2d');
    if (rotate) {
      g.translate(h, 0);
      g.rotate(Math.PI / 2);
    }
    g.drawImage(bitmap, 0, 0, w, h);
    const hit = isbnFrom(await detector.detect(canvas));
    if (hit) return hit;
  }
  return null;
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
      <label class="small photo-scan">📸 <span class="link">Oder: Foto vom Barcode aufnehmen</span>
        <input type="file" id="scan-photo" accept="image/*" capture="environment" hidden></label>
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
        const started = await startScanner(video, detector, status, (code) => {
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
  }

  // Foto statt Live-Bild: Die Kamera-App stellt selbst scharf – auf iPhones oft am zuverlässigsten.
  const photo = $('#scan-photo', form);
  photo.addEventListener('change', async () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file) return;
    $('#scan-stop', form)?.click(); // laufenden Live-Scan beenden
    const status = $('.scan-status', form);
    status.textContent = 'Foto wird ausgewertet …';
    status.hidden = false;
    try {
      const code = await isbnFromImage(file);
      status.hidden = true;
      if (!code) {
        toast('Kein Barcode erkannt – versuch ein schärferes Foto oder tipp die ISBN ein');
        return;
      }
      input.value = code;
      run(code);
    } catch (e) {
      console.error(e);
      status.hidden = true;
      toast('Das Foto konnte nicht ausgewertet werden');
    }
  });

  return () => scanner?.stop();
}

async function startScanner(video, detector, status, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.srcObject = stream;
  try {
    await video.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  // Dauer-Autofokus, wo der Browser das anbietet (sonst bleibt das Bild bei Nahaufnahmen unscharf).
  stream.getVideoTracks()[0]?.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});

  // Nur den mittleren Bereich um die rote Linie auswerten: schneller und weniger Störungen.
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const frame = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const sw = Math.round(vw * 0.9);
    const sh = Math.round(vh * 0.6);
    const scale = Math.min(1, 1280 / sw);
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  let alive = true;
  let failures = 0;
  const tick = async () => {
    if (!alive) return;
    try {
      const image = frame();
      if (image) {
        const hit = isbnFrom(await detector.detect(image));
        if (hit) return onCode(hit);
        failures = 0;
      }
    } catch (e) {
      // Streikt die eingebaute Erkennung, auf die mitgelieferte umschalten.
      if (++failures === 5 && detector.isNative) {
        console.warn('Eingebaute Barcode-Erkennung fehlgeschlagen, nutze Ersatz', e);
        try {
          detector = await getFallbackDetector();
          failures = 0;
        } catch { /* weiter versuchen */ }
      } else if (failures === 20) {
        console.error('Barcode-Erkennung fehlgeschlagen', e);
        status.textContent = 'Die Live-Erkennung klappt auf diesem Gerät nicht – nimm stattdessen ein Foto vom Barcode auf.';
      }
    }
    setTimeout(tick, 150);
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
        ${googleNote(book)}
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
  followFormat(container);
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
          toast(`„${saved.title}“ → ${statusLabel(saved)}`);
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
        <label class="field"><span class="label">Format</span>
          <select name="format"><option value="">–</option>${FORMATS.map((f) => `<option>${f}</option>`).join('')}</select>
        </label>
        <label class="field" data-print><span class="label">Seiten</span><input name="pages" type="number" min="0"></label>
        <label class="field" data-audio hidden><span class="label">Dauer <span class="muted">(Std:Min)</span></span><input name="duration" inputmode="decimal" placeholder="z. B. 12:30"></label>
      </div>
      <div class="field-row">
        <label class="field grow"><span class="label">Genres / Schlagwörter (kommagetrennt)</span><input name="subjects" placeholder="fantasy, krimi, …"></label>
        <label class="field"><span class="label">Status</span>
          <select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === 'unread' ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
      </div>
      <button class="btn btn-primary">Ins Regal stellen</button>
    </form>`;

  followFormat(panel);
  $('#manual-form', panel).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    const saved = addBook({
      title: f.get('title').trim(),
      authors: list(f.get('authors')),
      isbn: normalizeIsbn(f.get('isbn')),
      year: +f.get('year') || null,
      ...(f.get('format') === AUDIOBOOK ? { duration: parseDuration(f.get('duration')) } : { pages: +f.get('pages') || null }),
      format: f.get('format'),
      subjects: list(f.get('subjects')).map((s) => s.toLowerCase()),
      status: f.get('status'),
      friendsVisible: shareNew,
    });
    toast(`„${saved.title}“ hinzugefügt`);
    location.hash = `#/buch/${saved.id}`;
  });
}

/** Passt Status-Bezeichnungen (Gelesen ↔ Gehört) und Seiten/Dauer an das gewählte Format an. */
function followFormat(root) {
  const format = $('[name=format]', root);
  const update = () => {
    const book = { format: format.value };
    $$('[name=status] option', root).forEach((o) => (o.textContent = statusLabel(book, o.value)));
    const audio = format.value === AUDIOBOOK;
    $$('[data-print]', root).forEach((el) => (el.hidden = audio));
    $$('[data-audio]', root).forEach((el) => (el.hidden = !audio));
  };
  format.addEventListener('change', update);
  update();
}
