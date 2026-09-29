import {
  getUser, isLoggedIn, login, register, logout, updateProfile, changePassword, deleteAccount,
  sync, getSyncStatus, onAccountChange,
} from '../account.js';
import { getState } from '../store.js';
import { $, $$, esc, toast } from '../ui.js';

let tab = 'login';

const STATUS_TEXT = {
  idle: '',
  saving: 'Wird synchronisiert …',
  saved: '✓ Alle Änderungen sind in deinem Konto gespeichert.',
  offline: 'Offline – Änderungen werden hochgeladen, sobald wieder eine Verbindung besteht.',
  error: 'Synchronisierung fehlgeschlagen. Deine Daten sind lokal noch vorhanden.',
};

export function render(main, sub) {
  if (sub === 'registrieren') tab = 'register';
  const draw = () => (isLoggedIn() ? profileView : authView)(main);
  draw();
  // Status-Zeile live aktualisieren; bei An-/Abmelden neu zeichnen.
  let wasLoggedIn = isLoggedIn();
  return onAccountChange(() => {
    if (isLoggedIn() !== wasLoggedIn) {
      wasLoggedIn = isLoggedIn();
      draw();
      return;
    }
    const el = $('#sync-status', main);
    if (el) el.textContent = STATUS_TEXT[getSyncStatus()];
  });
}

/** Formular mit Fehleranzeige und gesperrtem Button während der Anfrage. */
function handleForm(form, handler) {
  const msg = $('.form-msg', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    msg.textContent = '';
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function authView(main) {
  const localBooks = getState().books.length;
  main.innerHTML = `
    <section class="page narrow">
      <h1>Konto</h1>
      <p class="muted">Mit einem Konto werden deine Bücher, Bewertungen und Rezensionen gespeichert
        und sind auf all deinen Geräten verfügbar.</p>
      <div class="tabs" role="tablist">
        <button role="tab" class="tab" data-tab="login">Anmelden</button>
        <button role="tab" class="tab" data-tab="register">Registrieren</button>
      </div>

      <form class="card" id="login-form" hidden>
        <label class="field"><span class="label">Benutzername oder E-Mail</span>
          <input name="login" required autocomplete="username"></label>
        <label class="field"><span class="label">Passwort</span>
          <input name="password" type="password" required autocomplete="current-password"></label>
        <button type="submit" class="btn btn-primary">Anmelden</button>
        <p class="form-msg error" role="alert"></p>
      </form>

      <form class="card" id="register-form" hidden>
        <div class="field-row">
          <label class="field"><span class="label">Benutzername</span>
            <input name="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_.\\-]+"
              autocomplete="username" title="3–32 Zeichen: Buchstaben, Zahlen, _ . -"></label>
          <label class="field"><span class="label">Anzeigename (optional)</span>
            <input name="displayName" maxlength="64" autocomplete="name"></label>
        </div>
        <label class="field"><span class="label">E-Mail</span>
          <input name="email" type="email" required autocomplete="email"></label>
        <div class="field-row">
          <label class="field"><span class="label">Passwort (mind. 8 Zeichen)</span>
            <input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
          <label class="field"><span class="label">Passwort wiederholen</span>
            <input name="passwordRepeat" type="password" required minlength="8" autocomplete="new-password"></label>
        </div>
        <button type="submit" class="btn btn-primary">Konto erstellen</button>
        <p class="form-msg error" role="alert"></p>
      </form>

      ${localBooks ? `<p class="muted small">Die ${localBooks} Bücher in diesem Browser werden beim Anmelden
        in dein Konto übernommen.</p>` : ''}
    </section>`;

  const show = (name) => {
    tab = name;
    $$('[data-tab]', main).forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === name);
      b.setAttribute('aria-selected', b.dataset.tab === name);
    });
    $('#login-form', main).hidden = name !== 'login';
    $('#register-form', main).hidden = name !== 'register';
  };
  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show(tab);

  const welcome = (added) => {
    toast(added ? `Angemeldet – ${added} Bücher aus diesem Browser übernommen` : 'Angemeldet');
    location.hash = '#/regal';
  };
  handleForm($('#login-form', main), async (data) => welcome(await login(data)));
  handleForm($('#register-form', main), async ({ passwordRepeat, ...data }) => {
    if (data.password !== passwordRepeat) throw new Error('Die Passwörter stimmen nicht überein.');
    welcome(await register(data));
  });
}

function profileView(main) {
  const user = getUser() || {};
  const since = user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-DE') : '';
  main.innerHTML = `
    <section class="page narrow">
      <h1>Hallo, ${esc(user.displayName || user.username)}!</h1>

      <div class="card">
        <dl class="kv">
          <dt>Benutzername</dt><dd>${esc(user.username)}</dd>
          <dt>E-Mail</dt><dd>${esc(user.email)}</dd>
          ${since ? `<dt>Mitglied seit</dt><dd>${since}</dd>` : ''}
          <dt>Bücher</dt><dd>${getState().books.length}</dd>
        </dl>
        <p class="small muted" id="sync-status" aria-live="polite">${STATUS_TEXT[getSyncStatus()]}</p>
        <div class="row wrap">
          <button class="btn" id="sync-now">Jetzt synchronisieren</button>
          <button class="btn" id="logout">Abmelden</button>
        </div>
      </div>

      <form class="card" id="profile-form">
        <h2 class="card-title">Profil</h2>
        <label class="field"><span class="label">Anzeigename</span>
          <input name="displayName" maxlength="64" required value="${esc(user.displayName)}"></label>
        <label class="field"><span class="label">Über mich</span>
          <textarea name="bio" rows="3" maxlength="1000">${esc(user.bio)}</textarea></label>
        <button type="submit" class="btn btn-primary">Speichern</button>
        <p class="form-msg error" role="alert"></p>
      </form>

      <form class="card" id="password-form">
        <h2 class="card-title">Passwort ändern</h2>
        <div class="field-row">
          <label class="field"><span class="label">Aktuelles Passwort</span>
            <input name="currentPassword" type="password" required autocomplete="current-password"></label>
          <label class="field"><span class="label">Neues Passwort (mind. 8 Zeichen)</span>
            <input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></label>
        </div>
        <button type="submit" class="btn">Passwort ändern</button>
        <p class="form-msg error" role="alert"></p>
      </form>

      <form class="card" id="delete-form">
        <h2 class="card-title">Konto löschen</h2>
        <p class="muted small">Dein Konto und alle gespeicherten Bücher werden endgültig vom Server gelöscht.
          Lade vorher unter ⚙ Einstellungen eine Sicherung herunter, wenn du deine Daten behalten willst.</p>
        <label class="field"><span class="label">Passwort zur Bestätigung</span>
          <input name="password" type="password" required autocomplete="current-password"></label>
        <button type="submit" class="btn btn-danger">Konto löschen</button>
        <p class="form-msg error" role="alert"></p>
      </form>
    </section>`;

  $('#sync-now', main).addEventListener('click', async () => {
    await sync();
    toast(getSyncStatus() === 'saved' ? 'Synchronisiert' : STATUS_TEXT[getSyncStatus()]);
  });
  $('#logout', main).addEventListener('click', async () => {
    if (!confirm('Abmelden? Deine Bücher bleiben im Konto gespeichert, werden aber aus diesem Browser entfernt.')) return;
    await logout();
    toast('Abgemeldet');
  });
  handleForm($('#profile-form', main), async (data) => {
    await updateProfile(data);
    toast('Profil gespeichert');
    profileView(main);
  });
  handleForm($('#password-form', main), async (data) => {
    await changePassword(data);
    $('#password-form', main).reset();
    toast('Passwort geändert – andere Geräte wurden abgemeldet');
  });
  handleForm($('#delete-form', main), async ({ password }) => {
    if (!confirm('Konto und alle Bücher wirklich endgültig löschen?')) return;
    await deleteAccount(password);
    toast('Konto gelöscht');
  });
}
