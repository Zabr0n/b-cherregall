// Buchdaten von Open Library (mit Google Books als Fallback für ISBN-Suche).

const OL = 'https://openlibrary.org';
const FIELDS = 'key,title,subtitle,author_name,first_publish_year,cover_i,subject,isbn,number_of_pages_median,publisher,ratings_average,ratings_count';

export function normalizeIsbn(s) {
  return String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn(isbn) {
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((acc, c, i) => acc + (c === 'X' ? 10 : +c) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((acc, c, i) => acc + +c * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  return false;
}

// Open-Library-Schlagwörter sind oft verrauscht („nyt:…“, „Accessible book“ …).
const NOISE = /^(nyt|award|in library|accessible book|protected daisy|lending library|overdrive|large type|open library|internet archive|long now|reading level|staff picks|translations into|new york times|general|fiction in english|english fiction|literature|juvenile works|juvenile literature|textbooks?)$/i;

export function cleanSubjects(list, limit = 20) {
  const out = new Set();
  for (const raw of list || []) {
    const parts = String(raw || '')
      .split(/\s*(?:,|--|\/|;)\s*/)
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, ''));
    for (const t of parts) {
      if (t.length < 3 || t.length > 32) continue;
      if (/[:=()\d]/.test(t) || NOISE.test(t)) continue;
      out.add(t);
      if (out.size >= limit) return [...out];
    }
  }
  return [...out];
}

export const coverById = (id, size = 'M') => (id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : '');
export const coverByIsbn = (isbn, size = 'M') => (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg` : '');

const parseYear = (s) => {
  const m = String(s || '').match(/\d{4}/);
  return m ? +m[0] : null;
};

async function getJSON(url, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Wandelt ein Open-Library-Suchergebnis in unser Buchformat. */
export function docToBook(doc, isbn = '') {
  const isbns = doc.isbn || [];
  const chosenIsbn = isbn || isbns.find((i) => i.length === 13) || isbns[0] || '';
  return {
    title: doc.title + (doc.subtitle ? `: ${doc.subtitle}` : ''),
    authors: doc.author_name || [],
    isbn: chosenIsbn,
    publisher: (doc.publisher || [])[0] || '',
    year: doc.first_publish_year || null,
    pages: doc.number_of_pages_median || null,
    coverUrl: doc.cover_i ? coverById(doc.cover_i) : isbn ? coverByIsbn(isbn) : '',
    subjects: cleanSubjects(doc.subject),
    workKey: doc.key || '',
    olRating: doc.ratings_average || null,
    olRatingCount: doc.ratings_count || 0,
  };
}

export async function searchBooks(query, { limit = 15, extra = '', sort = '' } = {}) {
  const params = new URLSearchParams({ q: query + extra, limit, fields: FIELDS });
  if (sort) params.set('sort', sort);
  const data = await getJSON(`${OL}/search.json?${params}`);
  return (data.docs || []).filter((d) => d.title).map((d) => docToBook(d));
}

async function olEdition(isbn) {
  const data = await getJSON(`${OL}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const d = data[`ISBN:${isbn}`];
  if (!d) return null;
  return {
    title: d.title + (d.subtitle ? `: ${d.subtitle}` : ''),
    authors: (d.authors || []).map((a) => a.name),
    publisher: d.publishers?.[0]?.name || '',
    year: parseYear(d.publish_date),
    pages: d.number_of_pages || null,
    coverUrl: d.cover?.medium || '',
    subjects: cleanSubjects((d.subjects || []).map((s) => s.name)),
  };
}

async function olWork(isbn) {
  const params = new URLSearchParams({ q: `isbn:${isbn}`, limit: 1, fields: FIELDS });
  const data = await getJSON(`${OL}/search.json?${params}`);
  return data.docs?.[0] ? docToBook(data.docs[0], isbn) : null;
}

async function googleBooks(isbn) {
  const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const v = data.items?.[0]?.volumeInfo;
  if (!v) return null;
  const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
  return {
    title: v.title + (v.subtitle ? `: ${v.subtitle}` : ''),
    authors: v.authors || [],
    publisher: v.publisher || '',
    year: parseYear(v.publishedDate),
    pages: v.pageCount || null,
    coverUrl: img.replace(/^http:/, 'https:'),
    subjects: cleanSubjects(v.categories),
  };
}

/**
 * Sucht ein Cover für ein Buch ohne Bild. Bevorzugt die deutsche Ausgabe
 * (Open Library liefert mit lang=de die passendste Ausgabe mit).
 */
export async function findCover(book) {
  const title = String(book.title || '').replace(/\(.*?\)|:.*$/g, '').trim();
  if (!title) return null;
  const params = new URLSearchParams({
    q: `${title} ${(book.authors || [])[0] || ''}`.trim(),
    lang: 'de',
    limit: 3,
    fields: 'key,title,cover_i,subject,editions,editions.cover_i,editions.language',
  });
  const data = await getJSON(`${OL}/search.json?${params}`);
  for (const doc of data.docs || []) {
    const edition = doc.editions?.docs?.[0];
    const id = edition?.cover_i || doc.cover_i;
    if (id) return { coverUrl: coverById(id), workKey: doc.key, subjects: cleanSubjects(doc.subject) };
  }
  return null;
}

/** Alle Cover der Ausgaben eines Werks – deutsche Ausgaben zuerst. */
export async function editionCovers(workKey) {
  const data = await getJSON(`${OL}${workKey}/editions.json?limit=100`);
  const seen = new Set();
  return (data.entries || [])
    .flatMap((e) =>
      (e.covers || []).filter((id) => id > 0).slice(0, 1).map((id) => ({
        id,
        url: coverById(id),
        title: e.title,
        german: (e.languages || []).some((l) => l.key === '/languages/ger'),
        year: parseYear(e.publish_date),
      })),
    )
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => b.german - a.german);
}

/**
 * Sucht ein Buch per ISBN. Kombiniert Ausgabe-Daten (Seiten, Verlag) mit den
 * Werk-Daten (Schlagwörter, Werk-ID) und fällt auf Google Books zurück.
 */
export async function lookupIsbn(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  const [edition, work] = (await Promise.allSettled([olEdition(isbn), olWork(isbn)])).map((r) =>
    r.status === 'fulfilled' ? r.value : null,
  );
  let google = null;
  if (!edition && !work) {
    google = await googleBooks(isbn).catch(() => null);
    if (!google) return null;
  }
  const base = { ...(google || {}), ...(work || {}) };
  const merged = { ...base };
  for (const [k, v] of Object.entries(edition || {})) {
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (!empty && !(k === 'subjects' && base.subjects?.length)) merged[k] = v;
  }
  merged.isbn = isbn;
  if (!merged.coverUrl) merged.coverUrl = coverByIsbn(isbn);

  // Deutsche Ausgaben haben oft keine Schlagwörter – dann beim Werk nachsehen.
  if (!merged.subjects?.length && merged.title) {
    const title = merged.title.replace(/\(.*?\)|:.*$/g, '').trim();
    const q = `${title} ${(merged.authors || [])[0] || ''}`.trim();
    const [hit] = await searchBooks(q, { limit: 1 }).catch(() => []);
    if (hit?.subjects?.length) {
      merged.subjects = hit.subjects;
      merged.workKey ||= hit.workKey;
    }
  }
  return merged;
}
