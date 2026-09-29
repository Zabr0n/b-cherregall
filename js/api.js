// Buchdaten von Open Library, der Deutschen Nationalbibliothek (ISBN-Suche) und Google Books.

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

async function getJSON(url, opts) {
  return (await getResponse(url, opts)).json();
}

async function getResponse(url, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Body mitlesen, solange der Timeout noch greift.
    const body = await res.text();
    return { json: () => JSON.parse(body), text: () => body };
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
    googleLink: (v.infoLink || v.canonicalVolumeLink || '').replace(/^http:/, 'https:'),
  };
}

// ---------- Deutsche Nationalbibliothek ----------
// Kennt praktisch jedes in Deutschland erschienene Buch – auch ganz neue, die Open Library und
// Google Books (noch) nicht haben. Die SRU-Schnittstelle ist frei und erlaubt Browser-Anfragen (CORS).

const DNB = 'https://services.dnb.de/sru/dnb';
// Gattungsbegriffe der DNB, die als Schlagwort nichts über das Buch aussagen.
const DNB_GENERIC = /^(fiktionale darstellung|erzählende literatur|belletristische darstellung|text)$/i;

/** Liest einen DNB-Datensatz (MARC21-XML) in unser Buchformat. */
export function parseDnbRecord(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const record = [...doc.getElementsByTagName('record')].find((r) => r.getElementsByTagName('datafield').length);
  if (!record) return null;

  // Steuer- und Sortierzeichen (z. B. „¬Das¬ Parfum“), Wortverbinder und Satzzeichen am Ende entfernen.
  const clean = (v) => String(v || '').replace(/[\u0098\u009c\u2060\u200b]/g, '').replace(/\s+/g, ' ').replace(/\s*[/:;,]\s*$/, '').trim();
  const fields = (tag) => [...record.getElementsByTagName('datafield')].filter((f) => f.getAttribute('tag') === tag);
  const sub = (field, code) => clean([...field.getElementsByTagName('subfield')].find((s) => s.getAttribute('code') === code)?.textContent);
  const all = (tag, code) => fields(tag).map((f) => sub(f, code)).filter(Boolean);
  const first = (tag, code) => all(tag, code)[0] || '';
  // „Nachname, Vorname“ → „Vorname Nachname“
  const person = (name) => name.replace(/^([^,]+),\s*(.+)$/, '$2 $1');

  const title = first('245', 'a');
  if (!title) return null;
  const subtitle = first('245', 'b');
  const authors = [
    ...all('100', 'a'),
    ...fields('700').filter((f) => sub(f, '4') === 'aut').map((f) => sub(f, 'a')),
  ].map(person);
  const control008 = [...record.getElementsByTagName('controlfield')].find((f) => f.getAttribute('tag') === '008')?.textContent || '';
  const pages = (first('300', 'a').match(/(\d+)\s*(?:Seiten|S\.|p\.?)/) || [])[1];

  return {
    title: subtitle ? `${title}: ${subtitle}` : title,
    authors: [...new Set(authors)],
    publisher: first('264', 'b') || first('260', 'b'),
    year: parseYear(first('264', 'c') || first('260', 'c')) || parseYear(control008.slice(7, 11)),
    pages: pages ? +pages : null,
    subjects: cleanSubjects([
      ...all('926', 'x'), // Warengruppe des Verlags, z. B. „Dark Romance“
      ...all('650', 'a'),
      ...all('653', 'a').filter((v) => !v.startsWith('(')), // „(Produktform)…“ usw. auslassen
      ...all('655', 'a'),
    ].filter((v) => !DNB_GENERIC.test(v))),
  };
}

async function dnbBook(isbn) {
  const params = new URLSearchParams({
    version: '1.1',
    operation: 'searchRetrieve',
    query: `num=${isbn}`,
    recordSchema: 'MARC21-xml',
    maximumRecords: '1',
  });
  const res = await getResponse(`${DNB}?${params}`);
  return parseDnbRecord(res.text());
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
 * Sucht ein Buch per ISBN. Kombiniert Open Library (Ausgabe und Werk) mit der Deutschen
 * Nationalbibliothek und fällt auf Google Books zurück.
 */
export async function lookupIsbn(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  const [edition, work, dnb] = (await Promise.allSettled([olEdition(isbn), olWork(isbn), dnbBook(isbn)])).map((r) =>
    r.status === 'fulfilled' ? r.value : null,
  );
  let google = null;
  if (!edition && !work && !dnb) {
    google = await googleBooks(isbn).catch(() => null);
    if (!google) return null;
  }
  // Spätere Quellen gewinnen: Google < Open-Library-Werk < DNB (deutscher Titel, Verlag) < Open-Library-Ausgabe.
  const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
  const merged = {};
  for (const source of [google, work, dnb, edition]) {
    for (const [k, v] of Object.entries(source || {})) if (!empty(v)) merged[k] = v;
  }
  // Schlagwörter: die (englischen) von Open Library passen am besten zu den Empfehlungen.
  merged.subjects = [work, edition, dnb, google].find((x) => x?.subjects?.length)?.subjects || [];
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
