// Einfacher Hash-Router: #/regal, #/buch/<id>, #/hinzufuegen, #/statistik, …

import { $, $$, esc } from './ui.js';
import { getState, subscribe } from './store.js';
import { ensureCovers } from './covers.js';
import * as shelf from './views/shelf.js';
import * as detail from './views/detail.js';
import * as add from './views/add.js';
import * as stats from './views/stats.js';
import * as recs from './views/recs.js';
import * as settings from './views/settings.js';
import * as account from './views/account.js';
import * as friends from './views/friends.js';
import * as start from './views/start.js';
import { initFriends, onIncomingChange } from './friends.js';
import { initAccount, getUser, isLoggedIn, onAccountChange } from './account.js';

const routes = {
  regal: shelf,
  buch: detail,
  hinzufuegen: add,
  statistik: stats,
  empfehlungen: recs,
  einstellungen: settings,
  konto: account,
  freunde: friends,
  start,
};

const TITLES = {
  regal: 'Regal',
  buch: 'Buch',
  hinzufuegen: 'Buch hinzufügen',
  statistik: 'Statistik',
  empfehlungen: 'Empfehlungen',
  einstellungen: 'Einstellungen',
  konto: 'Konto',
  freunde: 'Freunde',
  start: 'Willkommen',
};

let cleanup = null;
let current = '';

function route() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  // Ohne Ziel: Wer schon Bücher oder ein Konto hat, landet im Regal, alle anderen auf der Startseite.
  const home = isLoggedIn() || getState().books.length ? 'regal' : 'start';
  const view = routes[name] ? name : home;
  const main = $('#view');

  if (typeof cleanup === 'function') cleanup();
  cleanup = routes[view].render(main, ...params);

  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === view));
  document.title = `${TITLES[view]} · Bücherregal`;
  if (current !== location.hash) {
    window.scrollTo(0, 0);
    current = location.hash;
  }
}

// Navigation zeigt „Anmelden“ bzw. den Namen des angemeldeten Nutzers.
function updateAccountNav() {
  const user = getUser();
  const link = $('#nav-account');
  const label = user ? user.displayName || user.username : 'Anmelden';
  // Auf dem Handy ist nur das Symbol zu sehen (Name per CSS ausgeblendet).
  link.innerHTML = `👤 <span class="nav-name">${esc(label)}</span>`;
  link.title = user ? `Konto: ${label}` : 'Anmelden';
}
onAccountChange(updateAccountNav);
updateAccountNav();

// Abzeichen mit offenen Freundschaftsanfragen.
onIncomingChange((n) => {
  const badge = $('#friend-badge');
  badge.textContent = n;
  badge.hidden = !n;
});

window.addEventListener('hashchange', route);
window.addEventListener('library:replaced', route);
route();
initAccount();
initFriends();

// Den Browser bitten, die Daten (Bücher, Anmeldung) nicht bei Speicherknappheit zu löschen.
navigator.storage?.persist?.().catch(() => {});

// Fehlende Cover für neue und bestehende Bücher im Hintergrund nachladen.
subscribe((state) => ensureCovers(state.books));
ensureCovers(getState().books);
