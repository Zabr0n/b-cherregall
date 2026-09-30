// Einheitliche Genres: Schlagwörter aus Open Library, Google Books und der DNB kommen in vielen
// Sprachen und Schreibweisen („fantasía“, „fantasy fiction“, „Fantasy“). Bekannte Begriffe werden auf
// ein deutsches Genre abgebildet, Allgemeines („fiction“, „Bestseller“) fällt weg.

// [Anzeige, Suchbegriff für Open Library, Schreibweisen …]
const GENRES = [
  ['Fantasy', 'fantasy', 'fantasy', 'fantasia', 'fantastique', 'fantasy fiction', 'fantasyliteratur', 'fantasy-roman', 'epic fantasy', 'high fantasy', 'dark fantasy', 'fantasy & magic', 'literatura fantastica', 'narrativa fantastica'],
  ['Romantasy', 'romantasy', 'romantasy'],
  ['Urban Fantasy', 'urban fantasy', 'urban fantasy'],
  ['Romance', 'romance', 'romance', 'romances', 'romantica', 'romantico', 'romantic', 'romance fiction', 'romantic fiction', 'romance novels', 'love stories', 'love', 'love & romance', 'novela romantica', 'roman d\'amour', 'romans d\'amour', 'romanzi rosa', 'romanzo rosa', 'liebesroman', 'liebesromane', 'liebesgeschichte'],
  ['Dark Romance', 'dark romance', 'dark romance'],
  ['New Adult', 'new adult', 'new adult', 'new adult fiction'],
  ['Young Adult', 'young adult fiction', 'young adult', 'young adult fiction', 'young adult literature', 'joven adulto', 'jovenes adultos', 'juvenil', 'literatura juvenil', 'ya', 'teen fiction', 'jeunesse', 'jugendbuch', 'jugendbucher', 'jugendliteratur', 'jugendroman'],
  ['Kinderbuch', 'juvenile fiction', 'children\'s fiction', 'children\'s stories', 'children\'s literature', 'juvenile fiction', 'literatura infantil', 'infantil', 'kinderbuch', 'kinderbucher', 'kinderliteratur'],
  ['Krimi', 'mystery', 'mystery', 'mystery fiction', 'mysteries', 'crime', 'crime fiction', 'detective and mystery stories', 'detective stories', 'detective', 'novela policiaca', 'policiaca', 'policier', 'roman policier', 'giallo', 'gialli', 'kriminalroman', 'kriminalromane', 'krimi', 'krimis'],
  ['Thriller', 'thriller', 'thriller', 'thrillers', 'suspense', 'suspense fiction', 'psychological thriller', 'thriller psicologico', 'psychothriller', 'spannung'],
  ['Science-Fiction', 'science fiction', 'science fiction', 'science-fiction', 'sci-fi', 'scifi', 'ciencia ficcion', 'ciencia-ficcion', 'fantascienza', 'ficcao cientifica'],
  ['Dystopie', 'dystopias', 'dystopia', 'dystopias', 'dystopian', 'dystopian fiction', 'distopia', 'distopias', 'dystopie', 'dystopien'],
  ['Horror', 'horror', 'horror', 'horror fiction', 'horror tales', 'terror', 'novela de terror', 'epouvante', 'gruselgeschichte', 'gruselgeschichten'],
  ['Historischer Roman', 'historical fiction', 'historical fiction', 'historical novel', 'historical novels', 'novela historica', 'roman historique', 'romanzo storico', 'historischer roman', 'historische romane'],
  ['Klassiker', 'classics', 'classics', 'classic literature', 'classic', 'clasicos', 'classiques', 'klassiker'],
  ['Humor', 'humor', 'humor', 'humour', 'humorous fiction', 'humorous stories', 'comedy', 'humoristisch'],
  ['Abenteuer', 'adventure', 'adventure', 'adventure stories', 'adventure fiction', 'action & adventure', 'aventuras', 'aventure', 'avventura', 'abenteuer', 'abenteuerroman'],
  ['Märchen', 'fairy tales', 'fairy tales', 'fairy tale', 'cuentos de hadas', 'contes de fees', 'fiabe', 'marchen'],
  ['Mythologie', 'mythology', 'mythology', 'mitologia', 'mythologie', 'myths'],
  ['Paranormal', 'paranormal', 'paranormal', 'paranormal fiction', 'supernatural', 'sobrenatural', 'ubernaturliches'],
  ['Vampire', 'vampires', 'vampires', 'vampire', 'vampiros', 'vampir'],
  ['Hexen', 'witches', 'witches', 'witchcraft', 'brujas', 'brujeria', 'sorcieres', 'hexen', 'hexe'],
  ['Magie', 'magic', 'magic', 'magia', 'magie', 'zauberei'],
  ['Drachen', 'dragons', 'dragons', 'dragon', 'dragones', 'drachen', 'drache'],
  ['Krieg', 'war', 'war', 'war stories', 'war fiction', 'guerra', 'guerre', 'krieg'],
  ['Zeitreise', 'time travel', 'time travel', 'viajes en el tiempo', 'voyage dans le temps', 'zeitreise', 'zeitreisen'],
  ['Coming of Age', 'coming of age', 'coming of age', 'coming-of-age', 'bildungsroman'],
  ['Freundschaft', 'friendship', 'friendship', 'amistad', 'amitie', 'amicizia', 'freundschaft'],
  ['Familie', 'family', 'family', 'families', 'family life', 'familia', 'famille', 'famiglia', 'familie'],
  ['Schule', 'schools', 'schools', 'school', 'boarding schools', 'high schools', 'escuelas', 'ecoles', 'schule', 'internat'],
  ['Graphic Novel', 'graphic novels', 'graphic novels', 'graphic novel', 'comics', 'comic books', 'comic', 'comics & graphic novels', 'historietas', 'bandes dessinees', 'fumetti'],
  ['Manga', 'manga', 'manga'],
  ['Lyrik', 'poetry', 'poetry', 'poems', 'poesia', 'poesie', 'gedichte', 'lyrik'],
  ['Biografie', 'biography', 'biography', 'biographies', 'autobiography', 'memoir', 'memoirs', 'biografia', 'autobiografia', 'memorias', 'biographie', 'autobiographie', 'biografie'],
  ['Sachbuch', 'nonfiction', 'nonfiction', 'non-fiction', 'no ficcion', 'sachbuch', 'sachbucher'],
  ['Geschichte', 'history', 'history', 'historia', 'histoire', 'storia', 'geschichte'],
  ['Philosophie', 'philosophy', 'philosophy', 'filosofia', 'philosophie'],
  ['Psychologie', 'psychology', 'psychology', 'psicologia', 'psychologie'],
  ['Ratgeber', 'self-help', 'self-help', 'self help', 'personal growth', 'autoayuda', 'developpement personnel', 'selbsthilfe', 'ratgeber'],
  ['Erotik', 'erotica', 'erotica', 'erotic fiction', 'erotic romance', 'erotismo', 'erotik'],
];

// Zu allgemein oder keine Genres: fällt ganz weg.
const JUNK = new Set([
  'fiction', 'fictions', 'ficcion', 'ficciones', 'ficcao', 'fiction generale', 'narrativa', 'novel', 'novels',
  'novela', 'novelas', 'roman', 'romane', 'romanzo', 'romanzi', 'literature', 'literatura', 'litterature',
  'letteratura', 'belletristik', 'erzahlende literatur', 'general', 'generales', 'fiction in english',
  'english fiction', 'american fiction', 'english language', 'large type books', 'ebooks', 'e-books',
  'audiobooks', 'horbuch', 'horbucher', 'accessible book', 'protected daisy', 'in library', 'lending library',
  'juvenile works', 'juvenile literature', 'translations', 'reading level', 'staff picks', 'award', 'awards',
]);
const JUNK_PATTERN = /bestseller|best seller|^nyt|new york times|staff pick|reading level|translations into|open library/;

/** Vergleichsschlüssel: klein, ohne Akzente/Umlaut-Punkte, einfache Leerzeichen. */
const key = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const LABELS = new Map(); // Schreibweise → Anzeige
const QUERIES = new Map(); // Anzeige → Suchbegriff bei Open Library
for (const [label, query, ...aliases] of GENRES) {
  QUERIES.set(label, query);
  LABELS.set(key(label), label);
  for (const a of aliases) LABELS.set(key(a), label);
}

/**
 * Deutsches Genre zu einem Schlagwort, `null` für Allgemeines wie „fiction“ oder „Bestseller“,
 * `undefined`, wenn der Begriff unbekannt ist.
 */
export function genreOf(tag) {
  const k = key(tag);
  if (!k) return null;
  if (LABELS.has(k)) return LABELS.get(k);
  if (JUNK.has(k) || JUNK_PATTERN.test(k)) return null;
  return undefined;
}

/**
 * Vereinheitlicht eine Liste: bekannte Begriffe → deutsches Genre, Allgemeines fällt weg, keine Doppelten.
 * `strict`: auch unbekannte Begriffe weglassen (für fremdsprachige Quellen wie Open Library).
 */
export function normalizeSubjects(list, { strict = false } = {}) {
  const out = new Map();
  for (const tag of list || []) {
    const genre = genreOf(tag);
    const value = genre === undefined ? (strict ? null : String(tag).trim()) : genre;
    if (value && !out.has(key(value))) out.set(key(value), value);
  }
  return [...out.values()];
}

/** Suchbegriff für Open Library (dort sind Schlagwörter englisch). */
export const olSubject = (label) => QUERIES.get(label) || label;
