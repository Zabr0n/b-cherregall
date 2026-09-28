// Einfacher Hash-Router: #/regal, #/buch/<id>, #/hinzufuegen, #/statistik, …

import { $, $$ } from './ui.js';
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
import { initFriends, onIncomingChange } from './friends.js';
import { initAccount, getUser, onAccountChange } from './account.js';

const routes = {
  regal: shelf,
  buch: detail,
  hinzufuegen: add,
  statistik: stats,
  empfehlungen: recs,
  einstellungen: settings,
  konto: account,
  freunde: friends,
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
};

let cleanup = null;
let current = '';

function route() {
  const [name = 'regal', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = routes[name] ? name : 'regal';
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
  $('#nav-account').textContent = user ? `👤 ${user.displayName || user.username}` : 'Anmelden';
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

// Fehlende Cover für neue und bestehende Bücher im Hintergrund nachladen.
subscribe((state) => ensureCovers(state.books));
ensureCovers(getState().books);
