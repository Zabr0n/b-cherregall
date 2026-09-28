// Holt fehlende Cover im Hintergrund nach und tauscht sie in der Ansicht aus.

import { getBook, updateBook } from './store.js';
import { findCover } from './api.js';
import { $$, coverHtml } from './ui.js';

const queue = [];
const pending = new Set();
let running = 0;
const MAX_PARALLEL = 2;

/** Stellt alle Bücher ohne (funktionierendes) Cover in die Warteschlange. */
export function ensureCovers(books) {
  books.filter((b) => !b.coverUrl && !b.coverTried).forEach((b) => enqueue(b.id));
}

function enqueue(id) {
  if (pending.has(id)) return;
  pending.add(id);
  queue.push(id);
  pump();
}

async function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const id = queue.shift();
    running++;
    lookup(id).finally(() => {
      running--;
      pending.delete(id);
      pump();
    });
  }
}

async function lookup(id) {
  const book = getBook(id);
  if (!book) return;
  try {
    const found = await findCover(book);
    const patch = { coverTried: true };
    if (found && found.coverUrl !== book.coverUrl) {
      patch.coverUrl = found.coverUrl;
      if (!book.workKey) patch.workKey = found.workKey;
      if (!book.subjects?.length && found.subjects.length) patch.subjects = found.subjects;
    }
    updateBook(id, patch);
    if (patch.coverUrl) refresh(id);
  } catch (e) {
    // Netzwerkfehler: beim nächsten Mal erneut versuchen.
    console.warn('Cover-Suche fehlgeschlagen', book.title, e);
  }
}

/** Ersetzt alle angezeigten Cover eines Buchs. */
export function refresh(id) {
  const book = getBook(id);
  if (!book) return;
  $$(`.cover[data-cover-id="${id}"]`).forEach((el) => {
    el.outerHTML = coverHtml(book, el.dataset.cls || '');
  });
}

// Wird von <img onerror> aufgerufen, wenn eine gespeicherte Cover-URL kein Bild liefert.
window.coverMissing = (img) => {
  const id = img.closest('.cover')?.dataset.coverId;
  img.remove();
  const book = id && getBook(id);
  if (book && !book.coverTried) enqueue(id);
};
