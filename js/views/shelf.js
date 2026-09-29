import { getState, addBook, isFriendsVisible, STATUS } from '../store.js';
import { isLoggedIn } from '../account.js';
import { $, $$, esc, coverHtml, starsHtml, authorsText, formatDate, toast } from '../ui.js';
import { DEMO_BOOKS } from '../demo.js';

// Filter/Sortierung bleiben beim Hin- und Herwechseln erhalten.
const ui = { filter: 'owned', q: '', sort: 'added', mode: 'shelf' };

const FILTERS = [
  ['owned', 'Alle', (b) => b.status !== 'wishlist'],
  ['read', 'Gelesen', (b) => b.status === 'read'],
  ['reading', 'Lese ich', (b) => b.status === 'reading'],
  ['unread', 'Ungelesen', (b) => b.status === 'unread'],
  ['wishlist', 'Wunschliste', (b) => b.status === 'wishlist'],
  ['lent', 'Verliehen', (b) => !!b.lentTo],
];

const firstAuthor = (b) => ((b.authors || [])[0] || '').split(' ').pop();
const SORTS = {
  added: ['Zuletzt hinzugefügt', (a, b) => b.addedAt.localeCompare(a.addedAt)],
  title: ['Titel', (a, b) => a.title.localeCompare(b.title, 'de')],
  author: ['Autor:in', (a, b) => firstAuthor(a).localeCompare(firstAuthor(b), 'de') || a.title.localeCompare(b.title, 'de')],
  rating: ['Bewertung', (a, b) => b.rating - a.rating || a.title.localeCompare(b.title, 'de')],
  finished: ['Zuletzt gelesen', (a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || '')],
};

export function render(main) {
  const { books } = getState();

  if (!books.length) {
    main.innerHTML = `
      <section class="page empty">
        <div class="empty-shelf" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <h1>Dein Regal ist noch leer</h1>
        <p class="muted">Erfasse deine physischen Bücher per ISBN, Barcode oder Titelsuche – bewerte sie,
          schreib kurze Rezensionen und bekomme Empfehlungen, die zu deinem Geschmack passen.</p>
        <div class="row center">
          <a class="btn btn-primary" href="#/hinzufuegen">Erstes Buch hinzufügen</a>
          <button class="btn" id="demo">Beispieldaten laden</button>
        </div>
      </section>`;
    $('#demo').addEventListener('click', () => {
      DEMO_BOOKS.forEach((b) => addBook(b));
      toast(`${DEMO_BOOKS.length} Beispielbücher geladen`);
      render(main);
    });
    return;
  }

  const owned = books.filter((b) => b.status !== 'wishlist');
  const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, books.filter(fn).length]));

  main.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <h1>Mein Regal</h1>
          <p class="muted">${owned.length} Bücher im Regal · ${counts.read} gelesen · ${counts.unread} ungelesen</p>
        </div>
      </div>
      <div class="toolbar">
        <div class="tabs" role="tablist" aria-label="Filter">
          ${FILTERS.map(([k, label]) => `
            <button role="tab" class="tab ${ui.filter === k ? 'active' : ''}" aria-selected="${ui.filter === k}" data-filter="${k}">
              ${label} <span class="count">${counts[k]}</span>
            </button>`).join('')}
        </div>
        <div class="toolbar-right">
          <input type="search" id="q" placeholder="Titel, Autor:in, Genre, Standort …" value="${esc(ui.q)}" aria-label="Regal durchsuchen">
          <select id="sort" aria-label="Sortierung">
            ${Object.entries(SORTS).map(([k, [label]]) => `<option value="${k}" ${ui.sort === k ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <div class="seg" role="group" aria-label="Ansicht">
            <button data-mode="shelf" class="${ui.mode === 'shelf' ? 'active' : ''}" title="Regalansicht" aria-label="Regalansicht">▥</button>
            <button data-mode="list" class="${ui.mode === 'list' ? 'active' : ''}" title="Listenansicht" aria-label="Listenansicht">☰</button>
          </div>
        </div>
      </div>
      <div id="shelf"></div>
    </section>`;

  $$('[data-filter]', main).forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.filter = btn.dataset.filter;
      $$('[data-filter]', main).forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn);
      });
      draw();
    }),
  );
  $('#q', main).addEventListener('input', (e) => {
    ui.q = e.target.value;
    draw();
  });
  $('#sort', main).addEventListener('change', (e) => {
    ui.sort = e.target.value;
    draw();
  });
  $$('[data-mode]', main).forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.mode = btn.dataset.mode;
      $$('[data-mode]', main).forEach((b) => b.classList.toggle('active', b === btn));
      draw();
    }),
  );
  draw();
}

function matches(b, q) {
  if (!q) return true;
  const hay = [b.title, ...(b.authors || []), b.isbn, b.location, b.lentTo, ...(b.subjects || [])].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
}

function draw() {
  const { books } = getState();
  const filterFn = FILTERS.find(([k]) => k === ui.filter)[2];
  const list = books.filter(filterFn).filter((b) => matches(b, ui.q)).sort(SORTS[ui.sort][1]);
  const el = $('#shelf');
  const lock = (b) => (isLoggedIn() && !isFriendsVisible(b) ? '<span class="private" title="Nur für dich sichtbar" aria-label="privat">🔒</span>' : '');

  if (!list.length) {
    el.innerHTML = `<p class="muted pad">Keine Bücher gefunden.</p>`;
    return;
  }

  if (ui.mode === 'list') {
    el.innerHTML = `<div class="book-list">${list.map((b) => `
      <a class="list-row" href="#/buch/${b.id}">
        ${coverHtml(b, 'cover-xs')}
        <div class="list-main">
          <strong>${esc(b.title)} ${lock(b)}</strong>
          <span class="muted">${esc(authorsText(b))}${b.year ? ` · ${b.year}` : ''}</span>
        </div>
        <span class="badge badge-${b.status}">${STATUS[b.status]}</span>
        <span class="list-rating">${b.rating ? starsHtml(b.rating, { size: 'sm' }) : ''}</span>
        <span class="muted list-extra">${b.lentTo ? `verliehen an ${esc(b.lentTo)}` : esc(b.location)}${b.finishedAt ? `<br>${formatDate(b.finishedAt)}` : ''}</span>
      </a>`).join('')}</div>`;
    return;
  }

  el.innerHTML = `<div class="shelf">${list.map((b) => `
    <a class="book" href="#/buch/${b.id}" title="${esc(b.title)} – ${esc(authorsText(b))}">
      <div class="book-slot">
        ${coverHtml(b)}
        ${b.status === 'reading' ? '<span class="ribbon" title="Lese ich gerade">Lese ich</span>' : ''}
        ${b.lentTo ? `<span class="lent" title="Verliehen an ${esc(b.lentTo)}">↗ ${esc(b.lentTo)}</span>` : ''}
      </div>
      <div class="book-meta">
        <span class="book-title">${lock(b)}${esc(b.title)}</span>
        <span class="book-author">${esc(authorsText(b))}</span>
        ${b.rating ? starsHtml(b.rating, { size: 'sm' }) : b.status === 'wishlist' ? '<span class="badge badge-wishlist">Wunschliste</span>' : ''}
      </div>
    </a>`).join('')}</div>`;
}
