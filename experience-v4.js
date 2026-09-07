(() => {
  const WORK_KEY = 'auranails_liked';
  const INSPO_KEY = 'aura_inspo_saved';
  const EVENT_KEY = 'aura_taste_events_v4';
  const NUDGE_KEY = 'aura_nudge_seen_v4';
  const SHARE_BASE = new URL('.', window.location.href);
  const DAY = 86400000;
  const MAX_EVENTS = 240;

  const CURATED_INSPO = [
    { id: 'inspo_1', img: 'inspo1.png.png', category: 'Gel: Natural', style: 'Minimalist Chic' },
    { id: 'inspo_2', img: 'inspo2.png.png', category: 'Gel: Natural', style: 'Nude Elegance' },
    { id: 'inspo_3', img: 'inspo3.png.png', category: 'Tips + Gel', style: 'Chrome Artistry' },
    { id: 'inspo_4', img: 'inspo4.png.png', category: 'Tips + Gel', style: 'Plain High-Gloss' },
    { id: 'inspo_5', img: 'inspo5.png.png', category: 'Tips + Gel', style: 'Classic French Tips' },
    { id: 'inspo_6', img: 'inspo6.png.png', category: 'Tips + Gel', style: '3D Design Art' },
    { id: 'inspo_7', img: 'inspo7.png.png', category: 'Gumgel: Natural', style: 'Chrome Effects' },
    { id: 'inspo_8', img: 'inspo8.png.png', category: 'Gumgel + Tips', style: 'Plain Structure' },
    { id: 'inspo_9', img: 'inspo9.png.png', category: 'Gumgel: Natural', style: 'Modern French' },
    { id: 'inspo_10', img: 'inspo10.png.png', category: 'Gumgel + Tips', style: '3D Sculpted Art' }
  ];

  const read = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const likedWorkIds = () => [...new Set(read(WORK_KEY, []))];
  const savedInspo = () => read(INSPO_KEY, []);
  const getSets = () => Array.isArray(window.__allSetsRef) ? window.__allSetsRef : [];
  const slugify = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const canonicalInspoKey = item => `${item.id}-${slugify(item.style)}`;
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = value => normalize(value).split(/\s+/).filter(t => t.length > 2 && !['nails','nail','with','plus','and','the','gel','art','tips'].includes(t));
  const featureTokens = item => [...new Set([
    ...tokens(item.title), ...tokens(item.category), ...tokens(item.style), ...tokens(item.description),
    ...((item.tags || []).flatMap(tokens))
  ])];

  function recordEvent(kind, item, action) {
    if (!item) return;
    const weights = { open: 1.2, save: 6, unsave: -2.5, share: 3.5, book: 8 };
    if (!(action in weights)) return;
    const events = read(EVENT_KEY, []);
    events.push({
      kind,
      id: item.id,
      action,
      weight: weights[action],
      features: featureTokens(item),
      ts: Date.now()
    });
    write(EVENT_KEY, events.slice(-MAX_EVENTS));
  }

  function updateSavedCount() {
    const total = likedWorkIds().length + savedInspo().length;
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
    el._timer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function shareUrl(path, params = {}) {
    const url = new URL(path, SHARE_BASE);
    Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
    url.searchParams.set('ref', 'share');
    return url.toString();
  }

  async function shareLink(title, url) {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied.'); }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch (_) {}
      }
    }
  }

  function buildProfile() {
    const profile = new Map();
    const add = (token, weight) => profile.set(token, (profile.get(token) || 0) + weight);
    const now = Date.now();

    read(EVENT_KEY, []).forEach(event => {
      const ageDays = Math.max(0, (now - Number(event.ts || now)) / DAY);
      const decay = Math.exp(-ageDays / 52);
      (event.features || []).forEach(token => add(token, Number(event.weight || 0) * decay));
    });

    const liked = getSets().filter(s => likedWorkIds().includes(s.id));
    liked.forEach(set => featureTokens(set).forEach(token => add(token, 2.2)));
    savedInspo().forEach(item => featureTokens(item).forEach(token => add(token, 2.0)));

    return profile;
  }

  function affinity(item, profile) {
    const f = featureTokens(item);
    if (!f.length || !profile.size) return 0;
    const raw = f.reduce((sum, token) => sum + Math.max(0, profile.get(token) || 0), 0);
    const denom = Math.sqrt(f.length) * Math.max(1, Math.sqrt([...profile.values()].filter(v => v > 0).reduce((a, b) => a + b, 0)));
    return raw / denom;
  }

  function jaccard(a, b) {
    const A = new Set(featureTokens(a));
    const B = new Set(featureTokens(b));
    if (!A.size || !B.size) return 0;
    let overlap = 0;
    A.forEach(x => { if (B.has(x)) overlap++; });
    return overlap / (A.size + B.size - overlap);
  }

  function categoryKey(item) {
    return normalize(item.category).split(' ').slice(0, 2).join(' ');
  }

  function diverseSelect(items, profile, limit, qualityFn = () => 0, curatedOrder = []) {
    if (!items.length) return [];
    const curatedRank = new Map(curatedOrder.map((id, i) => [id, Math.max(0, 1 - i / Math.max(1, curatedOrder.length - 1))]));
    const scored = items.map(item => ({
      item,
      affinity: affinity(item, profile),
      quality: Math.max(qualityFn(item), curatedRank.get(item.id) || 0)
    }));

    if (!profile.size) {
      const selected = [];
      const counts = new Map();
      [...scored].sort((a, b) => b.quality - a.quality).forEach(candidate => {
        if (selected.length >= limit) return;
        const cat = categoryKey(candidate.item);
        const count = counts.get(cat) || 0;
        if (count >= 2) return;
        selected.push(candidate.item);
        counts.set(cat, count + 1);
      });
      for (const candidate of scored) if (selected.length < limit && !selected.includes(candidate.item)) selected.push(candidate.item);
      return selected.slice(0, limit);
    }

    const selected = [];
    const categoryCounts = new Map();
    const remaining = [...scored];

    while (selected.length < Math.max(0, limit - 1) && remaining.length) {
      let bestIndex = -1;
      let bestScore = -Infinity;
      remaining.forEach((candidate, i) => {
        const cat = categoryKey(candidate.item);
        if ((categoryCounts.get(cat) || 0) >= 2) return;
        const redundancy = selected.length ? Math.max(...selected.map(s => jaccard(candidate.item, s))) : 0;
        const novelty = 1 - redundancy;
        const score = candidate.affinity * .64 + candidate.quality * .14 + novelty * .22;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      });
      if (bestIndex < 0) break;
      const [picked] = remaining.splice(bestIndex, 1);
      selected.push(picked.item);
      const cat = categoryKey(picked.item);
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    if (selected.length < limit && remaining.length) {
      const seenProfileTokens = new Set([...profile.entries()].filter(([, w]) => w > 0).map(([t]) => t));
      const exploration = remaining
        .map(candidate => {
          const f = featureTokens(candidate.item);
          const familiar = f.filter(t => seenProfileTokens.has(t)).length / Math.max(1, f.length);
          const redundancy = selected.length ? Math.max(...selected.map(s => jaccard(candidate.item, s))) : 0;
          const discovery = 1 - familiar;
          return { candidate, score: discovery * .48 + (1 - redundancy) * .32 + candidate.quality * .20 };
        })
        .sort((a, b) => b.score - a.score)
        .find(x => (categoryCounts.get(categoryKey(x.candidate.item)) || 0) < 2) || { candidate: remaining[0] };
      if (exploration.candidate) selected.push(exploration.candidate.item);
    }

    for (const candidate of remaining) if (selected.length < limit && !selected.includes(candidate.item)) selected.push(candidate.item);
    return selected.slice(0, limit);
  }

  function recommendSets(limit = 4) {
    const liked = new Set(likedWorkIds());
    let pool = getSets().filter(s => !liked.has(s.id));
    if (!pool.length) pool = getSets().slice();
    const maxLikes = Math.max(1, ...pool.map(s => Number(s.likes || 0)));
    return diverseSelect(pool, buildProfile(), limit, s => Number(s.likes || 0) / maxLikes);
  }

  function collectInspo() {
    const cards = [...document.querySelectorAll('#inspo-scroll .inspo-card')];
    if (!cards.length) return CURATED_INSPO.map(item => ({ ...item, slug: canonicalInspoKey(item), card: null }));
    return cards.map((card, index) => {
      const fallback = CURATED_INSPO[index] || {};
      const img = card.querySelector('img');
      const category = card.querySelector('.inspo-category')?.textContent?.trim() || fallback.category || 'Inspo';
      const style = card.querySelector('.inspo-style')?.textContent?.trim() || fallback.style || `Inspo ${index + 1}`;
      const id = card.dataset.inspoId || fallback.id || `inspo_${index + 1}`;
      const item = { id, img: img?.getAttribute('src') || fallback.img || '', category, style, card };
      item.slug = canonicalInspoKey(item);
      return item;
    });
  }

  function rankInspo(items, limit = 4) {
    const savedIds = new Set(savedInspo().map(x => x.id));
    let pool = items.filter(i => !savedIds.has(i.id));
    if (pool.length < limit) pool = items.slice();
    const curated = ['inspo_3','inspo_9','inspo_6','inspo_5','inspo_1','inspo_7','inspo_10','inspo_2','inspo_8','inspo_4'];
    return diverseSelect(pool, buildProfile(), limit, () => .35, curated);
  }

  function ensureInspoDOM() {
    const container = document.getElementById('inspo-scroll');
    if (!container || container.querySelector('.inspo-card')) return;
    container.innerHTML = CURATED_INSPO.map(item => `
      <article class="inspo-card" data-inspo-id="${item.id}">
        <div class="inspo-img-wrap"><img src="${item.img}" alt="${item.style}" loading="lazy"></div>
        <div class="inspo-info"><span class="inspo-category">${item.category}</span><strong class="inspo-style">${item.style}</strong></div>
      </article>`).join('');
  }

  function setWorkSavedState(id, saved) {
    document.querySelectorAll(`.gallery-card[data-id="${CSS.escape(id)}"] .action-circle-btn[title="Like"], .gallery-card[data-id="${CSS.escape(id)}"] .action-circle-btn[title="Save"], .gallery-card[data-id="${CSS.escape(id)}"] .action-circle-btn[title="Saved"]`).forEach(btn => {
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

  window.isLiked = id => likedWorkIds().includes(id);
  window.toggleLike = function toggleLike(id) {
    const set = getSets().find(s => s.id === id);
    let ids = likedWorkIds();
    const adding = !ids.includes(id);
    ids = adding ? [...ids, id] : ids.filter(x => x !== id);
    write(WORK_KEY, ids);
    if (set) recordEvent('work', set, adding ? 'save' : 'unsave');
    setWorkSavedState(id, adding);
    updateSavedCount();
    toast(adding ? 'Saved. More like this will stay within reach.' : 'Removed from saved.');
    window.dispatchEvent(new CustomEvent('aura:taste-changed'));
  };

  window.shareSet = async function shareSet(id) {
    const set = getSets().find(s => s.id === id);
    if (!set) return;
    recordEvent('work', set, 'share');
    await shareLink(`${set.title} — Aura Nails Hub`, shareUrl('work.html', { set: id }));
  };

  function toggleInspo(item) {
    let items = savedInspo();
    const exists = items.some(x => x.id === item.id);
    items = exists ? items.filter(x => x.id !== item.id) : [...items, { id: item.id, slug: item.slug || canonicalInspoKey(item), img: item.img, category: item.category, style: item.style }];
    write(INSPO_KEY, items);
    recordEvent('inspo', item, exists ? 'unsave' : 'save');
    updateSavedCount();
    toast(exists ? 'Removed from saved.' : 'Saved. More in this direction will stay close.');
    window.dispatchEvent(new CustomEvent('aura:taste-changed'));
    enhanceInspo();
    renderFavorites();
  }

  async function shareInspo(item) {
    recordEvent('inspo', item, 'share');
    const key = item.slug || canonicalInspoKey(item);
    await shareLink(`${item.style} — Aura Inspo`, shareUrl('inspo.html', { look: key }));
  }

  function inspoCard(item, saved = false) {
    const key = item.slug || canonicalInspoKey(item);
    return `<article class="personal-inspo-card" data-inspo-id="${item.id}" data-inspo-key="${key}">
      <figure><a href="inspo.html?look=${encodeURIComponent(key)}"><img src="${item.img}" alt="${item.style}" loading="lazy"></a></figure>
      <div class="personal-inspo-copy">
        <small>${item.category || 'Inspo'}</small>
        <h3>${item.style}</h3>
        <div class="card-actions">
          <button class="quiet-action ${saved ? 'is-saved' : ''}" type="button" data-save-inspo="${item.id}">${saved ? 'Saved' : 'Save'}</button>
          <button class="quiet-action" type="button" data-share-inspo="${item.id}">Share link</button>
          <a class="quiet-action" href="inspo.html?look=${encodeURIComponent(key)}">Open</a>
        </div>
      </div>
    </article>`;
  }

  const money = value => `Ksh ${Number(value || 0).toLocaleString()}`;
  function workCard(set, saved = false) {
    const deposit = Math.ceil(Number(set.price || 0) * .3);
    return `<article class="taste-card" data-set-id="${set.id}">
      <figure><a href="work.html?set=${encodeURIComponent(set.id)}"><img src="${set.imageUrl}" alt="${set.title}" loading="lazy"></a></figure>
      <div class="taste-copy"><small>${set.category || 'Aura work'} · ${money(set.price)}</small><h3>${set.title}</h3><p>${set.style || set.description || ''}</p>
        <div class="card-actions"><button class="quiet-action ${saved ? 'is-saved' : ''}" type="button" data-save-set="${set.id}">${saved ? 'Saved' : 'Save'}</button><button class="quiet-action" type="button" data-share-set="${set.id}">Share link</button><a class="quiet-action" href="work.html?set=${encodeURIComponent(set.id)}">View · reserve ${money(deposit)}</a></div>
      </div></article>`;
  }

  function findInspo(ref) {
    if (!ref) return null;
    return collectInspo().find(item => item.id === ref || item.slug === ref || slugify(item.style) === ref) || null;
  }

  function syncInspoCards() {
    const saved = new Set(savedInspo().map(x => x.id));
    collectInspo().forEach(item => {
      const card = item.card;
      if (!card) return;
      card.dataset.inspoId = item.id;
      card.dataset.inspoKey = item.slug;
      card.dataset.inspoStyle = item.style;
      card.dataset.inspoCategory = item.category;
      card.onclick = null;
      let actions = card.querySelector('.inspo-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'inspo-actions';
        actions.innerHTML = '<button class="inspo-action" type="button" data-inspo-save aria-label="Save inspiration">♡</button><button class="inspo-action" type="button" data-inspo-share aria-label="Share link">↗</button>';
        card.querySelector('.inspo-img-wrap')?.appendChild(actions);
      }
      const save = actions.querySelector('[data-inspo-save]');
      const isSaved = saved.has(item.id);
      save?.classList.toggle('is-saved', isSaved);
      if (save) save.textContent = isSaved ? '♥' : '♡';
    });
  }

  let enhancing = false;
  function enhanceInspo() {
    if (!document.body.classList.contains('aura-inspo-page') || enhancing) return;
    enhancing = true;
    ensureInspoDOM();
    syncInspoCards();
    const items = collectInspo();
    const saved = new Set(savedInspo().map(x => x.id));
    const picked = document.getElementById('personal-inspo-grid');
    if (picked) {
      const ranked = rankInspo(items, 4);
      picked.innerHTML = ranked.map(item => inspoCard(item, saved.has(item.id))).join('');
      const heading = document.querySelector('[data-personal-inspo-heading]');
      const copy = document.querySelector('[data-personal-inspo-copy]');
      const hasTaste = likedWorkIds().length + savedInspo().length + read(EVENT_KEY, []).length > 1;
      if (heading) heading.textContent = hasTaste ? 'More in your direction.' : 'A strong place to start.';
      if (copy) copy.textContent = hasTaste ? 'Close enough to feel familiar, varied enough to keep the choice open.' : 'Four different directions to make the first choice easier.';
    }
    enhancing = false;

    const requested = new URLSearchParams(location.search).get('look');
    if (requested && !document.body.dataset.sharedInspoOpened) {
      const item = findInspo(requested);
      if (item) {
        document.body.dataset.sharedInspoOpened = '1';
        setTimeout(() => item.card?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
        setTimeout(() => openInspoDialog(item, false), 420);
      }
    }
  }

  function openInspoDialog(item, updateUrl = true) {
    const dialog = document.getElementById('inspo-dialog');
    if (!dialog || !item) return;
    recordEvent('inspo', item, 'open');
    dialog.dataset.inspoId = item.id;
    dialog.dataset.inspoKey = item.slug || canonicalInspoKey(item);
    const img = dialog.querySelector('img');
    if (img) { img.src = item.img; img.alt = item.style; }
    dialog.querySelector('[data-dialog-category]').textContent = item.category;
    dialog.querySelector('[data-dialog-title]').textContent = item.style;
    const save = dialog.querySelector('[data-dialog-save]');
    const isSaved = savedInspo().some(x => x.id === item.id);
    if (save) { save.textContent = isSaved ? 'Saved' : 'Save this inspo'; save.classList.toggle('is-saved', isSaved); }
    const book = dialog.querySelector('[data-dialog-book]');
    if (book) {
      const msg = encodeURIComponent(`Hi Denis — I found “${item.style}” in Aura Inspo and I’d like to build a set in this direction.`);
      book.href = `https://wa.me/254741959888?text=${msg}`;
      book.onclick = () => recordEvent('inspo', item, 'book');
    }
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('look', item.slug || canonicalInspoKey(item));
      url.searchParams.delete('ref');
      history.pushState({ auraInspo: item.id }, '', url);
    }
    dialog.showModal();
  }

  function enhanceWork() {
    if (!document.body.classList.contains('aura-work-page')) return;
    const liked = new Set(likedWorkIds());
    document.querySelectorAll('.gallery-card').forEach(card => {
      const id = card.dataset.id;
      if (!id) return;
      setWorkSavedState(id, liked.has(id));
      const image = card.querySelector('.card-image-wrap');
      if (image && image.dataset.tasteOpenWired !== '1') {
        image.dataset.tasteOpenWired = '1';
        image.addEventListener('click', () => {
          const set = getSets().find(s => s.id === id);
          if (set) recordEvent('work', set, 'open');
        }, { capture: true });
      }
    });
  }

  function renderFavorites() {
    if (!document.body.classList.contains('aura-favorites-page')) return;
    const sets = getSets();
    if (!sets.length) return;
    const liked = new Set(likedWorkIds());
    const work = sets.filter(s => liked.has(s.id));
    const inspo = savedInspo();
    const workGrid = document.getElementById('saved-work-grid');
    const inspoGrid = document.getElementById('saved-inspo-grid');
    const recGrid = document.getElementById('taste-recommendations');
    const empty = document.getElementById('saved-empty');
    const count = work.length + inspo.length;
    if (workGrid) workGrid.innerHTML = work.map(s => workCard(s, true)).join('');
    if (inspoGrid) inspoGrid.innerHTML = inspo.map(i => inspoCard({ ...i, slug: i.slug || canonicalInspoKey(i) }, true)).join('');
    document.querySelectorAll('[data-saved-work-section]').forEach(el => el.hidden = !work.length);
    document.querySelectorAll('[data-saved-inspo-section]').forEach(el => el.hidden = !inspo.length);
    if (empty) { empty.hidden = count > 0; empty.innerHTML = '<strong>Your shortlist starts with one save.</strong> Until then, a few strong directions stay within reach below.'; }
    const recs = recommendSets(4);
    if (recGrid) recGrid.innerHTML = recs.map(s => workCard(s, liked.has(s.id))).join('');
    const title = document.querySelector('[data-recommendation-title]');
    const copy = document.querySelector('[data-recommendation-copy]');
    if (title) title.textContent = count ? 'More in your direction.' : 'A few worth keeping.';
    if (copy) copy.textContent = count ? 'Familiar signals, plus one or two directions you have not explored yet.' : 'A varied starting point across different finishes, structures and moods.';
  }

  function scheduleNudge() {
    if (document.body.classList.contains('aura-favorites-page') || sessionStorage.getItem(NUDGE_KEY)) return;
    const fire = () => {
      if (sessionStorage.getItem(NUDGE_KEY) || document.querySelector('.experience-nudge')) return;
      sessionStorage.setItem(NUDGE_KEY, '1');
      const count = likedWorkIds().length + savedInspo().length;
      const nudge = document.createElement('aside');
      nudge.className = 'experience-nudge';
      if (count) nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>SAVED</small><h3>${count === 1 ? 'One look stayed with you.' : `${count} looks made the cut.`}</h3><p>Your shortlist is still here, with a few new directions beside it.</p><a class="text-link" href="favorites.html">Open saved <span class="arrow">→</span></a>`;
      else if (document.body.classList.contains('aura-work-page') || document.body.classList.contains('aura-inspo-page')) nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>RESERVE / 30%</small><h3>You don’t need the full amount today.</h3><p>Reserve the appointment with 30%. The balance comes later.</p><a class="text-link" href="work.html">Find your set <span class="arrow">→</span></a>`;
      else nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>NEED A STARTING POINT?</small><h3>Start with what catches your eye.</h3><p>Curated inspo narrows the first decision without boxing you in.</p><a class="text-link" href="inspo.html">Find your direction <span class="arrow">→</span></a>`;
      document.body.appendChild(nudge);
      nudge.querySelector('.experience-nudge-close')?.addEventListener('click', () => nudge.remove());
      requestAnimationFrame(() => nudge.classList.add('show'));
    };
    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const progress = window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
      if (progress > .42) { fired = true; window.removeEventListener('scroll', onScroll); setTimeout(fire, 700); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(() => { if (!fired) { fired = true; window.removeEventListener('scroll', onScroll); fire(); } }, 18000);
  }

  function wire() {
    document.addEventListener('click', e => {
      const setSave = e.target.closest('[data-save-set]');
      if (setSave) { e.preventDefault(); window.toggleLike(setSave.dataset.saveSet); return; }
      const setShare = e.target.closest('[data-share-set]');
      if (setShare) { e.preventDefault(); window.shareSet(setShare.dataset.shareSet); return; }

      const inspoSave = e.target.closest('[data-save-inspo]');
      if (inspoSave) {
        e.preventDefault();
        const item = findInspo(inspoSave.dataset.saveInspo) || savedInspo().find(x => x.id === inspoSave.dataset.saveInspo);
        if (item) toggleInspo({ ...item, slug: item.slug || canonicalInspoKey(item) });
        return;
      }
      const inspoShare = e.target.closest('[data-share-inspo]');
      if (inspoShare) {
        e.preventDefault();
        const item = findInspo(inspoShare.dataset.shareInspo) || savedInspo().find(x => x.id === inspoShare.dataset.shareInspo);
        if (item) shareInspo({ ...item, slug: item.slug || canonicalInspoKey(item) });
        return;
      }
      const saveButton = e.target.closest('[data-inspo-save]');
      if (saveButton) {
        e.preventDefault(); e.stopPropagation();
        const card = saveButton.closest('.inspo-card');
        const item = card ? findInspo(card.dataset.inspoId) : null;
        if (item) toggleInspo(item);
        return;
      }
      const shareButton = e.target.closest('[data-inspo-share]');
      if (shareButton) {
        e.preventDefault(); e.stopPropagation();
        const card = shareButton.closest('.inspo-card');
        const item = card ? findInspo(card.dataset.inspoId) : null;
        if (item) shareInspo(item);
        return;
      }
      const card = e.target.closest('.aura-inspo-page .inspo-card');
      if (card) {
        e.preventDefault(); e.stopPropagation();
        const item = findInspo(card.dataset.inspoId);
        if (item) openInspoDialog(item, true);
        return;
      }
      const dialogSave = e.target.closest('[data-dialog-save]');
      if (dialogSave) {
        e.preventDefault();
        const dialog = dialogSave.closest('#inspo-dialog');
        const item = findInspo(dialog?.dataset.inspoId) || savedInspo().find(x => x.id === dialog?.dataset.inspoId);
        if (item) {
          toggleInspo({ ...item, slug: item.slug || canonicalInspoKey(item) });
          dialogSave.textContent = savedInspo().some(x => x.id === item.id) ? 'Saved' : 'Save this inspo';
        }
      }
    }, true);

    document.querySelectorAll('.v3-dialog').forEach(dialog => {
      dialog.querySelector('.v3-dialog-close')?.addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    });
  }

  let mutationTimer;
  const mutation = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      enhanceWork();
      enhanceInspo();
      renderFavorites();
    }, 40);
  });

  function init() {
    updateSavedCount();
    wire();
    if (document.body.classList.contains('aura-inspo-page')) ensureInspoDOM();
    enhanceWork();
    enhanceInspo();
    if (document.body.classList.contains('aura-favorites-page')) {
      const retry = () => getSets().length ? renderFavorites() : setTimeout(retry, 80);
      retry();
    }
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('aura:taste-changed', () => { updateSavedCount(); enhanceInspo(); renderFavorites(); });
    window.addEventListener('popstate', () => {
      const requested = new URLSearchParams(location.search).get('look');
      const dialog = document.getElementById('inspo-dialog');
      if (!requested) { if (dialog?.open) dialog.close(); return; }
      const item = findInspo(requested);
      if (item) openInspoDialog(item, false);
    });
    scheduleNudge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
