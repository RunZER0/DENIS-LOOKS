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
  const slugify = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function getSaved() {
    const next = read(luneLiked, null);
    if (Array.isArray(next)) return next;
    return read(legacyLiked, []);
  }

  function persistSaved(ids) {
    write(luneLiked, ids);
    write(legacyLiked, ids);
  }

  const isLiked = id => getSaved().includes(id);

  function toggleLike(id) {
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
  }

  async function shareUrl(title, url) {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
    } catch (_) {}
  }

  async function shareSet(id) {
    const set = Array.isArray(window.__allSetsRef) ? window.__allSetsRef.find(s => s.id === id) : null;
    if (!set) return;
    const url = new URL('work.html', window.location.href);
    url.searchParams.set('set', id);
    url.searchParams.set('ref', 'share');
    await shareUrl(`${set.title} — Lune`, url.toString());
  }

  function inspoFromElement(el) {
    const card = el.closest('.personal-inspo-card, .inspo-card');
    if (!card) return null;
    const id = card.dataset.inspoId || el.dataset.shareInspo || '';
    const style = card.querySelector('.inspo-style, h3')?.textContent?.trim() || 'Lune inspo';
    const key = card.dataset.inspoKey || `${id}-${slugify(style)}`;
    return { id, style, key };
  }

  function installOverrides() {
    window.isLiked = isLiked;
    window.toggleLike = toggleLike;
    window.shareSet = shareSet;
  }

  function cleanGalleryActions() {
    document.querySelectorAll('.gallery-card').forEach(card => {
      const id = card.dataset.id;
      const actions = card.querySelector('.card-quick-actions');
      if (actions) {
        actions.querySelectorAll('[title="Download Image"], [title="Chat on WhatsApp"]').forEach(el => el.remove());
        const like = actions.querySelector('[title="Like"], [title="Saved"], [title="Save"]');
        if (like) {
          like.title = isLiked(id) ? 'Saved' : 'Save';
          like.setAttribute('aria-label', isLiked(id) ? 'Remove from saved' : 'Save this set');
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

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-inspo-share], [data-share-inspo]');
    if (!trigger) return;
    const item = inspoFromElement(trigger);
    if (!item?.key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const url = new URL('inspo.html', window.location.href);
    url.searchParams.set('look', item.key);
    url.searchParams.set('ref', 'share');
    shareUrl(`${item.style} — Lune`, url.toString());
  }, true);

  const observer = new MutationObserver(cleanGalleryActions);
  const boot = () => {
    installOverrides();
    cleanGalleryActions();
    const grid = document.getElementById('gallery-grid');
    if (grid) observer.observe(grid, { childList: true, subtree: true });
  };

  installOverrides();
  setTimeout(installOverrides, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
