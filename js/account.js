// Benutzerkonto und Synchronisierung der Bibliothek mit dem Server (api/).
//
// Ablauf: Nach dem Anmelden werden Server- und lokale Bücher zusammengeführt. Danach wird jede
// Änderung kurz verzögert hochgeladen. Beim Öffnen der App gilt der Serverstand – außer es gibt
// lokale Änderungen, die noch nicht hochgeladen wurden (z. B. offline gemacht).

import { API_URL } from './config.js';
import { getState, replaceState, importJSON, subscribe } from './store.js';

const TOKEN_KEY = 'buecherregal.token';
const USER_KEY = 'buecherregal.user';
const DIRTY_KEY = 'buecherregal.unsynced';
const PUSH_DELAY_MS = 1500;

let applyingRemote = false;
let pushTimer = null;
let status = 'idle'; // idle | saving | saved | offline | error
const listeners = new Set();

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Speichern nicht möglich (z. B. privater Modus) */
  }
}

export const getToken = () => read(TOKEN_KEY);
export function getUser() {
  try {
    return JSON.parse(read(USER_KEY));
  } catch {
    return null;
  }
}
export const isLoggedIn = () => !!getToken();
export const getSyncStatus = () => status;

/** Wird bei Anmeldung/Abmeldung und bei Änderungen des Sync-Status aufgerufen. */
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn({ user: getUser(), status }));

function setStatus(next) {
  status = next;
  notify();
}

function setSession(token, user) {
  write(TOKEN_KEY, token);
  write(USER_KEY, user ? JSON.stringify(user) : null);
  notify();
}

export async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      keepalive,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Server nicht erreichbar. Bitte später erneut versuchen.'), { offline: true });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    // Sitzung abgelaufen oder auf einem anderen Gerät beendet (z. B. nach Passwortänderung).
    // Lokale Daten bleiben erhalten, bis sich jemand neu anmeldet.
    setSession(null, null);
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Unbekannter Fehler'), { status: res.status });
  return data;
}

function applyRemote(data) {
  applyingRemote = true;
  try {
    replaceState(data);
  } finally {
    applyingRemote = false;
  }
  // Die Ansichten zeichnen sich nicht selbst neu – der Router übernimmt das (siehe app.js).
  window.dispatchEvent(new Event('library:replaced'));
}

async function push() {
  clearTimeout(pushTimer);
  pushTimer = null;
  if (!isLoggedIn()) return;
  setStatus('saving');
  try {
    await api('/api/library', { method: 'PUT', body: { data: getState() } });
    write(DIRTY_KEY, null);
    setStatus('saved');
  } catch (err) {
    setStatus(err.offline ? 'offline' : 'error');
  }
}

/** Nach dem Anmelden: Konto-Bücher laden und die Bücher aus diesem Browser dazunehmen. */
async function mergeAfterLogin() {
  const { data } = await api('/api/library');
  const localBooks = getState().books;
  if (data) applyRemote(data);
  const added = data ? importJSON(JSON.stringify({ books: localBooks }), 'merge') : localBooks.length;
  await push();
  return added;
}

export async function register(fields) {
  const { token, user } = await api('/api/register', { method: 'POST', body: fields });
  setSession(token, user);
  return mergeAfterLogin();
}

export async function login(fields) {
  const { token, user } = await api('/api/login', { method: 'POST', body: fields });
  setSession(token, user);
  return mergeAfterLogin();
}

export async function logout() {
  if (pushTimer) await push();
  await api('/api/logout', { method: 'POST', body: {} }).catch(() => {});
  setSession(null, null);
  write(DIRTY_KEY, null);
  // Die Bücher liegen im Konto – auf diesem Gerät nicht mehr sichtbar lassen.
  applyRemote({ books: [] });
  setStatus('idle');
}

export async function updateProfile(fields) {
  const { user } = await api('/api/me', { method: 'PUT', body: fields });
  setSession(getToken(), user);
  return user;
}

export const changePassword = (fields) => api('/api/me/password', { method: 'PUT', body: fields });

export async function deleteAccount(password) {
  await api('/api/me', { method: 'DELETE', body: { password } });
  setSession(null, null);
  write(DIRTY_KEY, null);
  applyRemote({ books: [] });
  setStatus('idle');
}

/** Lädt den aktuellen Stand vom Server (oder lädt ungesicherte lokale Änderungen hoch). */
export async function sync() {
  if (!isLoggedIn()) return;
  if (read(DIRTY_KEY)) return push();
  setStatus('saving');
  try {
    const [{ user }, { data }] = await Promise.all([api('/api/me'), api('/api/library')]);
    setSession(getToken(), user);
    if (data) applyRemote(data);
    else await push();
    setStatus('saved');
  } catch (err) {
    setStatus(err.offline ? 'offline' : 'error');
  }
}

export function initAccount() {
  subscribe(() => {
    if (applyingRemote || !isLoggedIn()) return;
    write(DIRTY_KEY, '1');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY_MS);
  });
  // Beim Schließen des Tabs noch ausstehende Änderungen senden.
  window.addEventListener('pagehide', () => {
    if (pushTimer && isLoggedIn()) {
      api('/api/library', { method: 'PUT', body: { data: getState() }, keepalive: true }).catch(() => {});
    }
  });
  window.addEventListener('online', () => read(DIRTY_KEY) && push());
  sync();
}
