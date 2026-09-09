(() => {
  'use strict';

  const WORK_KEY = 'auranails_liked';
  const INSPO_KEY = 'aura_inspo_saved';
  const NUDGE_KEY = 'lune_nudge_seen_v1';
  let currentInspoMood = 'all';
  const INSPO_MOODS = {
    all: { label:'Every direction, in one considered edit.', terms:[] },
    'put-together': { label:'Clean lines. Polished energy.', terms:['minimal','nude','natural','french','plain','gloss','chic','elegance'] },
    'softly-expressive': { label:'Light-catching details, kept close.', terms:['ombre','soft','chrome','glow','jelly','aura'] },
    unmistakable: { label:'For when the details are the point.', terms:['3d','sculpted','stiletto','chrome','marble','nebula','artistry'] },
    'fresh-again': { label:'A small reset, with intention.', terms:['clean','natural','french','gloss','plain','minimal','pedicure'] }
  };
  const FALLBACK_INSPO = [
    ['inspo_1','Minimalist Chic','Gel: Natural','inspo1.png.png'],
    ['inspo_2','Nude Elegance','Gel: Natural','inspo2.png.png'],
    ['inspo_3','Chrome Artistry','Tips + Gel','inspo3.png.png'],
    ['inspo_4','Plain High-Gloss','Tips + Gel','inspo4.png.png'],
    ['inspo_5','Classic French Tips','Tips + Gel','inspo5.png.png'],
    ['inspo_6','3D Design Art','Tips + Gel','inspo6.png.png'],
    ['inspo_7','Chrome Effects','Structured Natural','inspo7.png.png'],
    ['inspo_8','Plain Structure','Structured + Tips','inspo8.png.png'],
    ['inspo_9','Modern French','Structured Natural','inspo9.png.png'],
    ['inspo_10','3D Sculpted Art','Structured + Tips','inspo10.png.png']
  ].map(([id,style,category,img]) => ({ id, style, title:style, category, img, kind:'inspo' }));

  const read = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };
  const slugify = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const savedWorkIds = () => [...new Set(read(WORK_KEY, []))];
  const savedInspo = () => read(INSPO_KEY, []);
  const taste = () => window.LuneTaste || null;
  const workCatalog = () => {
    const fromTaste = taste()?.catalogs?.work?.();
    if (Array.isArray(fromTaste) && fromTaste.length) return fromTaste;
    return Array.isArray(window.__allSetsRef) ? window.__allSetsRef.map(item => ({ ...item, kind:'work' })) : [];
  };
  const inspoCatalog = () => {
    const fromTaste = taste()?.catalogs?.inspo?.();
    if (Array.isArray(fromTaste) && fromTaste.length) return fromTaste.map(item => ({ ...item, title:item.title || item.style, img:item.img || item.imageUrl, kind:'inspo' }));
    return FALLBACK_INSPO.slice();
  };
  const workById = id => workCatalog().find(item => item.id === id) || null;
  const inspoById = id => inspoCatalog().find(item => item.id === id) || savedInspo().find(item => item.id === id) || null;
  const inspoKey = item => `${item.id}-${slugify(item.style || item.title || 'inspo')}`;
  const money = value => `KSh ${Number(value || 0).toLocaleString('en-KE')}`;

  function toast(message) {
    let el = document.querySelector('.experience-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'experience-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function updateSavedCount() {
    const total = savedWorkIds().length + savedInspo().length;
    document.querySelectorAll('[data-saved-count]').forEach(el => {
      el.textContent = total ? String(total) : '';
      el.setAttribute('aria-label', total ? `${total} saved` : 'No saved items');
    });
  }

  function fallbackSaveWork(id) {
    let ids = savedWorkIds();
    const adding = !ids.includes(id);
    ids = adding ? [...ids, id] : ids.filter(x => x !== id);
    write(WORK_KEY, ids);
    return adding;
  }

  function fallbackSaveInspo(item) {
    let items = savedInspo();
    const exists = items.some(x => x.id === item.id);
    items = exists ? items.filter(x => x.id !== item.id) : [...items, {
      id:item.id, slug:inspoKey(item), img:item.img || item.imageUrl, category:item.category, style:item.style || item.title
    }];
    write(INSPO_KEY, items);
    return !exists;
  }

  function saveWork(id) {
    const item = workById(id);
    if (!item) return;
    const wasSaved = savedWorkIds().includes(id);
    if (taste()) taste().saveItem({ ...item, kind:'work' });
    else fallbackSaveWork(id);
    updateSavedCount();
    polishWorkCards();
    renderSaved();
    toast(wasSaved ? 'Removed from saved.' : 'Saved.');
  }

  function saveInspo(item) {
    if (!item) return;
    const wasSaved = savedInspo().some(x => x.id === item.id);
    const normalized = { ...item, kind:'inspo', img:item.img || item.imageUrl, style:item.style || item.title };
    if (taste()) taste().saveItem(normalized);
    else fallbackSaveInspo(normalized);
    updateSavedCount();
    syncInspoLibrary();
    renderSaved();
    syncInspoDialog();
    toast(wasSaved ? 'Removed from saved.' : 'Saved.');
  }

  async function shareWork(id) {
    const item = workById(id);
    if (!item) return;
    if (taste()) return taste().shareItem({ ...item, kind:'work' });
    const url = new URL(`work.html?set=${encodeURIComponent(id)}&ref=share`, location.href).toString();
    if (navigator.share) return navigator.share({ title:`${item.title} — Lune`, url }).catch(() => {});
    await navigator.clipboard?.writeText(url); toast('Link copied.');
  }

  async function shareInspo(item) {
    if (!item) return;
    const normalized = { ...item, kind:'inspo', img:item.img || item.imageUrl, style:item.style || item.title };
    if (taste()) return taste().shareItem(normalized);
    const url = new URL(`inspo.html?look=${encodeURIComponent(inspoKey(normalized))}&ref=share`, location.href).toString();
    if (navigator.share) return navigator.share({ title:`${normalized.style} — Lune`, url }).catch(() => {});
    await navigator.clipboard?.writeText(url); toast('Link copied.');
  }

  window.isLiked = id => savedWorkIds().includes(id);
  window.toggleLike = id => saveWork(id);
  window.toggleLike.__luneWrapped = true;
  window.shareSet = id => shareWork(id);
  window.shareSet.__luneWrapped = true;

  function setHeart(button, saved) {
    if (!button) return;
    button.classList.toggle('is-saved', saved);
    button.title = saved ? 'Saved' : 'Save';
    button.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save this set');
    const icon = button.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-solid', saved);
      icon.classList.toggle('fa-regular', !saved);
      icon.style.color = saved ? 'var(--lacquer, #8f3f52)' : '';
    }
  }

  function polishWorkCards() {
    const liked = new Set(savedWorkIds());
    document.querySelectorAll('.gallery-card[data-id]').forEach(card => {
      const id = card.dataset.id;
      card.querySelectorAll('.card-quick-actions button').forEach(button => {
        if (button.title === 'Download Image' || button.querySelector('.fa-download')) button.remove();
      });
      card.querySelectorAll('a[href*="wa.me"]').forEach(link => link.remove());
      setHeart(card.querySelector('.card-quick-actions button[title="Like"], .card-quick-actions button[title="Save"], .card-quick-actions button[title="Saved"]'), liked.has(id));
      const book = card.querySelector('.btn-book-look');
      if (book) {
        book.innerHTML = liked.has(id) ? 'Saved <span aria-hidden="true">✓</span>' : 'Save this set <span aria-hidden="true">＋</span>';
        book.onclick = event => { event.preventDefault(); event.stopPropagation(); saveWork(id); };
      }
    });

    const grid = document.getElementById('gallery-grid');
    if (grid && !grid.querySelector('.gallery-card') && /No sets found/i.test(grid.textContent || '')) {
      grid.innerHTML = `<div class="saved-empty" style="grid-column:1/-1"><strong>Nothing in that exact direction yet.</strong><span>Try another finish, clear the search, or move into Inspo and come at it from a different angle.</span><div class="saved-empty-actions"><button class="quiet-action" type="button" data-clear-work-search>All work</button><a class="quiet-action" href="inspo.html">See inspo</a></div></div>`;
    }
  }

  function matchesInspoMood(item) {
    const mood = INSPO_MOODS[currentInspoMood] || INSPO_MOODS.all;
    if (!mood.terms.length) return true;
    const values = [item.title, item.style, item.category, item.finish, item.structure, item.palette, ...(item.tags || [])].join(' ').toLowerCase();
    return mood.terms.some(term => values.includes(term));
  }

  function inspoLibraryCard(item) {
    const normalized = { ...item, img:item.img || item.imageUrl, style:item.style || item.title };
    return `<article class="inspo-card" data-inspo-id="${normalized.id}"><div class="inspo-img-wrap"><img src="${normalized.img}" alt="${normalized.style}" loading="lazy"></div><div class="inspo-info"><span class="inspo-category">${normalized.category || 'Inspo'}</span><strong class="inspo-style">${normalized.style}</strong><button class="inspo-preview-link" type="button" data-ui-preview-inspo data-inspo-preview-trigger>Preview</button></div></article>`;
  }

  function syncInspoLibrary() {
    const container = document.getElementById('inspo-scroll');
    if (!container) return;
    const items = inspoCatalog().filter(matchesInspoMood);
    const rendered = [...container.querySelectorAll('.inspo-card')];
    const renderedIds = rendered.map(card => card.dataset.inspoId).join('|');
    const expectedIds = items.map(item => item.id).join('|');
    if (renderedIds !== expectedIds || rendered.some(card => !card.querySelector('[data-ui-preview-inspo]'))) {
      container.innerHTML = items.length ? items.map(inspoLibraryCard).join('') : '<div class="saved-empty"><strong>Nothing in that direction yet.</strong><span>Try another feeling.</span></div>';
    }
    [...container.querySelectorAll('.inspo-card')].forEach((card, index) => {
      const item = items.find(x => x.id === card.dataset.inspoId) || items[index];
      if (!item) return;
      card.dataset.inspoId = item.id;
      card.dataset.inspoKey = inspoKey(item);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Preview ${item.style || item.title || 'inspiration'}`);
      card.onclick = null;
      card.removeAttribute('onclick');
      let actions = card.querySelector('.inspo-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'inspo-actions';
        actions.innerHTML = '<button class="inspo-action" type="button" data-ui-save-inspo aria-label="Save inspiration">♡</button><button class="inspo-action" type="button" data-ui-share-inspo aria-label="Share inspiration">↗</button>';
        card.querySelector('.inspo-img-wrap')?.appendChild(actions);
      }
      const saved = savedInspo().some(x => x.id === item.id);
      const save = actions.querySelector('[data-ui-save-inspo]');
      if (save) { save.textContent = saved ? '♥' : '♡'; save.classList.toggle('is-saved', saved); }
    });
  }

  function setInspoMood(mood) {
    currentInspoMood = INSPO_MOODS[mood] ? mood : 'all';
    document.querySelectorAll('[data-inspo-mood]').forEach(button => button.classList.toggle('is-active', button.dataset.inspoMood === currentInspoMood));
    const feelingSection = document.querySelector('.inspo-feeling-section');
    const summary = document.querySelector('[data-inspo-feeling-summary]');
    const selectedLabel = document.querySelector('[data-inspo-selected-label]');
    const selectedButton = document.querySelector(`[data-inspo-mood="${currentInspoMood}"]`);
    const isChosen = currentInspoMood !== 'all';
    if (feelingSection) feelingSection.classList.toggle('is-folded', isChosen);
    if (summary) summary.hidden = !isChosen;
    if (selectedLabel && selectedButton) selectedLabel.textContent = selectedButton.querySelector('span')?.textContent || 'Your direction';
    syncInspoLibrary();
  }

  function changeInspoFeeling() {
    const feelingSection = document.querySelector('.inspo-feeling-section');
    const summary = document.querySelector('[data-inspo-feeling-summary]');
    if (feelingSection) feelingSection.classList.remove('is-folded');
    if (summary) summary.hidden = true;
    document.querySelector(`[data-inspo-mood="${currentInspoMood}"]`)?.focus();
  }

  function moveInspoRail(button) {
    const rail = document.getElementById(button.dataset.inspoRailTarget);
    if (!rail) return;
    const direction = Number(button.dataset.inspoRailStep) || 1;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({ left: rail.clientWidth * 0.82 * direction, behavior: reducedMotion ? 'auto' : 'smooth' });
    window.setTimeout(() => syncInspoRailControls(rail), reducedMotion ? 0 : 450);
  }

  function syncInspoRailControls(rail) {
    if (!rail) return;
    const atStart = rail.scrollLeft <= 1;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
    document.querySelectorAll(`[data-inspo-rail-target="${rail.id}"]`).forEach(button => {
      button.disabled = Number(button.dataset.inspoRailStep) < 0 ? atStart : atEnd;
    });
  }

  function setDialogPrice(dialog, label, value) {
    const labelNode = dialog?.querySelector('[data-dialog-price-wrap] span, .preview-price span');
    const priceNode = dialog?.querySelector('[data-dialog-price]');
    if (labelNode && label) labelNode.textContent = label;
    if (priceNode) priceNode.textContent = value;
  }

  async function syncInspoPrice(dialog, item) {
    const directPrice = Number(item.priceKes || item.price_kes || item.price || 0);
    if (directPrice) { setDialogPrice(dialog, 'Set price from', money(directPrice)); return; }
    const itemId = item.id;
    dialog.dataset.priceFor = itemId;
    setDialogPrice(dialog, 'Set price from', 'Loading…');
    try {
      const response = await fetch(`/api/booking/item?kind=inspo&id=${encodeURIComponent(itemId)}`, { credentials:'same-origin' });
      const data = await response.json();
      const price = Number(data?.item?.priceKes || data?.item?.price_kes || data?.service?.basePriceKes || data?.service?.base_price_kes || 0);
      if (dialog.dataset.priceFor === itemId) setDialogPrice(dialog, 'Set price from', price ? money(price) : 'Confirmed before you reserve');
    } catch (_) {
      if (dialog.dataset.priceFor === itemId) setDialogPrice(dialog, 'Set price from', 'Confirmed before you reserve');
    }
  }

  function syncWorkPrice(dialog, itemId) {
    const item = workById(itemId);
    const price = Number(item?.priceKes || item?.price_kes || item?.price || dialog?.dataset.priceKes || 0);
    setDialogPrice(dialog, 'Set price', price ? money(price) : 'Confirmed before you reserve');
  }

  function openInspo(item, push = true) {
    const dialog = document.getElementById('inspo-dialog');
    if (!dialog || !item) return;
    const normalized = { ...item, kind:'inspo', img:item.img || item.imageUrl, style:item.style || item.title };
    taste()?.track?.('open', normalized, { source:'inspo-library' });
    dialog.dataset.inspoId = normalized.id;
    const img = dialog.querySelector('.v3-dialog-media img');
    if (img) { img.src = normalized.img; img.alt = normalized.style; }
    const category = dialog.querySelector('[data-dialog-category]');
    const title = dialog.querySelector('[data-dialog-title]');
    if (category) category.textContent = normalized.category || 'INSPO';
    if (title) title.textContent = normalized.style;
    const workLink = dialog.querySelector('[data-dialog-work]');
    if (workLink) workLink.href = `work.html?from=inspo&seed=${encodeURIComponent(normalized.style)}`;
    syncInspoPrice(dialog, normalized);
    syncInspoDialog();
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set('look', inspoKey(normalized));
      url.searchParams.delete('ref');
      history.pushState({ luneInspo:normalized.id }, '', url);
    }
    if (!dialog.open) dialog.showModal();
  }

  function syncInspoDialog() {
    const dialog = document.getElementById('inspo-dialog');
    if (!dialog?.dataset.inspoId) return;
    const saved = savedInspo().some(x => x.id === dialog.dataset.inspoId);
    const button = dialog.querySelector('[data-dialog-save]');
    if (button) { button.textContent = saved ? 'Saved' : 'Save this inspo'; button.classList.toggle('is-saved', saved); }
  }

  function workCard(item) {
    const saved = savedWorkIds().includes(item.id);
    return `<article class="taste-card" data-set-id="${item.id}"><figure><a href="work.html?set=${encodeURIComponent(item.id)}"><img src="${item.imageUrl || item.img}" alt="${item.title}" loading="lazy"></a></figure><div class="taste-copy"><small>${item.category || 'Lune work'}</small><h3>${item.title}</h3><p>${item.style || ''}</p><div class="card-actions"><button class="quiet-action ${saved ? 'is-saved' : ''}" type="button" data-ui-save-work="${item.id}">${saved ? 'Saved' : 'Save'}</button><button class="quiet-action" type="button" data-ui-share-work="${item.id}">Share</button><a class="quiet-action" href="work.html?set=${encodeURIComponent(item.id)}">Open</a></div></div></article>`;
  }

  function inspoCard(item) {
    const normalized = { ...item, img:item.img || item.imageUrl, style:item.style || item.title };
    const saved = savedInspo().some(x => x.id === normalized.id);
    return `<article class="personal-inspo-card" data-inspo-id="${normalized.id}"><figure><a href="inspo.html?look=${encodeURIComponent(inspoKey(normalized))}"><img src="${normalized.img}" alt="${normalized.style}" loading="lazy"></a></figure><div class="personal-inspo-copy"><small>${normalized.category || 'Inspo'}</small><h3>${normalized.style}</h3><div class="card-actions"><button class="quiet-action ${saved ? 'is-saved' : ''}" type="button" data-ui-save-inspo-card="${normalized.id}">${saved ? 'Saved' : 'Save'}</button><button class="quiet-action" type="button" data-ui-share-inspo-card="${normalized.id}">Share</button><a class="quiet-action" href="inspo.html?look=${encodeURIComponent(inspoKey(normalized))}">Open</a></div></div></article>`;
  }

  function renderSaved() {
    if (!document.body.classList.contains('aura-favorites-page')) return;
    const liked = new Set(savedWorkIds());
    const work = workCatalog().filter(item => liked.has(item.id));
    const storedInspo = savedInspo();
    const catalog = inspoCatalog();
    const inspo = storedInspo.map(saved => catalog.find(item => item.id === saved.id) || saved);
    const workGrid = document.getElementById('saved-work-grid');
    const inspoGrid = document.getElementById('saved-inspo-grid');
    const empty = document.getElementById('saved-empty');
    if (workGrid) workGrid.innerHTML = work.map(workCard).join('');
    if (inspoGrid) inspoGrid.innerHTML = inspo.map(inspoCard).join('');
    document.querySelectorAll('[data-saved-work-section]').forEach(node => node.hidden = !work.length);
    document.querySelectorAll('[data-saved-inspo-section]').forEach(node => node.hidden = !inspo.length);
    const total = work.length + inspo.length;
    if (empty) {
      empty.hidden = total > 0;
      if (!total) empty.innerHTML = '<strong>Your shortlist starts with one save.</strong><span>Start with Inspo when you want a direction, or Work when you already know the finish.</span><div class="saved-empty-actions"><a class="quiet-action" href="inspo.html">See inspo</a><a class="quiet-action" href="work.html">See work</a></div>';
    }
  }

  function scheduleNudge() {
    if (sessionStorage.getItem(NUDGE_KEY) || document.body.classList.contains('aura-favorites-page')) return;
    const fire = () => {
      if (sessionStorage.getItem(NUDGE_KEY) || document.querySelector('.experience-nudge, .membership-invite')) return;
      sessionStorage.setItem(NUDGE_KEY, '1');
      const count = savedWorkIds().length + savedInspo().length;
      const nudge = document.createElement('aside');
      nudge.className = 'experience-nudge';
      if (count) nudge.innerHTML = `<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>SAVED</small><h3>${count === 1 ? 'One look stayed with you.' : `${count} looks made the cut.`}</h3><p>Your shortlist is still here.</p><a class="text-link" href="favorites.html">Open saved <span class="arrow">→</span></a>`;
      else if (document.body.classList.contains('aura-work-page')) nudge.innerHTML = '<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>STILL LOOKING?</small><h3>Come at it from the other side.</h3><p>Inspo can make the direction clearer before you choose the exact set.</p><a class="text-link" href="inspo.html">See inspo <span class="arrow">→</span></a>';
      else if (document.body.classList.contains('aura-inspo-page')) nudge.innerHTML = '<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>WANT THE PROOF?</small><h3>See how the ideas finish.</h3><p>Move from inspiration into completed sets without losing the direction.</p><a class="text-link" href="work.html">See the work <span class="arrow">→</span></a>';
      else return;
      document.body.appendChild(nudge);
      nudge.querySelector('.experience-nudge-close')?.addEventListener('click', () => nudge.remove());
      requestAnimationFrame(() => nudge.classList.add('show'));
    };
    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const progress = window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
      if (progress > .48) { fired = true; window.removeEventListener('scroll', onScroll); setTimeout(fire, 650); }
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    setTimeout(() => { if (!fired) { fired = true; window.removeEventListener('scroll', onScroll); fire(); } }, 20000);
  }

  function handleSharedInspo() {
    if (!document.body.classList.contains('aura-inspo-page')) return;
    const look = new URLSearchParams(location.search).get('look');
    if (!look) return;
    const id = look.match(/^(inspo_\d+)/)?.[1] || look;
    const item = inspoById(id);
    if (!item) return;
    setTimeout(() => {
      openInspo(item, false);
    }, 260);
  }

  function bind() {
    document.addEventListener('click', event => {
      const personalRecommendation = event.target.closest('#personal-inspo-grid .taste-card[data-lune-reco]');
      if (personalRecommendation && !event.target.closest('[data-taste-save], [data-taste-share], [data-taste-dislike]')) {
        const [, itemId] = personalRecommendation.dataset.luneReco.split(':');
        event.preventDefault();
        event.stopPropagation();
        openInspo(inspoById(itemId));
        return;
      }
      const clear = event.target.closest('[data-clear-work-search]');
      if (clear) {
        const input = document.getElementById('gallery-search');
        if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles:true })); }
        document.querySelector('[data-category="all"]')?.click();
        return;
      }
      const saveWorkButton = event.target.closest('[data-ui-save-work]');
      if (saveWorkButton) { event.preventDefault(); saveWork(saveWorkButton.dataset.uiSaveWork); return; }
      const shareWorkButton = event.target.closest('[data-ui-share-work]');
      if (shareWorkButton) { event.preventDefault(); shareWork(shareWorkButton.dataset.uiShareWork); return; }
      const saveInspoCard = event.target.closest('[data-ui-save-inspo-card]');
      if (saveInspoCard) { event.preventDefault(); saveInspo(inspoById(saveInspoCard.dataset.uiSaveInspoCard)); return; }
      const shareInspoCard = event.target.closest('[data-ui-share-inspo-card]');
      if (shareInspoCard) { event.preventDefault(); shareInspo(inspoById(shareInspoCard.dataset.uiShareInspoCard)); return; }
      const librarySave = event.target.closest('[data-ui-save-inspo]');
      if (librarySave) { event.preventDefault(); event.stopPropagation(); saveInspo(inspoById(librarySave.closest('.inspo-card')?.dataset.inspoId)); return; }
      const libraryShare = event.target.closest('[data-ui-share-inspo]');
      if (libraryShare) { event.preventDefault(); event.stopPropagation(); shareInspo(inspoById(libraryShare.closest('.inspo-card')?.dataset.inspoId)); return; }
      const previewInspo = event.target.closest('[data-ui-preview-inspo]');
      if (previewInspo) { event.preventDefault(); event.stopPropagation(); openInspo(inspoById(previewInspo.closest('.inspo-card')?.dataset.inspoId)); return; }
      const card = event.target.closest('.aura-inspo-page .inspo-card');
      if (card) { event.preventDefault(); openInspo(inspoById(card.dataset.inspoId)); return; }
      const dialogSave = event.target.closest('[data-dialog-save]');
      if (dialogSave) { event.preventDefault(); saveInspo(inspoById(dialogSave.closest('#inspo-dialog')?.dataset.inspoId)); return; }
      const dialogShare = event.target.closest('[data-dialog-share]');
      if (dialogShare) { event.preventDefault(); shareInspo(inspoById(dialogShare.closest('#inspo-dialog')?.dataset.inspoId)); return; }
      const workImage = event.target.closest('.aura-work-page .gallery-card .card-image-wrap');
      if (workImage) {
        const dialog = document.getElementById('work-lightbox');
        if (dialog) dialog.dataset.setId = workImage.closest('.gallery-card')?.dataset.id || '';
      }
      const dialogWorkSave = event.target.closest('[data-dialog-save-work]');
      if (dialogWorkSave) { event.preventDefault(); const id = dialogWorkSave.closest('#work-lightbox')?.dataset.setId; if (id) saveWork(id); }
    }, true);

    document.querySelectorAll('.v3-dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
    document.querySelectorAll('[data-inspo-mood]').forEach(button => button.addEventListener('click', () => setInspoMood(button.dataset.inspoMood)));
    document.querySelector('[data-inspo-feeling-change]')?.addEventListener('click', changeInspoFeeling);
    document.querySelectorAll('[data-inspo-rail-step]').forEach(button => button.addEventListener('click', () => moveInspoRail(button)));
    document.querySelectorAll('.inspo-rail[id]').forEach(rail => {
      syncInspoRailControls(rail);
      rail.addEventListener('scroll', () => syncInspoRailControls(rail), { passive:true });
    });
    document.addEventListener('lune:dialog-item', event => {
      const dialog = event.target.closest?.('#work-lightbox') || document.getElementById('work-lightbox');
      const detail = event.detail || {};
      if (dialog && detail.kind === 'work') syncWorkPrice(dialog, detail.id || dialog.dataset.setId);
    });
    document.getElementById('inspo-dialog')?.addEventListener('close', () => {
      const url = new URL(location.href);
      if (url.searchParams.has('look')) { url.searchParams.delete('look'); history.replaceState({}, '', url); }
    });
  }

  function boot() {
    updateSavedCount();
    bind();
    syncInspoLibrary();
    renderSaved();
    polishWorkCards();
    scheduleNudge();
    handleSharedInspo();

    const workGrid = document.getElementById('gallery-grid');
    if (workGrid) new MutationObserver(() => polishWorkCards()).observe(workGrid, { childList:true, subtree:true });
    const inspoGrid = document.getElementById('inspo-scroll');
    if (inspoGrid) new MutationObserver(() => syncInspoLibrary()).observe(inspoGrid, { childList:true, subtree:true });

    window.addEventListener('lune:taste-changed', () => { updateSavedCount(); polishWorkCards(); syncInspoLibrary(); renderSaved(); syncInspoDialog(); });
    window.addEventListener('aura:taste-changed', () => { updateSavedCount(); polishWorkCards(); syncInspoLibrary(); renderSaved(); syncInspoDialog(); });
    window.addEventListener('storage', event => { if ([WORK_KEY, INSPO_KEY].includes(event.key)) { updateSavedCount(); polishWorkCards(); syncInspoLibrary(); renderSaved(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
