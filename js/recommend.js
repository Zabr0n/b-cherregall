// Empfehlungen auf Basis deiner Bewertungen.
//
// 1. Aus allen bewerteten Büchern wird ein Geschmacksprofil gebaut: Jede Bewertung
//    wird um 3 Sterne zentriert (5★ → +2, 1★ → −2) und auf Schlagwörter und
//    Autor:innen verteilt. Was du magst, bekommt positives Gewicht, was du nicht
//    magst, negatives – Allerweltsbegriffe wie „fiction“ heben sich so auf.
// 2. Kandidaten (ungelesene Bücher im Regal oder Treffer aus Open Library) werden
//    gegen dieses Profil gewertet und mit einer Begründung versehen.

import { searchBooks } from './api.js';
import { bookKey } from './store.js';

// Sehr allgemeine Begriffe zählen weniger.
const GENERIC = new Set(['fiction', 'novel', 'novels', 'roman', 'romane', 'belletristik', 'classics', 'english', 'german', 'american', 'literary', 'literary fiction', 'large type books', 'fiction in german', 'popular works', 'history', 'readers', 'children']);

function bookWeight(b) {
  if (b.rating > 0) return b.rating - 3;
  if (b.status === 'read') return 0.5; // zu Ende gelesen, aber nicht bewertet
  return 0;
}

export function buildProfile(books) {
  const subjects = new Map();
  const authors = new Map();
  let ratedCount = 0;
  for (const b of books) {
    const w = bookWeight(b);
    if (!w) continue;
    if (b.rating > 0) ratedCount++;
    const subs = b.subjects || [];
    const share = w / Math.sqrt(subs.length || 1);
    for (const s of subs) {
      const damp = GENERIC.has(s) ? 0.3 : 1;
      subjects.set(s, (subjects.get(s) || 0) + share * damp);
    }
    for (const a of b.authors || []) authors.set(a, (authors.get(a) || 0) + w);
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    subjects,
    authors,
    ratedCount,
    topSubjects: sorted(subjects).filter(([, v]) => v > 0),
    topAuthors: sorted(authors).filter(([, v]) => v > 0),
    dislikedSubjects: sorted(subjects).filter(([, v]) => v < 0).reverse(),
    dislikedAuthors: sorted(authors).filter(([, v]) => v < 0).reverse(),
  };
}

/** Wertet einen Kandidaten gegen das Profil. Liefert Score + Begründung. */
export function scoreCandidate(profile, cand, library) {
  const subs = cand.subjects || [];
  let subjectScore = 0;
  const matches = [];
  for (const s of subs) {
    const w = profile.subjects.get(s);
    if (w) {
      subjectScore += w;
      if (w > 0) matches.push([s, w]);
    }
  }
  subjectScore /= Math.sqrt(subs.length || 1);

  let authorScore = 0;
  let author = null;
  // Hauptautor:in zählt voll; Mitwirkende in Anthologien kaum.
  (cand.authors || []).forEach((a, i) => {
    const w = profile.authors.get(a) || 0;
    authorScore += i === 0 ? w : w * 0.15;
    if (w > 0 && i === 0) author = a;
  });

  // Leichter Bonus für Bücher, die anderen Leser:innen gefallen haben.
  const community = cand.olRating && cand.olRatingCount >= 3 ? (cand.olRating - 3) * 0.15 : 0;
  const score = subjectScore + authorScore * 0.8 + community;

  // Das eigene Lieblingsbuch mit der größten Überschneidung als Anker.
  let because = null;
  let bestOverlap = 0;
  for (const b of library) {
    if (!(b.rating >= 4) || b === cand) continue;
    const shared = (b.subjects || []).filter((s) => subs.includes(s)).length;
    const sameAuthor = (b.authors || []).some((a) => (cand.authors || []).includes(a)) ? 3 : 0;
    const overlap = shared + sameAuthor + b.rating * 0.1;
    if ((shared || sameAuthor) && overlap > bestOverlap) {
      bestOverlap = overlap;
      because = b;
    }
  }

  const tags = matches.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
  return { score, because, author, tags };
}

/** Ungelesene Bücher aus dem eigenen Regal, sortiert nach Passung. */
export function shelfPicks(books, profile) {
  return books
    .filter((b) => b.status === 'unread')
    .map((b) => ({ book: b, ...scoreCandidate(profile, b, books) }))
    .sort((a, b) => b.score - a.score);
}

const CACHE_KEY = 'buecherregal.recs';

function profileSignature(profile, settings, dismissed) {
  return JSON.stringify([
    profile.topSubjects.slice(0, 5).map(([s]) => s),
    profile.topAuthors.slice(0, 3).map(([a]) => a),
    settings.germanRecs,
    dismissed.length,
  ]);
}

/**
 * Holt neue Vorschläge von Open Library anhand der Lieblings-Schlagwörter und
 * -Autor:innen, filtert Bekanntes heraus und sortiert nach Passung.
 */
export async function discover(state, { force = false } = {}) {
  const { books, settings, dismissed } = state;
  const profile = buildProfile(books);
  const sig = profileSignature(profile, settings, dismissed);

  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.sig === sig) return rescore(cached.items, profile, books, dismissed);
    } catch { /* Cache ist optional */ }
  }

  const extra = settings.germanRecs ? ' language:ger' : '';
  const seeds = [
    ...profile.topSubjects.slice(0, 4).map(([s]) => ({ q: `subject:"${s}"`, sort: 'readinglog' })),
    ...profile.topAuthors.slice(0, 2).map(([a]) => ({ q: `author:"${a}"`, sort: '' })),
  ];
  if (!seeds.length) return [];

  const results = await Promise.allSettled(
    seeds.map((s) => searchBooks(s.q, { limit: 25, extra, sort: s.sort })),
  );
  const failed = results.every((r) => r.status === 'rejected');
  if (failed) throw new Error('Open Library ist gerade nicht erreichbar.');

  const seen = new Set();
  const items = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const c of r.value) {
      const k = c.workKey || bookKey(c);
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(c);
    }
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ sig, items }));
  } catch { /* egal */ }
  return rescore(items, profile, books, dismissed);
}

function rescore(items, profile, books, dismissed) {
  const ownedKeys = new Set(books.map(bookKey));
  const ownedWorks = new Set(books.map((b) => b.workKey).filter(Boolean));
  return items
    .filter((c) => !ownedWorks.has(c.workKey) && !ownedKeys.has(bookKey(c)))
    .filter((c) => !dismissed.includes(c.workKey || bookKey(c)))
    .map((c) => ({ book: c, ...scoreCandidate(profile, c, books) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter(diverse(2))
    .slice(0, 24);
}

/** Höchstens `max` Vorschläge pro Autor:in, damit die Liste abwechslungsreich bleibt. */
function diverse(max) {
  const perAuthor = new Map();
  return (r) => {
    const a = (r.book.authors || [])[0] || '';
    const n = (perAuthor.get(a) || 0) + 1;
    perAuthor.set(a, n);
    return n <= max;
  };
}
