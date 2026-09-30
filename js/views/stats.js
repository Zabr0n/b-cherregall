import { getState, updateSettings, isAudio } from '../store.js';
import { $, $$, esc, coverHtml, starsHtml, authorsText, formatDate, formatDuration, MONTHS } from '../ui.js';

let year = new Date().getFullYear();

const yearOf = (b) => (b.finishedAt ? +b.finishedAt.slice(0, 4) : null);

export function render(main) {
  const { books, settings } = getState();
  const read = books.filter((b) => b.status === 'read');
  const years = [...new Set([new Date().getFullYear(), ...read.map(yearOf).filter(Boolean)])].sort((a, b) => b - a);
  if (!years.includes(year)) year = years[0];

  const readYear = read.filter((b) => yearOf(b) === year).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  // Seiten zählen nur bei gedruckten Büchern, bei Hörbüchern die Hördauer.
  const printYear = readYear.filter((b) => !isAudio(b));
  const audioYear = readYear.filter(isAudio);
  const pagesYear = printYear.reduce((s, b) => s + (b.pages || 0), 0);
  const minutesYear = audioYear.reduce((s, b) => s + (b.duration || 0), 0);
  const showPages = printYear.length > 0 || audioYear.length === 0;
  const rated = books.filter((b) => b.rating > 0);
  const avg = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : 0;
  const owned = books.filter((b) => b.status !== 'wishlist');
  const sub = books.filter((b) => b.status === 'unread');
  const reading = books.filter((b) => b.status === 'reading');
  const goal = settings.yearlyGoal || 0;
  const isCurrent = year === new Date().getFullYear();

  // Bücher pro Monat
  const perMonth = Array(12).fill(0);
  readYear.forEach((b) => perMonth[+b.finishedAt.slice(5, 7) - 1]++);

  // Bewertungsverteilung
  const dist = [5, 4, 3, 2, 1].map((r) => [r, rated.filter((b) => b.rating === r).length]);

  // Genres & Autor:innen der gelesenen Bücher
  const tally = (arr) => {
    const m = new Map();
    arr.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const genres = tally(read.flatMap((b) => b.subjects || [])).slice(0, 8);
  const authors = tally(read.flatMap((b) => b.authors || [])).slice(0, 6);

  main.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div><h1>Lesestatistik</h1><p class="muted">Was du gelesen hast – und wie es dir gefallen hat.</p></div>
        <label class="year-select">Jahr
          <select id="year">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </label>
      </div>

      <div class="tiles">
        <div class="tile tile-goal">
          <span class="tile-label">${audioYear.length ? (printYear.length ? 'Gelesen &amp; gehört' : 'Gehört') : 'Gelesen'} ${year}</span>
          <span class="tile-value">${readYear.length}${goal ? `<small> / ${goal}</small>` : ''}</span>
          ${goal ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${readYear.length}">
            <span style="width:${Math.min(100, (readYear.length / goal) * 100)}%"></span></div>
            <span class="tile-sub">${goalText(readYear.length, goal, isCurrent)}
              <button class="link" id="edit-goal">Ziel ändern</button></span>` : '<button class="link" id="edit-goal">Jahresziel setzen</button>'}
        </div>
        ${showPages ? `<div class="tile"><span class="tile-label">Seiten ${year}</span><span class="tile-value">${pagesYear.toLocaleString('de-DE')}</span>
          <span class="tile-sub">${printYear.length ? `Ø ${Math.round(pagesYear / printYear.length)} pro Buch` : '&nbsp;'}</span></div>` : ''}
        ${audioYear.length ? `<div class="tile"><span class="tile-label">Hördauer ${year}</span><span class="tile-value">${Math.round(minutesYear / 60).toLocaleString('de-DE')}<small> Std.</small></span>
          <span class="tile-sub">${audioYear.length} ${audioYear.length === 1 ? 'Hörbuch' : 'Hörbücher'}${minutesYear ? ` · Ø ${formatDuration(Math.round(minutesYear / audioYear.length))}` : ''}</span></div>` : ''}
        <div class="tile"><span class="tile-label">Ø Bewertung</span><span class="tile-value">${avg ? avg.toFixed(1).replace('.', ',') : '–'}</span>
          <span class="tile-sub">${rated.length} bewertete Bücher</span></div>
        <div class="tile"><span class="tile-label">Im Regal</span><span class="tile-value">${owned.length}</span>
          <span class="tile-sub">davon ${sub.length} ungelesen</span></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2 class="card-title">Bücher pro Monat ${year}</h2>
          ${monthChart(perMonth)}
        </div>
        <div class="card">
          <h2 class="card-title">Deine Bewertungen</h2>
          ${rated.length ? hbars(dist.map(([r, n]) => [starsHtml(r, { size: 'sm' }), n, `${r} Sterne`])) : '<p class="muted">Noch keine Bewertungen.</p>'}
        </div>
      </div>

      ${reading.length ? `
        <h2 class="section-title">Lese ich gerade</h2>
        <div class="mini-books">${reading.map((b) => `
          <a class="mini-book" href="#/buch/${b.id}">${coverHtml(b, 'cover-sm')}
            <span><strong>${esc(b.title)}</strong><br><span class="muted small">${esc(authorsText(b))}${b.startedAt ? ` · seit ${formatDate(b.startedAt)}` : ''}</span></span>
          </a>`).join('')}</div>` : ''}

      <h2 class="section-title">Gelesen in ${year} <span class="muted">(${readYear.length})</span></h2>
      ${readYear.length ? `<ol class="timeline">${readYear.map((b) => `
        <li>
          <span class="tl-date">${formatDate(b.finishedAt)}</span>
          <a class="tl-book" href="#/buch/${b.id}">
            ${coverHtml(b, 'cover-xs')}
            <span class="tl-main">
              <span><strong>${esc(b.title)}</strong> <span class="muted">– ${esc(authorsText(b))}</span></span>
              ${b.rating ? starsHtml(b.rating, { size: 'sm' }) : '<span class="muted small">nicht bewertet</span>'}
              ${b.review ? `<q>${esc(b.review.length > 180 ? b.review.slice(0, 180) + '…' : b.review)}</q>` : ''}
            </span>
          </a>
        </li>`).join('')}</ol>` : `<p class="muted">In ${year} noch nichts beendet. ${read.some((b) => !b.finishedAt) ? 'Gelesene Bücher ohne Enddatum tauchen hier nicht auf.' : ''}</p>`}

      <div class="grid-2">
        <div class="card">
          <h2 class="card-title">Häufigste Genres (alle gelesenen)</h2>
          ${genres.length ? hbars(genres.map(([g, n]) => [esc(g), n, g])) : '<p class="muted">Noch keine Daten.</p>'}
        </div>
        <div class="card">
          <h2 class="card-title">Meistgelesene Autor:innen</h2>
          ${authors.length ? hbars(authors.map(([a, n]) => [esc(a), n, a])) : '<p class="muted">Noch keine Daten.</p>'}
        </div>
      </div>
    </section>
    <div class="tooltip" id="tip" hidden></div>`;

  $('#year', main).addEventListener('change', (e) => {
    year = +e.target.value;
    render(main);
  });
  $('#edit-goal', main)?.addEventListener('click', () => {
    const v = prompt('Wie viele Bücher möchtest du pro Jahr lesen?', goal || 24);
    if (v === null) return;
    const n = Math.max(0, parseInt(v, 10) || 0);
    updateSettings({ yearlyGoal: n });
    render(main);
  });

  // Tooltips für Balken
  const tip = $('#tip', main);
  $$('[data-tip]', main).forEach((el) => {
    el.addEventListener('pointerenter', () => {
      tip.textContent = el.dataset.tip;
      tip.hidden = false;
    });
    el.addEventListener('pointermove', (e) => {
      tip.style.left = `${e.clientX}px`;
      tip.style.top = `${e.clientY}px`;
    });
    el.addEventListener('pointerleave', () => (tip.hidden = true));
  });
}

function goalText(n, goal, isCurrent) {
  if (n >= goal) return 'Ziel erreicht 🎉';
  if (!isCurrent) return `${goal - n} fehlten zum Ziel`;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const expected = Math.floor(((now - start) / (365 * 864e5)) * goal);
  const diff = n - expected;
  return diff >= 0 ? `${diff ? `${diff} vor dem Plan` : 'Genau im Plan'}` : `${-diff} hinter dem Plan`;
}

function monthChart(values) {
  const W = 480, H = 180, pad = { l: 24, r: 4, t: 12, b: 22 };
  const max = Math.max(2, ...values);
  const step = (W - pad.l - pad.r) / 12;
  const bw = Math.min(26, step - 8);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];
  const barPath = (x, top, bottom, r) => {
    r = Math.min(r, (bottom - top), bw / 2);
    return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${bottom}Z`;
  };
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gelesene Bücher pro Monat">
      ${ticks.map((t) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>
        <text class="axis" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      ${values.map((v, i) => {
        const x = pad.l + i * step + (step - bw) / 2;
        return `<g data-tip="${MONTHS[i]}: ${v} ${v === 1 ? 'Buch' : 'Bücher'}" class="hit">
          <rect x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" fill="transparent"/>
          ${v ? `<path class="bar" d="${barPath(x, y(v), y(0), 4)}"/>` : ''}
          <text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${MONTHS[i]}</text>
        </g>`;
      }).join('')}
    </svg>`;
}

function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return `<div class="hbars">${rows.map(([label, n, tip]) => `
    <div class="hbar" data-tip="${esc(tip)}: ${n}">
      <span class="hbar-label">${label}</span>
      <span class="hbar-track">${n ? `<span class="hbar-fill" style="width:${(n / max) * 100}%"></span>` : ''}</span>
      <span class="hbar-value">${n}</span>
    </div>`).join('')}</div>`;
}
