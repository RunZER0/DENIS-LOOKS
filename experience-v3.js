(() => {
  const WORK_KEY = 'auranails_liked';
  const INSPO_KEY = 'aura_inspo_saved';
  const NUDGE_KEY = 'aura_nudge_seen_v3';
  const SHARE_BASE = new URL('.', window.location.href);

  const read = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const workIds = () => [...new Set(read(WORK_KEY, []))];
  const savedInspo = () => read(INSPO_KEY, []);
  const getSets = () => Array.isArray(window.__allSetsRef) ? window.__allSetsRef : [];
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = value => normalize(value).split(/\s+/).filter(t => t.length > 2 && !['nails','nail','with','plus','and','the','gel','art'].includes(t));

  function updateSavedCount() {
    const total = workIds().length + savedInspo().length;
    document.querySelectorAll('[data-saved-count]').forEach(el => {
      el.textContent = total ? String(total) : '';
      el.setAttribute('aria-label', total ? `${total} saved` : 'No saved items');
    });
  }

  function toast(message) {
    let el = document.querySelector('.experience-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'experience-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function setButtonSavedState(id, saved) {
    document.querySelectorAll(`.gallery-card[data-id="${CSS.escape(id)}"] .action-circle-btn[title="Like"], .gallery-card[data-id="${CSS.escape(id)}"] [data-save-set="${CSS.escape(id)}"]`).forEach(btn => {
      btn.classList.toggle('is-saved', saved);
      btn.setAttribute('title', saved ? 'Saved' : 'Save');
      btn.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save this set');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-solid', saved);
        icon.classList.toggle('fa-regular', !saved);
        icon.style.color = saved ? 'var(--lacquer, #8f3f52)' : '';
      }
    });
  }

  window.isLiked = id => workIds().includes(id);
  window.toggleLike = function toggleLike(id) {
    let ids = workIds();
    const adding = !ids.includes(id);
    ids = adding ? [...ids, id] : ids.filter(x => x !== id);
    write(WORK_KEY, ids);
    setButtonSavedState(id, adding);
    updateSavedCount();
    toast(adding ? 'Saved. We’ll keep more like this close.' : 'Removed from saved.');
    window.dispatchEvent(new CustomEvent('aura:taste-changed'));
    if (document.body.classList.contains('aura-favorites-page')) renderFavorites();
  };

  function shareUrl(path, params = {}) {
    const url = new URL(path, SHARE_BASE);
    Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
    url.searchParams.set('ref', 'share');
    return url.toString();
  }

  async function sharePayload(payload) {
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(payload.url);
        toast('Link copied.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(payload.url); toast('Link copied.'); }
        catch (_) {}
      }
    }
  }

  window.shareSet = async function shareSet(id) {
    const set = getSets().find(s => s.id === id);
    if (!set) return;
    await sharePayload({
      title: `${set.title} — Aura Nails Hub`,
      text: `${set.title} by Aura Nails Hub, Embu.`,
      url: shareUrl('work.html', { set: id })
    });
  };

  function setProfile() {
    const profile = new Map();
    const add = (word, weight) => profile.set(word, (profile.get(word) || 0) + weight);
    const liked = getSets().filter(s => workIds().includes(s.id));
    liked.forEach(set => {
      tokens(set.category).forEach(t => add(t, 5));
      tokens(set.style).forEach(t => add(t, 3));
      (set.tags || []).forEach(tag => tokens(tag).forEach(t => add(t, 4)));
      tokens(set.title).forEach(t => add(t, 2));
    });
    savedInspo().forEach(item => {
      tokens(item.category).forEach(t => add(t, 3));
      tokens(item.style).forEach(t => add(t, 4));
    });
    return profile;
  }

  function scoreWords(values, profile) {
    let score = 0;
    values.flatMap(tokens).forEach(t => { score += profile.get(t) || 0; });
    return score;
  }

  function recommendSets(limit = 4) {
    const sets = getSets();
    if (!sets.length) return [];
    const profile = setProfile();
    const liked = new Set(workIds());
    let pool = sets.filter(s => !liked.has(s.id));
    if (!pool.length) pool = sets.slice();
    return pool
      .map(set => ({
        set,
        score: scoreWords([set.title, set.category, set.style, ...(set.tags || [])], profile) + Math.min(Number(set.likes || 0), 100) * .025
      }))
      .sort((a, b) => b.score - a.score || Number(b.set.likes || 0) - Number(a.set.likes || 0))
      .slice(0, limit)
      .map(x => x.set);
  }

  const money = value => `Ksh ${Number(value || 0).toLocaleString()}`;

  function workCard(set, saved = false) {
    const deposit = Math.ceil(Number(set.price || 0) * .3);
    return `<article class="taste-card" data-reveal data-set-id="${set.id}">
      <figure><a href="work.html?set=${encodeURIComponent(set.id)}"><img src="${set.imageUrl}" alt="${set.title}" loading="lazy"></a></figure>
      <div class="taste-copy">
        <small>${set.category || 'Aura work'} · ${money(set.price)}</small>
        <h3>${set.title}</h3>
        <p>${set.style || set.description || ''}</p>
        <div class="card-actions">
          <button class="quiet-action ${saved ? 'is-saved' : ''}" type="button" data-save-set="${set.id}">${saved ? 'Saved' : 'Save'}</button>
          <button class="quiet-action" type="button" data-share-set="${set.id}">Share</button>
          <a class="quiet-action" href="work.html?set=${encodeURIComponent(set.id)}">View · reserve ${money(deposit)}</a>
        </div>
      </div>
    </article>`;
  }

  function inspoCard(item, saved = false) {
    return `<article class="personal-inspo-card" data-inspo-id="${item.id}">
      <figure><img src="${item.img}" alt="${item.style}" loading="lazy"></figure>
      <div class="personal-inspo-copy">
        <small>${item.category || 'Inspo'}</small>
        <h3>${item.style}</h3>
        <div class="card-actions">
          <button class="quiet-action ${saved ? 'is-saved' : ''}" type="button" data-save-inspo="${item.id}">${saved ? 'Saved' : 'Save'}</button>
          <button class="quiet-action" type="button" data-share-inspo="${item.id}">Share</button>
          <a class="quiet-action" href="inspo.html?look=${encodeURIComponent(item.id)}">Open</a>
        </div>
      </div>
    </article>`;
  }

  function collectInspo() {
    return [...document.querySelectorAll('#inspo-scroll .inspo-card')].map((card, index) => {
      const img = card.querySelector('img');
      const category = card.querySelector('.inspo-category')?.textContent?.trim() || 'Inspo';
      const style = card.querySelector('.inspo-style')?.textContent?.trim() || `Inspo ${index + 1}`;
      return { id: `inspo_${index + 1}`, img: img?.getAttribute('src') || '', category, style, card };
    });
  }

  function rankInspo(items, limit = 4) {
    const profile = setProfile();
    if (!profile.size) {
      const preferred = [2, 8, 5, 4, 0, 6, 9, 1, 7, 3];
      return preferred.map(i => items[i]).filter(Boolean).slice(0, limit);
    }
    return items.map(item => ({ item, score: scoreWords([item.category, item.style], profile) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit).map(x => x.item);
  }

  function toggleInspo(item) {
    let items = savedInspo();
    const exists = items.some(x => x.id === item.id);
    items = exists ? items.filter(x => x.id !== item.id) : [...items, { id: item.id, img: item.img, category: item.category, style: item.style }];
    write(INSPO_KEY, items);
    updateSavedCount();
    toast(exists ? 'Removed from saved.' : 'Saved. We’ll keep more like this close.');
    window.dispatchEvent(new CustomEvent('aura:taste-changed'));
    if (document.body.classList.contains('aura-inspo-page')) enhanceInspo();
    if (document.body.classList.contains('aura-favorites-page')) renderFavorites();
  }

  async function shareInspo(item) {
    await sharePayload({
      title: `${item.style} — Aura Inspo`,
      text: `${item.style} nail inspiration from Aura Nails Hub, Embu.`,
      url: shareUrl('inspo.html', { look: item.id })
    });
  }

  function enhanceWork() {
    document.querySelectorAll('.gallery-card').forEach(card => {
      const id = card.dataset.id;
      if (!id) return;
      const like = card.querySelector('.action-circle-btn[title="Like"]');
      if (like) {
        like.setAttribute('title', workIds().includes(id) ? 'Saved' : 'Save');
        like.setAttribute('aria-label', workIds().includes(id) ? 'Remove from saved' : 'Save this set');
      }
      const share = [...card.querySelectorAll('.action-circle-btn')].find(btn => /share/i.test(btn.getAttribute('title') || ''));
      if (share) share.setAttribute('aria-label', 'Share this set');
      setButtonSavedState(id, workIds().includes(id));
    });

    const requested = new URLSearchParams(location.search).get('set');
    if (requested && !document.body.dataset.sharedSetOpened) {
      const target = document.querySelector(`.gallery-card[data-id="${CSS.escape(requested)}"]`);
      if (target) {
        document.body.dataset.sharedSetOpened = '1';
        target.classList.add('is-shared-target');
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
        setTimeout(() => target.querySelector('.card-image-wrap')?.click(), 760);
      }
    }
  }

  function enhanceInspo() {
    const items = collectInspo();
    if (!items.length) return;
    const saved = new Set(savedInspo().map(x => x.id));
    items.forEach(item => {
      const card = item.card;
      card.dataset.inspoId = item.id;
      card.dataset.inspoStyle = item.style;
      card.dataset.inspoCategory = item.category;
      card.onclick = null;
      let actions = card.querySelector('.inspo-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'inspo-actions';
        actions.innerHTML = `<button class="inspo-action" type="button" data-inspo-save aria-label="Save inspiration">♡</button><button class="inspo-action" type="button" data-inspo-share aria-label="Share inspiration">↗</button>`;
        card.querySelector('.inspo-img-wrap')?.appendChild(actions);
      }
      const save = actions.querySelector('[data-inspo-save]');
      const isSaved = saved.has(item.id);
      save?.classList.toggle('is-saved', isSaved);
      if (save) save.textContent = isSaved ? '♥' : '♡';
    });

    const picked = document.getElementById('personal-inspo-grid');
    if (picked) {
      picked.innerHTML = rankInspo(items, 4).map(item => inspoCard(item, saved.has(item.id))).join('');
      const heading = document.querySelector('[data-personal-inspo-heading]');
      const copy = document.querySelector('[data-personal-inspo-copy]');
      const hasTaste = workIds().length + savedInspo().length > 0;
      if (heading) heading.textContent = hasTaste ? 'More in your direction.' : 'A strong place to start.';
      if (copy) copy.textContent = hasTaste
        ? 'The shapes, finishes and details closest to what you keep saving.'
        : 'Four directions with enough range to make the first choice easier.';
    }

    const requested = new URLSearchParams(location.search).get('look');
    if (requested && !document.body.dataset.sharedInspoOpened) {
      const card = document.querySelector(`.inspo-card[data-inspo-id="${CSS.escape(requested)}"]`);
      if (card) {
        document.body.dataset.sharedInspoOpened = '1';
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 160);
        setTimeout(() => openInspoDialog({
          id: card.dataset.inspoId,
          img: card.querySelector('img')?.src,
          category: card.dataset.inspoCategory,
          style: card.dataset.inspoStyle
        }), 700);
      }
    }
  }

  function openInspoDialog(item) {
    const dialog = document.getElementById('inspo-dialog');
    if (!dialog || !item) return;
    dialog.dataset.inspoId = item.id;
    dialog.querySelector('img').src = item.img;
    dialog.querySelector('img').alt = item.style;
    dialog.querySelector('[data-dialog-category]').textContent = item.category;
    dialog.querySelector('[data-dialog-title]').textContent = item.style;
    const saved = savedInspo().some(x => x.id === item.id);
    const save = dialog.querySelector('[data-dialog-save]');
    if (save) {
      save.textContent = saved ? 'Saved' : 'Save this inspo';
      save.classList.toggle('is-saved', saved);
    }
    const book = dialog.querySelector('[data-dialog-book]');
    if (book) {
      const msg = encodeURIComponent(`Hi Denis — I found “${item.style}” in Aura Inspo and I’d like to build a set in this direction.`);
      book.href = `https://wa.me/254741959888?text=${msg}`;
    }
    dialog.showModal();
  }

  function renderFavorites() {
    if (!document.body.classList.contains('aura-favorites-page')) return;
    const sets = getSets();
    if (!sets.length) return;
    const likedIds = new Set(workIds());
    const likedSets = sets.filter(s => likedIds.has(s.id));
    const inspo = savedInspo();
    const workGrid = document.getElementById('saved-work-grid');
    const inspoGrid = document.getElementById('saved-inspo-grid');
    const recGrid = document.getElementById('taste-recommendations');
    const empty = document.getElementById('saved-empty');
    const count = likedSets.length + inspo.length;

    if (workGrid) workGrid.innerHTML = likedSets.map(set => workCard(set, true)).join('');
    if (inspoGrid) inspoGrid.innerHTML = inspo.map(item => inspoCard(item, true)).join('');
    if (empty) {
      empty.hidden = count > 0;
      empty.innerHTML = '<strong>Your shortlist starts with one save.</strong> Until then, a few strong directions stay within reach below.';
    }
    document.querySelectorAll('[data-saved-work-section]').forEach(el => el.hidden = !likedSets.length);
    document.querySelectorAll('[data-saved-inspo-section]').forEach(el => el.hidden = !inspo.length);

    const recs = recommendSets(4);
    if (recGrid) recGrid.innerHTML = recs.map(set => workCard(set, likedIds.has(set.id))).join('');
    const recTitle = document.querySelector('[data-recommendation-title]');
    const recCopy = document.querySelector('[data-recommendation-copy]');
    if (recTitle) recTitle.textContent = count ? 'More in your direction.' : 'A few worth keeping.';
    if (recCopy) recCopy.textContent = count
      ? 'Closer to the shapes, finishes and details you keep coming back to.'
      : 'A mix of quiet, sharp and expressive work to give the shortlist somewhere to begin.';
  }

  function scheduleNudge() {
    if (document.body.classList.contains('aura-favorites-page') || sessionStorage.getItem(NUDGE_KEY)) return;
    const fire = () => {
      if (sessionStorage.getItem(NUDGE_KEY) || document.querySelector('.experience-nudge')) return;
      sessionStorage.setItem(NUDGE_KEY, '1');
      const count = workIds().length + savedInspo().length;
      const nudge = document.createElement('aside');
      nudge.className = 'experience-nudge';
      if (count) {
        nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>SAVED</small><h3>${count === 1 ? 'One look stayed with you.' : `${count} looks made the cut.`}</h3><p>Your shortlist is still here. Compare them together before you decide.</p><a class="text-link" href="favorites.html">Open saved <span class="arrow">→</span></a>`;
      } else if (document.body.classList.contains('aura-work-page') || document.body.classList.contains('aura-inspo-page')) {
        nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>RESERVE / 30%</small><h3>You don’t need the full amount today.</h3><p>Reserve the appointment with 30%. The balance comes later.</p><a class="text-link" href="work.html">Find your set <span class="arrow">→</span></a>`;
      } else {
        nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>NEED A STARTING POINT?</small><h3>Start with what catches your eye.</h3><p>Curated inspo narrows the choice without narrowing your taste.</p><a class="text-link" href="inspo.html">Find your direction <span class="arrow">→</span></a>`;
      }
      document.body.appendChild(nudge);
      nudge.querySelector('.experience-nudge-close')?.addEventListener('click', () => nudge.remove());
      requestAnimationFrame(() => nudge.classList.add('show'));
    };
    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const progress = window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
      if (progress > .42) { fired = true; window.removeEventListener('scroll', onScroll); setTimeout(fire, 900); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(() => { if (!fired) { fired = true; window.removeEventListener('scroll', onScroll); fire(); } }, 18000);
  }

  function wireDelegation() {
    document.addEventListener('click', e => {
      const setSave = e.target.closest('[data-save-set]');
      if (setSave) { e.preventDefault(); window.toggleLike(setSave.dataset.saveSet); return; }
      const setShare = e.target.closest('[data-share-set]');
      if (setShare) { e.preventDefault(); window.shareSet(setShare.dataset.shareSet); return; }

      const inspoSave = e.target.closest('[data-save-inspo]');
      if (inspoSave) {
        e.preventDefault();
        const item = savedInspo().find(x => x.id === inspoSave.dataset.saveInspo) || collectInspo().find(x => x.id === inspoSave.dataset.saveInspo);
        if (item) toggleInspo(item);
        return;
      }
      const inspoShare = e.target.closest('[data-share-inspo]');
      if (inspoShare) {
        e.preventDefault();
        const item = savedInspo().find(x => x.id === inspoShare.dataset.shareInspo) || collectInspo().find(x => x.id === inspoShare.dataset.shareInspo);
        if (item) shareInspo(item);
        return;
      }
      const saveButton = e.target.closest('[data-inspo-save]');
      if (saveButton) {
        e.preventDefault(); e.stopPropagation();
        const card = saveButton.closest('.inspo-card');
        if (card) toggleInspo({ id: card.dataset.inspoId, img: card.querySelector('img')?.getAttribute('src'), category: card.dataset.inspoCategory, style: card.dataset.inspoStyle });
        return;
      }
      const shareButton = e.target.closest('[data-inspo-share]');
      if (shareButton) {
        e.preventDefault(); e.stopPropagation();
        const card = shareButton.closest('.inspo-card');
        if (card) shareInspo({ id: card.dataset.inspoId, img: card.querySelector('img')?.getAttribute('src'), category: card.dataset.inspoCategory, style: card.dataset.inspoStyle });
        return;
      }
      const inspoCardEl = e.target.closest('.aura-inspo-page .inspo-card');
      if (inspoCardEl) {
        e.preventDefault(); e.stopPropagation();
        openInspoDialog({ id: inspoCardEl.dataset.inspoId, img: inspoCardEl.querySelector('img')?.getAttribute('src'), category: inspoCardEl.dataset.inspoCategory, style: inspoCardEl.dataset.inspoStyle });
        return;
      }
      const dialogSave = e.target.closest('[data-dialog-save]');
      if (dialogSave) {
        const dialog = dialogSave.closest('#inspo-dialog');
        const id = dialog?.dataset.inspoId;
        const item = collectInspo().find(x => x.id === id) || savedInspo().find(x => x.id === id);
        if (item) { toggleInspo(item); dialogSave.textContent = savedInspo().some(x => x.id === id) ? 'Saved' : 'Save this inspo'; }
      }
    }, true);

    document.querySelectorAll('.v3-dialog').forEach(dialog => {
      dialog.querySelector('.v3-dialog-close')?.addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', e => {
        if (e.target === dialog) dialog.close();
      });
    });
  }

  function updateObsessionLink() {
    const link = document.querySelector('[data-obsession-link]');
    if (!link) return;
    try {
      const data = JSON.parse(localStorage.getItem('aura-notw') || 'null');
      link.href = data?.setId ? `work.html?set=${encodeURIComponent(data.setId)}` : 'work.html';
    } catch (_) {}
  }

  const mutation = new MutationObserver(() => {
    if (document.body.classList.contains('aura-work-page')) enhanceWork();
    if (document.body.classList.contains('aura-inspo-page')) enhanceInspo();
  });

  function init() {
    updateSavedCount();
    wireDelegation();
    updateObsessionLink();
    if (document.body.classList.contains('aura-work-page')) enhanceWork();
    if (document.body.classList.contains('aura-inspo-page')) enhanceInspo();
    if (document.body.classList.contains('aura-favorites-page')) {
      const tryRender = () => {
        if (getSets().length) renderFavorites();
        else setTimeout(tryRender, 80);
      };
      tryRender();
    }
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('aura:taste-changed', () => {
      updateSavedCount();
      if (document.body.classList.contains('aura-inspo-page')) enhanceInspo();
      if (document.body.classList.contains('aura-favorites-page')) renderFavorites();
    });
    scheduleNudge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
