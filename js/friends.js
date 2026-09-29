// Freunde-API: Suche, Anfragen, Freundesliste und die Bücher von Freunden.

import { api, isLoggedIn, onAccountChange } from './account.js';

export const searchUsers = (q) => api(`/api/users/search?q=${encodeURIComponent(q)}`).then((r) => r.users);
export const getFriends = () => api('/api/friends');
export const addFriend = (id) => api(`/api/friends/${id}`, { method: 'POST', body: {} });
export const removeFriend = (id) => api(`/api/friends/${id}`, { method: 'DELETE' });
export const getFriendLibrary = (id) => api(`/api/friends/${id}/library`);

let incoming = 0;
const listeners = new Set();

/** Anzahl offener Freundschaftsanfragen (für das Abzeichen in der Navigation). */
export const incomingCount = () => incoming;
export function onIncomingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setIncoming(n) {
  incoming = n;
  listeners.forEach((fn) => fn(n));
}

export async function refreshIncoming() {
  if (!isLoggedIn()) return setIncoming(0);
  try {
    setIncoming((await getFriends()).incoming.length);
  } catch {
    /* offline – Abzeichen bleibt, wie es ist */
  }
}

export function initFriends() {
  let was = isLoggedIn();
  onAccountChange(() => {
    if (isLoggedIn() !== was) {
      was = isLoggedIn();
      refreshIncoming();
    }
  });
  refreshIncoming();
}
