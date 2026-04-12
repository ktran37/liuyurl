// ── DOM refs ──────────────────────────────────────────────────────────────────
const form           = document.getElementById('shorten-form');
const urlInput       = document.getElementById('url-input');
const shortenBtn     = document.getElementById('shorten-btn');
const errorMsg       = document.getElementById('error-msg');
const result         = document.getElementById('result');
const shortLink      = document.getElementById('short-link');
const originalPreview = document.getElementById('original-preview');
const copyBtn        = document.getElementById('copy-btn');
const urlList        = document.getElementById('url-list');
const refreshBtn     = document.getElementById('refresh-btn');
const toast          = document.getElementById('toast');
const historyTitle   = document.getElementById('history-title');
const headerAuth     = document.getElementById('header-auth');
const typePills      = document.getElementById('type-pills');
const expiryRow      = document.getElementById('expiry-row');
const expiryPills    = document.getElementById('expiry-pills');
const aliasInput     = document.getElementById('alias-input');
const authModal      = document.getElementById('auth-modal');
const modalClose     = document.getElementById('modal-close');
const loginForm      = document.getElementById('login-form');
const registerForm   = document.getElementById('register-form');
const loginError     = document.getElementById('login-error');
const regError       = document.getElementById('reg-error');

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser  = null;
let selectedType   = 'public';
let selectedExpiry = '24h';
let toastTimer;

// ── Utilities ─────────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}
function clearError() {
  errorMsg.textContent = '';
  errorMsg.classList.add('hidden');
}
function showToast(msg = 'Copied!') {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function truncate(str, max = 55) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
function timeUntil(iso) {
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'Expired';
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d left`;
  if (h > 0) return `${h}h left`;
  return `${m}m left`;
}
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Header / auth state ───────────────────────────────────────────────────────
function renderHeader() {
  if (currentUser) {
    headerAuth.innerHTML = `
      <span class="user-greeting">Hi, <strong>${currentUser.username}</strong></span>
      <button id="logout-btn" class="btn-logout">Log out</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', logout);
    historyTitle.textContent = 'Your Links';
  } else {
    headerAuth.innerHTML = `<button id="auth-btn" class="btn-auth">Log in</button>`;
    document.getElementById('auth-btn').addEventListener('click', () => openModal('login'));
    historyTitle.textContent = 'Recent Links';
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────────
async function fetchMe() {
  const res = await fetch('/api/auth/me');
  return res.json();
}
async function apiLogin(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}
async function apiRegister(username, email, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  return res.json();
}
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  renderHeader();
  loadAndRender();
}

// ── Auth modal ────────────────────────────────────────────────────────────────
function openModal(tab = 'login') {
  authModal.classList.remove('hidden');
  switchTab(tab);
}
function closeModal() {
  authModal.classList.add('hidden');
  loginError.classList.add('hidden');
  regError.classList.add('hidden');
  loginForm.reset();
  registerForm.reset();
}
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  loginForm.classList.toggle('hidden', tab !== 'login');
  registerForm.classList.toggle('hidden', tab !== 'register');
}

modalClose.addEventListener('click', closeModal);
authModal.addEventListener('click', e => { if (e.target === authModal) closeModal(); });
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
);

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const data = await apiLogin(email, password);
  if (data.error) {
    loginError.textContent = data.error;
    loginError.classList.remove('hidden');
    return;
  }
  currentUser = data;
  closeModal();
  renderHeader();
  loadAndRender();
  showToast(`Welcome back, ${data.username}!`);
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  regError.classList.add('hidden');
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const data = await apiRegister(username, email, password);
  if (data.error) {
    regError.textContent = data.error;
    regError.classList.remove('hidden');
    return;
  }
  currentUser = data;
  closeModal();
  renderHeader();
  loadAndRender();
  showToast(`Welcome, ${data.username}!`);
});

// ── Type / Expiry selector ────────────────────────────────────────────────────
typePills.addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn || !btn.dataset.type) return;

  if (btn.dataset.type === 'private' && !currentUser) {
    openModal('login');
    showToast('Log in to create private links');
    return;
  }

  typePills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  selectedType = btn.dataset.type;
  expiryRow.classList.toggle('hidden', selectedType !== 'temporary');
});

expiryPills.addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn || !btn.dataset.expiry) return;
  expiryPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  selectedExpiry = btn.dataset.expiry;
});

// ── URL API ───────────────────────────────────────────────────────────────────
async function shortenUrl(url, type, expiresIn, alias) {
  const res = await fetch('/api/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type, expiresIn, alias: alias || undefined }),
  });
  return res.json();
}
async function loadUrls() {
  const res = await fetch('/api/urls');
  return res.json();
}
async function deleteUrl(code) {
  const res = await fetch(`/api/urls/${code}`, { method: 'DELETE' });
  return res.json();
}

// ── Render URL list ───────────────────────────────────────────────────────────
const BADGE = {
  public:    { label: 'Public',    cls: 'badge-public'   },
  private:   { label: 'Private',  cls: 'badge-private'  },
  temporary: { label: 'Temp',     cls: 'badge-temp'     },
};

function renderUrls(urls) {
  if (!urls.length) {
    urlList.innerHTML = '<p class="empty-state">No links yet. Shorten your first URL above!</p>';
    return;
  }

  urlList.innerHTML = urls.map(item => {
    const badge    = BADGE[item.type] || BADGE.public;
    const expiry   = item.expiresAt
      ? `<span class="expiry-tag">${timeUntil(item.expiresAt)}</span>` : '';
    const canDelete = currentUser && item.userId === currentUser.id;

    return `
      <div class="url-card" data-code="${item.code}">
        <div class="url-card-info">
          <div class="url-card-top">
            <a class="url-card-short" href="${item.shortUrl}" target="_blank">${item.shortUrl}</a>
            <span class="badge ${badge.cls}">${badge.label}</span>
            ${expiry}
          </div>
          <span class="url-card-original" title="${item.originalUrl}">${truncate(item.originalUrl)}</span>
          <div class="url-card-meta">
            <span class="url-card-clicks">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              ${item.clicks} click${item.clicks !== 1 ? 's' : ''}
            </span>
            <span>${formatDate(item.createdAt)}</span>
          </div>
        </div>
        <div class="url-card-actions">
          <button class="btn-icon copy-card-btn" title="Copy" data-url="${item.shortUrl}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          ${canDelete ? `
          <button class="btn-icon delete delete-btn" title="Delete" data-code="${item.code}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  urlList.querySelectorAll('.copy-card-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await copyToClipboard(btn.dataset.url);
      showToast();
    });
  });

  urlList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await deleteUrl(btn.dataset.code);
      if (res.error) { showToast(res.error); btn.disabled = false; return; }
      const card = urlList.querySelector(`[data-code="${btn.dataset.code}"]`);
      if (card) card.remove();
      if (!urlList.querySelector('.url-card'))
        urlList.innerHTML = '<p class="empty-state">No links yet. Shorten your first URL above!</p>';
    });
  });
}

async function loadAndRender() {
  const urls = await loadUrls();
  renderUrls(urls);
}

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();
  clearError();

  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a URL.'); return; }

  shortenBtn.disabled = true;
  shortenBtn.textContent = 'Shortening…';

  try {
    const alias = aliasInput.value.trim();
    const data  = await shortenUrl(url, selectedType, selectedExpiry, alias);
    if (data.error) { showError(data.error); return; }

    shortLink.href = data.shortUrl;
    shortLink.textContent = data.shortUrl;
    originalPreview.textContent = truncate(data.originalUrl, 60);
    result.classList.remove('hidden');
    urlInput.value  = '';
    aliasInput.value = '';

    await loadAndRender();
  } catch {
    showError('Something went wrong. Please try again.');
  } finally {
    shortenBtn.disabled = false;
    shortenBtn.textContent = 'Shorten';
  }
});

// ── Copy result button ────────────────────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  await copyToClipboard(shortLink.href);
  copyBtn.textContent = 'Copied!';
  copyBtn.classList.add('copied');
  showToast();
  setTimeout(() => {
    copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg> Copy`;
    copyBtn.classList.remove('copied');
  }, 2000);
});

// ── Refresh ───────────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', loadAndRender);

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  currentUser = await fetchMe();
  renderHeader();
  await loadAndRender();
})();
