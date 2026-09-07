(() => {
  const legacyLiked = 'auranails_liked';
  const luneLiked = 'lune_saved_work';

  const read = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  function getSaved() {
    const next = read(luneLiked, null);
    if (Array.isArray(next)) return next;
    return read(legacyLiked, []);
  }

  function persistSaved(ids) {
    write(luneLiked, ids);
    write(legacyLiked, ids); // compatibility until the recommendation engine moves to DB-backed state
  }

  window.isLiked = id => getSaved().includes(id);

  window.toggleLike = id => {
    const current = getSaved();
    const adding = !current.includes(id);
    const next = adding ? [...current, id] : current.filter(x => x !== id);
    persistSaved(next);
    window.LuneShell?.syncSavedCount?.();
    window.dispatchEvent(new CustomEvent('lune:taste-changed'));
    window.dispatchEvent(new CustomEvent('aura:taste-changed'));
    document.querySelectorAll(`.gallery-card[data-id="${CSS.escape(id)}"]`).forEach(card => {
      const button = card.querySelector('.action-circle-btn[title="Like"], .action-circle-btn[title="Save"], .action-circle-btn[title="Saved"]');
      if (!button) return;
      button.title = adding ? 'Saved' : 'Save';
      button.setAttribute('aria-label', adding ? 'Remove from saved' : 'Save this set');
      button.classList.toggle('is-saved', adding);
    });
  };

  window.shareSet = async id => {
    const set = Array.isArray(window.__allSetsRef) ? window.__allSetsRef.find(s => s.id === id) : null;
    if (!set) return;
    const url = new URL('work.html', window.location.href);
    url.searchParams.set('set', id);
    url.searchParams.set('ref', 'share');
    try {
      if (navigator.share) await navigator.share({ title: `${set.title} — Lune`, url: url.toString() });
      else await navigator.clipboard.writeText(url.toString());
    } catch (_) {}
  };

  function cleanGalleryActions() {
    document.querySelectorAll('.gallery-card').forEach(card => {
      const id = card.dataset.id;
      const actions = card.querySelector('.card-quick-actions');
      if (actions) {
        actions.querySelectorAll('[title="Download Image"], [title="Chat on WhatsApp"]').forEach(el => el.remove());
        const like = actions.querySelector('[title="Like"], [title="Saved"], [title="Save"]');
        if (like) {
          like.title = window.isLiked(id) ? 'Saved' : 'Save';
          like.setAttribute('aria-label', window.isLiked(id) ? 'Remove from saved' : 'Save this set');
        }
        const share = actions.querySelector('[title="Share Look"]');
        if (share) { share.title = 'Share link'; share.setAttribute('aria-label', 'Share this set'); }
      }
      const footer = card.querySelector('.card-footer-btns');
      if (footer && id) {
        footer.innerHTML = `<a class="btn-book-look" href="work.html?set=${encodeURIComponent(id)}">View set <span aria-hidden="true">→</span></a>`;
      }
      const deposit = [...card.querySelectorAll('.card-content > div')].find(el => /30% Deposit/i.test(el.textContent));
      if (deposit) deposit.remove();
    });
  }

  const observer = new MutationObserver(cleanGalleryActions);
  const boot = () => {
    cleanGalleryActions();
    const grid = document.getElementById('gallery-grid');
    if (grid) observer.observe(grid, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
