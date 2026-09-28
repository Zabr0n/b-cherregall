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

const routes = {
  regal: shelf,
  buch: detail,
  hinzufuegen: add,
  statistik: stats,
  empfehlungen: recs,
  einstellungen: settings,
};

const TITLES = {
  regal: 'Regal',
  buch: 'Buch',
  hinzufuegen: 'Buch hinzufügen',
  statistik: 'Statistik',
  empfehlungen: 'Empfehlungen',
  einstellungen: 'Einstellungen',
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

window.addEventListener('hashchange', route);
route();

// Fehlende Cover für neue und bestehende Bücher im Hintergrund nachladen.
subscribe((state) => ensureCovers(state.books));
ensureCovers(getState().books);
