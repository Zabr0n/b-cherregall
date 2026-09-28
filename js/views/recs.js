import { getState, addBook, dismiss, bookKey } from '../store.js';
import { buildProfile, shelfPicks, discover } from '../recommend.js';
import { $, $$, esc, coverHtml, authorsText, toast } from '../ui.js';

export function render(main) {
  const state = getState();
  const profile = buildProfile(state.books);
  const liked = state.books.filter((b) => b.rating >= 4).length;

  if (!liked) {
    main.innerHTML = `
      <section class="page narrow">
        <h1>Empfehlungen</h1>
        <div class="card">
          <p><strong>Noch zu wenig Bewertungen.</strong> Bewerte ein paar gelesene Bücher mit Sternen –
            am besten auch welche, die dir nicht gefallen haben. Daraus lernt die App deinen Geschmack.</p>
          <a class="btn btn-primary" href="#/regal">Zum Regal</a>
        </div>
      </section>`;
    return;
  }

  const picks = shelfPicks(state.books, profile).slice(0, 6);

  main.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div><h1>Empfehlungen</h1>
          <p class="muted">Basierend auf ${profile.ratedCount} Bewertung${profile.ratedCount === 1 ? '' : 'en'}.</p></div>
      </div>

      <div class="card taste">
        <h2 class="card-title">Dein Geschmack</h2>
        <div class="taste-row"><span class="label">Magst du</span>
          <div class="chips">${chips(profile.topSubjects.slice(0, 8), 'plus')}${chips(profile.topAuthors.slice(0, 3), 'plus author')}</div></div>
        ${profile.dislikedSubjects.length || profile.dislikedAuthors.length ? `
        <div class="taste-row"><span class="label">Eher nicht</span>
          <div class="chips">${chips(profile.dislikedSubjects.slice(0, 5), 'minus')}${chips(profile.dislikedAuthors.slice(0, 2), 'minus author')}</div></div>` : ''}
      </div>

      ${picks.length ? `
        <h2 class="section-title">Als Nächstes aus deinem Regal</h2>
        <p class="muted">Ungelesene Bücher, die du schon besitzt – nach Passung sortiert.</p>
        <div class="rec-grid">${picks.map((r) => recCard(r, { own: true })).join('')}</div>` : ''}

      <div class="row between section-title">
        <h2>Neu entdecken</h2>
        <button class="btn btn-sm" id="reload">↻ Neu laden</button>
      </div>
      <p class="muted">Vorschläge aus Open Library, die zu deinen Lieblingsgenres und -autor:innen passen.</p>
      <div id="discover"><p class="muted loading">Suche passende Bücher …</p></div>
    </section>`;

  const load = async (force) => {
    const box = $('#discover', main);
    box.innerHTML = `<p class="muted loading">Suche passende Bücher …</p>`;
    try {
      const recs = await discover(getState(), { force });
      if (!box.isConnected) return;
      if (!recs.length) {
        box.innerHTML = `<p class="muted">Gerade keine neuen Vorschläge. Füge mehr Genres zu deinen Lieblingsbüchern hinzu oder lade neu.</p>`;
        return;
      }
      box.innerHTML = `<div class="rec-grid">${recs.map((r, i) => recCard(r, { idx: i })).join('')}</div>`;
      $$('[data-wish]', box).forEach((btn) =>
        btn.addEventListener('click', () => {
          const b = recs[+btn.dataset.wish].book;
          const { olRating, olRatingCount, ...data } = b;
          addBook({ ...data, status: btn.dataset.status });
          toast(btn.dataset.status === 'wishlist' ? `„${b.title}“ auf die Wunschliste` : `„${b.title}“ ins Regal gestellt`);
          btn.closest('.rec').classList.add('done');
          btn.closest('.rec-actions').innerHTML = `<span class="muted small">✓ ${btn.dataset.status === 'wishlist' ? 'Auf der Wunschliste' : 'Im Regal'}</span>`;
        }),
      );
      $$('[data-dismiss]', box).forEach((btn) =>
        btn.addEventListener('click', () => {
          const b = recs[+btn.dataset.dismiss].book;
          dismiss(b.workKey || bookKey(b));
          btn.closest('.rec').remove();
        }),
      );
    } catch (e) {
      console.error(e);
      if (box.isConnected) box.innerHTML = `<p class="error">${esc(e.message || 'Fehler beim Laden der Empfehlungen.')}</p>`;
    }
  };
  $('#reload', main).addEventListener('click', () => load(true));
  load(false);
}

function chips(entries, cls) {
  return entries.map(([k]) => `<span class="chip chip-${cls.split(' ')[0]} ${cls.includes('author') ? 'chip-author' : ''}">${esc(k)}</span>`).join('');
}

function reasonText(r) {
  const parts = [];
  if (r.author) parts.push(`Mehr von ${esc(r.author)}`);
  else if (r.because) parts.push(`Weil dir „${esc(r.because.title)}“ gefallen hat`);
  if (r.tags.length) parts.push(r.tags.map((t) => `<span class="chip chip-sm">${esc(t)}</span>`).join(''));
  return parts.join('<br>');
}

function recCard(r, { own = false, idx = 0 } = {}) {
  const b = r.book;
  const inner = `
    ${coverHtml(b, 'cover-md')}
    <div class="rec-body">
      <strong class="rec-title">${esc(b.title)}</strong>
      <span class="muted small">${esc(authorsText(b))}${b.year ? ` · ${b.year}` : ''}</span>
      <p class="reason">${reasonText(r)}</p>
      ${own ? '' : `
        <div class="rec-actions">
          <button class="btn btn-sm btn-primary" data-wish="${idx}" data-status="wishlist">♡ Wunschliste</button>
          <button class="btn btn-sm" data-wish="${idx}" data-status="unread" title="Besitze ich schon">Hab ich</button>
          <button class="btn btn-sm btn-ghost" data-dismiss="${idx}" title="Nicht mehr vorschlagen">Kein Interesse</button>
        </div>
        ${b.workKey ? `<a class="small" href="https://openlibrary.org${esc(b.workKey)}" target="_blank" rel="noopener">Mehr erfahren ↗</a>` : ''}`}
    </div>`;
  return own ? `<a class="rec" href="#/buch/${b.id}">${inner}</a>` : `<div class="rec">${inner}</div>`;
}
