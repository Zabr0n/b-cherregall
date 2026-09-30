import { getState, addBook, findDuplicate, updateSettings, setAllFriendsVisible, isFriendsVisible, isAudio, statusLabel } from '../store.js';
import { isLoggedIn, getUser, updateProfile } from '../account.js';
import { searchUsers, getFriends, addFriend, removeFriend, getFriendLibrary, setIncoming } from '../friends.js';
import { $, $$, esc, coverHtml, starsHtml, authorsText, formatDate, toast } from '../ui.js';

export function render(main, userId) {
  if (!isLoggedIn()) {
    main.innerHTML = `
      <section class="page narrow">
        <h1>Freunde</h1>
        <div class="card">
          <p>Mit einem Konto kannst du Freunde finden und sehen, was sie lesen und wie sie ihre Bücher bewertet haben.</p>
          <a class="btn btn-primary" href="#/konto">Anmelden oder registrieren</a>
        </div>
      </section>`;
    return;
  }
  // Asynchrone Antworten ignorieren, wenn die Ansicht inzwischen gewechselt wurde.
  const view = { alive: true };
  if (userId) friendShelf(main, userId, view);
  else overview(main, view);
  return () => (view.alive = false);
}

// ---------- Hilfen ----------

function avatar(user, cls = '') {
  const name = user.displayName || user.username || '?';
  let h = 0;
  for (const c of user.username || name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar ${cls}" style="--hue:${h % 360}" aria-hidden="true">${esc([...name][0].toUpperCase())}</span>`;
}

const nameHtml = (u) => `<strong>${esc(u.displayName || u.username)}</strong> <span class="muted small">@${esc(u.username)}</span>`;

const ACTIONS = {
  none: (u) => `<button class="btn btn-sm btn-primary" data-add="${u.id}">+ Freund hinzufügen</button>`,
  outgoing: (u) => `<button class="btn btn-sm" data-remove="${u.id}" title="Anfrage zurückziehen">Angefragt ✕</button>`,
  incoming: (u) => `<button class="btn btn-sm btn-primary" data-add="${u.id}">Anfrage annehmen</button>`,
  friend: (u) => `<a class="btn btn-sm" href="#/freunde/${u.id}">Regal ansehen</a>`,
};

// ---------- Übersicht ----------

function overview(main, view) {
  const { settings, books } = getState();
  const hidden = books.filter((b) => !isFriendsVisible(b)).length;
  const me = getUser() || {};

  main.innerHTML = `
    <section class="page narrow">
      <h1>Freunde</h1>
      <p class="muted">Schau, was deine Freunde lesen und wie sie es fanden.</p>

      <div class="card">
        <label class="field"><span class="label">Freunde finden</span>
          <input type="search" id="user-q" placeholder="Benutzername, Name oder E-Mail" autocomplete="off">
        </label>
        <div id="user-results" class="people"></div>
      </div>

      <div id="friend-lists"><p class="muted loading">Lade Freunde …</p></div>

      <details class="card friend-settings">
        <summary><h2 class="card-title">Einstellungen für Freunde</h2></summary>
        <label class="check"><input type="checkbox" id="discoverable" ${me.discoverable !== false ? 'checked' : ''}>
          In der Suche auffindbar <span class="muted small">– sonst nur über den genauen Benutzernamen oder deine E-Mail</span></label>
        <label class="check"><input type="checkbox" id="share-default" ${settings.shareByDefault !== false ? 'checked' : ''}>
          Neue Bücher standardmäßig für Freunde sichtbar</label>
        <p class="small muted">${books.length - hidden} von ${books.length} Büchern sind für Freunde sichtbar${hidden ? `, ${hidden} nur für dich 🔒` : ''}.
          Einzelne Bücher stellst du auf der Buchseite um.</p>
        <div class="row wrap">
          <button class="btn btn-sm" id="all-visible">Alle sichtbar machen</button>
          <button class="btn btn-sm" id="all-hidden">Alle verbergen</button>
        </div>
      </details>
    </section>`;

  const lists = $('#friend-lists', main);
  const results = $('#user-results', main);
  let lastResults = [];

  async function loadLists() {
    try {
      const data = await getFriends();
      if (!view.alive) return;
      setIncoming(data.incoming.length);
      lists.innerHTML = `
        ${data.incoming.length ? `
          <div class="card requests">
            <h2 class="card-title">Freundschaftsanfragen</h2>
            <div class="people">${data.incoming.map((u) => `
              <div class="person">${avatar(u)}<div class="grow">${nameHtml(u)}</div>
                <button class="btn btn-sm btn-primary" data-add="${u.id}">Annehmen</button>
                <button class="btn btn-sm btn-ghost" data-remove="${u.id}">Ablehnen</button>
              </div>`).join('')}</div>
          </div>` : ''}

        <h2 class="section-title">Deine Freunde</h2>
        ${data.friends.length ? `<div class="friend-grid">${data.friends.map((u) => `
          <a class="friend-card card" href="#/freunde/${u.id}">
            ${avatar(u, 'avatar-lg')}
            <div class="grow">
              ${nameHtml(u)}
              <span class="small muted">${u.bookCount} ${u.bookCount === 1 ? 'Buch' : 'Bücher'}</span>
              ${u.bio ? `<span class="small bio">${esc(u.bio)}</span>` : ''}
            </div>
          </a>`).join('')}</div>`
        : `<p class="muted">Noch keine Freunde. Such oben nach dem Benutzernamen deiner Freunde – oder schick ihnen buchbrett.de,
            damit sie sich ein Konto anlegen.</p>`}

        ${data.outgoing.length ? `
          <p class="small muted outgoing">Gesendete Anfragen: ${data.outgoing.map((u) => `
            <span class="chip">${esc(u.displayName || u.username)}
              <button class="link" data-remove="${u.id}" title="Anfrage zurückziehen" aria-label="Anfrage an ${esc(u.username)} zurückziehen">✕</button></span>`).join(' ')}</p>` : ''}`;
    } catch (err) {
      if (view.alive) lists.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  function drawResults() {
    results.innerHTML = lastResults.map((u) => `
      <div class="person">${avatar(u)}<div class="grow">${nameHtml(u)}</div>${ACTIONS[u.relation](u)}</div>`).join('');
  }

  let timer;
  let seq = 0;
  $('#user-q', main).addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 2) {
      lastResults = [];
      results.innerHTML = '';
      return;
    }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const users = await searchUsers(q);
        if (!view.alive || mine !== seq) return;
        lastResults = users;
        if (users.length) drawResults();
        else results.innerHTML = `<p class="muted small">Niemand gefunden. Tipp: Mit dem genauen Benutzernamen oder der E-Mail findest du jeden.</p>`;
      } catch (err) {
        if (view.alive) results.innerHTML = `<p class="error small">${esc(err.message)}</p>`;
      }
    }, 300);
  });

  // Alle Knöpfe (Suche, Anfragen, Liste) laufen über diese beiden Handler.
  $('.page', main).addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    const remove = e.target.closest('[data-remove]');
    if (!add && !remove) return;
    const id = Number((add || remove).dataset.add || (add || remove).dataset.remove);
    (add || remove).disabled = true;
    try {
      const { relation } = add ? await addFriend(id) : await removeFriend(id);
      if (add) toast(relation === 'friend' ? 'Ihr seid jetzt befreundet 🎉' : 'Anfrage gesendet');
      const hit = lastResults.find((u) => u.id === id);
      if (hit) hit.relation = relation;
      drawResults();
      loadLists();
    } catch (err) {
      toast(err.message);
      (add || remove).disabled = false;
    }
  });

  $('#discoverable', main).addEventListener('change', async (e) => {
    try {
      await updateProfile({ discoverable: e.target.checked });
      toast(e.target.checked ? 'Du bist in der Suche auffindbar' : 'Du bist in der Suche nicht mehr auffindbar');
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message);
    }
  });
  $('#share-default', main).addEventListener('change', (e) => {
    updateSettings({ shareByDefault: e.target.checked });
    toast('Gespeichert');
  });
  const bulk = (visible) => {
    const msg = visible
      ? 'Alle deine Bücher für Freunde sichtbar machen?'
      : 'Alle deine Bücher vor Freunden verbergen?';
    if (!confirm(msg)) return;
    setAllFriendsVisible(visible);
    toast(visible ? 'Alle Bücher sind für Freunde sichtbar' : '🔒 Alle Bücher sind nur für dich sichtbar');
    overview(main, view);
  };
  $('#all-visible', main).addEventListener('click', () => bulk(true));
  $('#all-hidden', main).addEventListener('click', () => bulk(false));

  loadLists();
}

// ---------- Regal eines Freundes ----------

const FILTERS = [
  ['owned', 'Alle', (b) => b.status !== 'wishlist'],
  ['read', 'Gelesen', (b) => b.status === 'read'],
  ['reading', 'Liest gerade', (b) => b.status === 'reading'],
  ['reviewed', 'Mit Rezension', (b) => !!b.review],
  ['wishlist', 'Wunschliste', (b) => b.status === 'wishlist'],
];
const SORTS = {
  recent: ['Zuletzt gelesen', (a, b) => (b.finishedAt || b.addedAt || '').localeCompare(a.finishedAt || a.addedAt || '')],
  rating: ['Beste Bewertung', (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'de')],
  title: ['Titel', (a, b) => a.title.localeCompare(b.title, 'de')],
};
const ui = { filter: 'owned', sort: 'recent' };

async function friendShelf(main, userId, view) {
  main.innerHTML = `<section class="page"><a class="back" href="#/freunde">← Freunde</a><p class="muted loading">Lade Regal …</p></section>`;
  let data;
  try {
    data = await getFriendLibrary(userId);
  } catch (err) {
    if (view.alive) {
      main.innerHTML = `<section class="page"><a class="back" href="#/freunde">← Freunde</a><p class="error">${esc(err.message)}</p></section>`;
    }
    return;
  }
  if (!view.alive) return;

  // Cover ohne Buch-ID darstellen, damit sie nicht mit eigenen Büchern verwechselt werden.
  const books = data.books.map((b) => ({ ...b, title: b.title || 'Ohne Titel', authors: b.authors || [], coverId: b.id, id: undefined }));
  const u = data.user;
  const name = u.displayName || u.username;
  const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, books.filter(fn).length]));
  const rated = books.filter((b) => b.rating);
  const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1).replace('.', ',') : null;

  main.innerHTML = `
    <section class="page">
      <a class="back" href="#/freunde">← Freunde</a>
      <div class="friend-head">
        ${avatar(u, 'avatar-xl')}
        <div>
          <h1>${esc(name)}s Regal</h1>
          <p class="muted">@${esc(u.username)} · ${counts.read} gelesen${avg ? ` · Ø ${avg} ★` : ''}</p>
          ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
        </div>
      </div>
      ${books.length ? `
        <div class="toolbar">
          <div class="tabs" role="tablist" aria-label="Filter">
            ${FILTERS.map(([k, label]) => `
              <button role="tab" class="tab ${ui.filter === k ? 'active' : ''}" aria-selected="${ui.filter === k}" data-filter="${k}">
                ${label} <span class="count">${counts[k]}</span></button>`).join('')}
          </div>
          <div class="toolbar-right">
            <select id="sort" aria-label="Sortierung">
              ${Object.entries(SORTS).map(([k, [label]]) => `<option value="${k}" ${ui.sort === k ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="friend-shelf"></div>`
      : `<p class="muted pad">${esc(name)} hat noch keine Bücher für Freunde freigegeben.</p>`}
    </section>
    <dialog class="book-dialog" id="book-dialog"></dialog>`;

  if (!books.length) return;

  const draw = () => {
    const fn = FILTERS.find(([k]) => k === ui.filter)[2];
    const list = books.filter(fn).sort(SORTS[ui.sort][1]);
    $('#friend-shelf', main).innerHTML = list.length
      ? `<div class="shelf">${list.map((b) => `
          <button type="button" class="book" data-book="${books.indexOf(b)}" title="${esc(b.title)} – ${esc(authorsText(b))}">
            <div class="book-slot">
              ${coverHtml(b)}
              ${b.status === 'reading' ? `<span class="ribbon">${isAudio(b) ? 'Hört gerade' : 'Liest gerade'}</span>` : ''}
            </div>
            <div class="book-meta">
              <span class="book-title">${esc(b.title)}</span>
              <span class="book-author">${esc(authorsText(b))}</span>
              ${b.rating ? starsHtml(b.rating, { size: 'sm' }) : b.status === 'wishlist' ? '<span class="badge badge-wishlist">Wunschliste</span>' : ''}
              ${b.review ? '<span class="small muted">💬 Rezension</span>' : ''}
            </div>
          </button>`).join('')}</div>`
      : `<p class="muted pad">Keine Bücher in dieser Auswahl.</p>`;
  };

  $$('[data-filter]', main).forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.filter = btn.dataset.filter;
      $$('[data-filter]', main).forEach((x) => {
        x.classList.toggle('active', x === btn);
        x.setAttribute('aria-selected', x === btn);
      });
      draw();
    }),
  );
  $('#sort', main).addEventListener('change', (e) => {
    ui.sort = e.target.value;
    draw();
  });

  const dialog = $('#book-dialog', main);
  $('#friend-shelf', main).addEventListener('click', (e) => {
    const el = e.target.closest('[data-book]');
    if (el) openBook(dialog, books[+el.dataset.book], name);
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });

  draw();
}

function openBook(dialog, b, friendName) {
  const mine = findDuplicate(b);
  const dates = [b.startedAt && `begonnen ${formatDate(b.startedAt)}`, b.finishedAt && `beendet ${formatDate(b.finishedAt)}`]
    .filter(Boolean).join(' · ');
  dialog.innerHTML = `
    <div class="book-dialog-body">
      <button class="btn btn-ghost dialog-close" data-close aria-label="Schließen">✕</button>
      <div class="preview">
        ${coverHtml(b, 'cover-md')}
        <div class="grow">
          <h2>${esc(b.title)}</h2>
          <p class="author">${esc(authorsText(b))}</p>
          <p class="muted small">${[b.year, !isAudio(b) && b.pages && `${b.pages} Seiten`, b.format].filter(Boolean).map(esc).join(' · ')}</p>
          <p><span class="badge badge-${esc(b.status)}">${esc(statusLabel(b))}</span>
            ${b.rating ? starsHtml(b.rating) : ''}</p>
          ${dates ? `<p class="small muted">${dates}</p>` : ''}
        </div>
      </div>
      ${b.review
        ? `<blockquote class="review"><p>${esc(b.review)}</p><footer class="small muted">– ${esc(friendName)}</footer></blockquote>`
        : `<p class="muted small">${esc(friendName)} hat keine Rezension geschrieben.</p>`}
      <div class="row wrap between">
        ${mine
          ? `<span class="small">In deinem Regal${mine.rating ? `: ${starsHtml(mine.rating, { size: 'sm' })}` : ''}
              <a href="#/buch/${mine.id}">öffnen</a></span>`
          : `<button class="btn btn-primary" id="to-wishlist">♡ Auf meine Wunschliste</button>`}
        <button class="btn" data-close>Schließen</button>
      </div>
    </div>`;
  dialog.showModal();
  dialog.querySelector('#to-wishlist')?.addEventListener('click', () => {
    const { title, authors, coverUrl, year, pages, publisher, isbn, subjects, workKey } = b;
    addBook({ title, authors, coverUrl, year, pages, publisher, isbn, subjects: subjects || [], workKey: workKey || '', status: 'wishlist' });
    toast(`„${title}“ steht auf deiner Wunschliste`);
    dialog.close();
  });
}
