// Kleine UI-Helfer, die von allen Ansichten genutzt werden.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function hashHue(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** Cover mit generiertem Ersatz-Einband, falls kein Bild existiert. */
export function coverHtml(book, cls = '') {
  const hue = hashHue(book.title || '');
  const fallback = `<div class="cover-fallback" style="--hue:${hue}" aria-hidden="true">
      <span class="cf-title">${esc(book.title)}</span>
      <span class="cf-author">${esc((book.authors || [])[0] || '')}</span>
    </div>`;
  // Open Library liefert bei fehlendem Cover ein 1×1-Pixel – das zählt ebenfalls als fehlend
  // und stößt eine Suche nach einem anderen Cover an (siehe covers.js).
  const img = book.coverUrl
    ? `<img src="${esc(book.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"
         onerror="window.coverMissing?.(this)" onload="if(this.naturalWidth<10)window.coverMissing?.(this)">`
    : '';
  const idAttr = book.id ? ` data-cover-id="${esc(book.id)}" data-cls="${esc(cls)}"` : '';
  return `<div class="cover ${cls}"${idAttr}>${fallback}${img}</div>`;
}

export function starsHtml(rating, { interactive = false, size = '' } = {}) {
  let out = `<span class="stars ${size} ${interactive ? 'stars-input' : ''}" ${
    interactive ? 'role="radiogroup" aria-label="Bewertung"' : `aria-label="${rating} von 5 Sternen"`
  }>`;
  for (let i = 1; i <= 5; i++) {
    const on = i <= rating ? 'on' : '';
    out += interactive
      ? `<button type="button" class="star ${on}" data-rate="${i}" role="radio" aria-checked="${i === rating}" aria-label="${i} Stern${i > 1 ? 'e' : ''}">★</button>`
      : `<span class="star ${on}" aria-hidden="true">★</span>`;
  }
  return out + '</span>';
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export const authorsText = (b) => (b.authors || []).join(', ') || 'Unbekannt';

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}.${m}.${y}` : iso;
}

export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Quellenhinweis, wenn Buchdaten von Google Books stammen (Nutzungsbedingungen der Books API). */
export const googleNote = (book) =>
  book.googleLink
    ? `<p class="small muted source-note">Daten: <a href="${esc(book.googleLink)}" target="_blank" rel="noopener">Google Books</a></p>`
    : '';
