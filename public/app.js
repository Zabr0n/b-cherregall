// Small helpers shared by all pages.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Unbekannter Fehler'), { status: res.status });
  return data;
}

export async function currentUser() {
  try {
    return (await api('/api/me')).user;
  } catch {
    return null;
  }
}

export function showMessage(el, text, kind = 'error') {
  el.textContent = text;
  el.className = `message ${kind}`;
}

// Wires a <form> to an async handler: collects fields, disables the button, shows errors.
export function handleForm(form, handler) {
  const message = form.querySelector('.message');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    showMessage(message, '', '');
    try {
      await handler(Object.fromEntries(new FormData(form)), message);
    } catch (err) {
      showMessage(message, err.message);
    } finally {
      button.disabled = false;
    }
  });
}
