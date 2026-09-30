// Persistenz im localStorage. Alle Änderungen laufen über diese Funktionen.

const KEY = 'buecherregal.v1';

const DEFAULTS = {
  books: [],
  settings: { yearlyGoal: 24, germanRecs: false, shareByDefault: true },
  dismissed: [], // Empfehlungen, die mit „Kein Interesse“ ausgeblendet wurden
};

export const STATUS = {
  read: 'Gelesen',
  reading: 'Lese ich gerade',
  unread: 'Ungelesen',
  wishlist: 'Wunschliste',
};

export const FORMATS = ['Hardcover', 'Taschenbuch', 'Paperback', 'Hörbuch', 'Sonstiges'];

// Hörbücher: eigene Status-Bezeichnungen und Dauer statt Seiten.
export const AUDIOBOOK = 'Hörbuch';
export const isAudio = (b) => b?.format === AUDIOBOOK;
const AUDIO_STATUS = {
  read: 'Gehört',
  reading: 'Höre ich gerade',
  unread: 'Ungehört',
  wishlist: 'Wunschliste',
};
/** Status-Bezeichnung passend zum Format, z. B. „Gehört“ statt „Gelesen“ bei Hörbüchern. */
export const statusLabel = (b, status = b.status) => (isAudio(b) ? AUDIO_STATUS : STATUS)[status] || '';

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULTS),
        ...s,
        settings: { ...DEFAULTS.settings, ...s.settings },
      };
    }
  } catch (e) {
    console.error('Konnte gespeicherte Daten nicht lesen', e);
  }
  return structuredClone(DEFAULTS);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Speichern fehlgeschlagen', e);
  }
  listeners.forEach((fn) => fn(state));
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export const getState = () => state;
export const getBook = (id) => state.books.find((b) => b.id === id);

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function normalizeBook(data) {
  return {
    id: uid(),
    addedAt: new Date().toISOString(),
    title: '',
    authors: [],
    isbn: '',
    publisher: '',
    year: null,
    pages: null,
    duration: null, // Hörbücher: Länge in Minuten
    coverUrl: '',
    subjects: [],
    workKey: '',
    status: 'unread',
    rating: 0,
    review: '',
    startedAt: '',
    finishedAt: '',
    location: '',
    format: '',
    lentTo: '',
    friendsVisible: state?.settings?.shareByDefault !== false, // Freunde dürfen das Buch sehen
    ...data,
  };
}

/** Bücher ohne Angabe (von vor der Freunde-Funktion) gelten als sichtbar. */
export const isFriendsVisible = (b) => b.friendsVisible !== false;

export function addBook(data) {
  const book = normalizeBook(data);
  if (book.status === 'read' && !book.finishedAt) book.finishedAt = today();
  if (book.status === 'reading' && !book.startedAt) book.startedAt = today();
  state.books.push(book);
  save();
  return book;
}

export function updateBook(id, patch) {
  const book = getBook(id);
  if (!book) return;
  Object.assign(book, patch);
  save();
  return book;
}

export function removeBook(id) {
  state.books = state.books.filter((b) => b.id !== id);
  save();
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

export function bookKey(b) {
  return norm(b.title) + '|' + norm((b.authors || [])[0]);
}

export function findDuplicate(candidate) {
  const key = bookKey(candidate);
  return state.books.find(
    (b) =>
      (candidate.isbn && b.isbn && b.isbn === candidate.isbn) ||
      (candidate.workKey && b.workKey && b.workKey === candidate.workKey) ||
      bookKey(b) === key,
  );
}

/** Setzt die Sichtbarkeit für Freunde bei allen Büchern auf einmal. */
export function setAllFriendsVisible(visible) {
  state.books.forEach((b) => (b.friendsVisible = visible));
  save();
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}

export function dismiss(key) {
  if (!state.dismissed.includes(key)) state.dismissed.push(key);
  save();
}

export function resetDismissed() {
  state.dismissed = [];
  save();
}

/** Ersetzt den kompletten Stand, z. B. mit den Daten vom Server. */
export function replaceState(data) {
  state = {
    ...structuredClone(DEFAULTS),
    ...data,
    settings: { ...DEFAULTS.settings, ...data?.settings },
  };
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'buecherregal', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** Importiert eine Sicherung. mode = 'merge' (Duplikate überspringen) oder 'replace'. */
export function importJSON(text, mode = 'merge') {
  const data = JSON.parse(text);
  if (!Array.isArray(data.books)) throw new Error('Keine gültige Bücherregal-Sicherung.');
  const books = data.books.map((b) => normalizeBook({ ...b, id: b.id || uid() }));
  let added = 0;
  if (mode === 'replace') {
    state = {
      ...structuredClone(DEFAULTS),
      books,
      settings: { ...DEFAULTS.settings, ...data.settings },
      dismissed: data.dismissed || [],
    };
    added = books.length;
  } else {
    for (const b of books) {
      if (!findDuplicate(b)) {
        state.books.push(b);
        added++;
      }
    }
  }
  save();
  return added;
}
