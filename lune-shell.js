(() => {
  const STORAGE = {
    identity: 'lune_identity',
    savedWork: 'lune_saved_work',
    savedInspo: 'lune_saved_inspo',
    tasteEvents: 'lune_taste_events'
  };

  const LEGACY = {
    savedWork: 'auranails_liked',
    savedInspo: 'aura_inspo_saved',
    tasteEvents: 'aura_taste_events_v4'
  };

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  function migrateLegacyState() {
    const pairs = [
      [STORAGE.savedWork, LEGACY.savedWork, []],
      [STORAGE.savedInspo, LEGACY.savedInspo, []],
      [STORAGE.tasteEvents, LEGACY.tasteEvents, []]
    ];
    pairs.forEach(([next, old, fallback]) => {
      if (localStorage.getItem(next) == null && localStorage.getItem(old) != null) write(next, read(old, fallback));
    });
  }

  function getIdentity() {
    return read(STORAGE.identity, { state: 'anonymous' });
  }

  function setIdentity(next) {
    const value = { state: next?.state === 'member' ? 'member' : 'anonymous', firstName: next?.firstName || '' };
    write(STORAGE.identity, value);
    syncIdentity();
    window.dispatchEvent(new CustomEvent('lune:identity-changed', { detail: value }));
  }

  function savedTotal() {
    const work = read(STORAGE.savedWork, read(LEGACY.savedWork, []));
    const inspo = read(STORAGE.savedInspo, read(LEGACY.savedInspo, []));
    return new Set(work || []).size + (Array.isArray(inspo) ? inspo.length : 0);
  }

  function syncIdentity() {
    const identity = getIdentity();
    document.documentElement.dataset.identity = identity.state;
    document.querySelectorAll('[data-account-label]').forEach(el => {
      el.textContent = identity.state === 'member' && identity.firstName ? identity.firstName : 'My Lune';
    });
    document.querySelectorAll('[data-account-state]').forEach(el => {
      el.textContent = identity.state === 'member' ? 'Signed in' : 'Guest';
    });
  }

  function syncSavedCount() {
    const total = savedTotal();
    document.querySelectorAll('[data-saved-count]').forEach(el => {
      el.textContent = total ? String(total) : '';
      el.setAttribute('aria-label', total ? `${total} saved` : 'No saved items');
    });
  }

  function syncRoute() {
    const file = location.pathname.split('/').pop() || 'index.html';
    const route = file === '' ? 'index.html' : file;
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = (link.getAttribute('href') || '').split('?')[0];
      if (!href) return;
      if (href === route || (route === 'index.html' && href === 'index.html')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function markPage() {
    const cls = [...document.body.classList].find(c => c.startsWith('lune-') && c.endsWith('-page'));
    if (cls) document.body.dataset.page = cls.replace(/^lune-/, '').replace(/-page$/, '');
  }

  function loadDataBridge() {
    if (document.querySelector('script[data-lune-stashi]')) return;
    const script = document.createElement('script');
    script.src = 'lune-stashi.js?v=20260907a';
    script.dataset.luneStashi = '1';
    document.head.appendChild(script);
  }

  function init() {
    migrateLegacyState();
    syncIdentity();
    syncSavedCount();
    syncRoute();
    markPage();

    window.addEventListener('storage', e => {
      if ([STORAGE.identity, STORAGE.savedWork, STORAGE.savedInspo, LEGACY.savedWork, LEGACY.savedInspo].includes(e.key)) {
        syncIdentity();
        syncSavedCount();
      }
    });
    window.addEventListener('lune:taste-changed', syncSavedCount);
    window.addEventListener('aura:taste-changed', syncSavedCount);
    window.addEventListener('pageshow', () => { syncIdentity(); syncSavedCount(); syncRoute(); });
  }

  window.LuneShell = { STORAGE, getIdentity, setIdentity, savedTotal, syncSavedCount };

  loadDataBridge();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
