(function (root, factory) {
  const api = factory(root || {});
  if (root) {
    root.LuneTaste = api;
    root.AuraTaste = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const DAY = 86400000;
  const HALF_LIFE_DAYS = 45;
  const MAX_EVENTS = 800;
  const MAX_HISTORY = 500;
  const MAX_OUTBOX = 800;
  const KEYS = {
    visitor: 'lune_visitor_id_v1',
    events: 'lune_taste_events_v1',
    history: 'lune_recommendation_history_v1',
    outbox: 'lune_taste_outbox_v1',
    workSaved: 'auranails_liked',
    inspoSaved: 'aura_inspo_saved'
  };

  const memory = new Map();
  const local = (() => {
    try { return root.localStorage || null; } catch (_) { return null; }
  })();
  const session = (() => {
    try { return root.sessionStorage || null; } catch (_) { return null; }
  })();
  const storage = {
    get(key) { return local ? local.getItem(key) : (memory.has(key) ? memory.get(key) : null); },
    set(key, value) { if (local) local.setItem(key, value); else memory.set(key, value); }
  };
  const read = (key, fallback) => {
    try {
      const raw = storage.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  };
  const write = (key, value) => storage.set(key, JSON.stringify(value));
  const uid = () => {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return `lune_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  };
  const visitorId = (() => {
    let id = storage.get(KEYS.visitor);
    if (!id) { id = uid(); storage.set(KEYS.visitor, id); }
    return id;
  })();
  const sessionId = (() => {
    if (!session) return uid();
    let id = session.getItem('lune_taste_session_v1');
    if (!id) { id = uid(); session.setItem('lune_taste_session_v1', id); }
    return id;
  })();

  const FALLBACK_WORK = [
    ['set_01','Gloss Natural Glaze','Gel Polish','Plain on Natural Nails','nails1.png.png',['GelPolish','NaturalNails','Minimalist','Glossy'],24],
    ['set_02','Classic Parisian French','Tips + Gel','Classic French Tips Extension','nails2.png.png',['FrenchTips','TipsGel','Timeless','CleanGirl'],38],
    ['set_03','Liquid Chrome & 3D Drops','3D & Chrome Art','3D Sculpted & Chrome Accents','nails3.png.png',['Chrome','3DArt','Editorial','Molten'],52],
    ['set_04','Complex 3D Nebula Art','3D & Chrome Art','Complex Arts + Multi-layer 3D','nails4.png.png',['3DArt','Signature','ComplexDesign','Luxury'],45],
    ['set_05','Blush Centered Aura Ombré','Gel Polish','Centered Ombré Design','nails5.png.png',['Aura','Ombre','Blush','AirbrushLook'],41],
    ['set_06','Soft Nude French Curve','Tips + Gel','Nude French Tips Extension','nails6.png.png',['NudeFrench','Almond','TipsGel','SubtleLuxury'],29],
    ['set_07','Platinum Mirror Chrome','3D & Chrome Art','3D Chrome Accents','nails7.png.png',['MirrorChrome','Platinum','Trendy','Shine'],33],
    ['set_08','Sculpted 3D Moulding','Gumgel Overlays','Chrome 3D & Sculpted Moulding','nails8.png.png',['Gumgel','Sculpted','Moulding','HeavyArt'],49],
    ['set_09','Milky Quartz Natural Ombré','Gel Polish','Ombre on Natural Nails','nails9.png.png',['NaturalNails','MilkyOmbre','Minimal','Gel'],27],
    ['set_10','Clean Minimalist Chrome','3D & Chrome Art','Simple Chrome Minimal Line Art','nails10.png.png',['Chrome','Minimalist','JellyNails','Modern'],31],
    ['set_11','Cyberpunk Chrome Stiletto','3D & Chrome Art','Chrome 3D Long Stiletto','nails11.png.png',['Stiletto','LongNails','Chrome','Baddie'],64],
    ['set_12','Obsidian Marble & 3D Veins','3D & Chrome Art','Marble Design + 3D Textures','nails12.png.png',['Marble','3D','StoneArt','Luxury'],39],
    ['set_13','Sunset Glow Ombré Stiletto','Tips + Gel','Ombre Long Stiletto Extension','nails13.png.png',['Ombre','Stiletto','SunsetGlow','Vibrant'],42],
    ['set_14','Luxe Russian Gel Pedicure','Pedicure','Plain Gel on Toes & Deep Prep','nails14.png.png',['Pedicure','Toes','CleanPrep','Gloss'],21]
  ].map(([id,title,category,style,imageUrl,tags,likes]) => ({ id,title,category,style,imageUrl,tags,likes,kind:'work' }));

  const CURATED_INSPO = [
    ['inspo_1','Minimalist Chic','Gel: Natural','inspo1.png.png'],
    ['inspo_2','Nude Elegance','Gel: Natural','inspo2.png.png'],
    ['inspo_3','Chrome Artistry','Tips + Gel','inspo3.png.png'],
    ['inspo_4','Plain High-Gloss','Tips + Gel','inspo4.png.png'],
    ['inspo_5','Classic French Tips','Tips + Gel','inspo5.png.png'],
    ['inspo_6','3D Design Art','Tips + Gel','inspo6.png.png'],
    ['inspo_7','Chrome Effects','Gumgel: Natural','inspo7.png.png'],
    ['inspo_8','Plain Structure','Gumgel + Tips','inspo8.png.png'],
    ['inspo_9','Modern French','Gumgel: Natural','inspo9.png.png'],
    ['inspo_10','3D Sculpted Art','Gumgel + Tips','inspo10.png.png']
  ].map(([id,style,category,img], index) => ({ id,style,category,img,kind:'inspo',curatedScore:1 - index * .045 }));

  const STOP = new Set(['nail','nails','with','plus','and','the','gel','tips','design','look','style','set','art','aura','lune']);
  const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const words = value => normalize(value).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
  const slugify = value => normalize(value).replace(/\s+/g, '-');

  const DIMENSIONS = {
    shape: ['almond','stiletto','square','coffin','oval','round'],
    length: ['short','medium','long','xxl'],
    finish: ['chrome','ombre','french','gloss','glossy','matte','nude','minimal','minimalist','marble','aura','jelly','mirror','3d','sculpted','natural'],
    palette: ['nude','blush','pink','rose','white','silver','platinum','black','obsidian','red','orange','sunset','milky','quartz'],
    structure: ['natural','gumgel','overlay','tips','extension','pedicure']
  };

  function itemText(item) {
    return [item.title, item.style, item.category, item.description, ...(item.tags || [])].filter(Boolean).join(' ');
  }

  function features(item) {
    if (!item) return [];
    const text = normalize(itemText(item));
    const base = words(text).map(t => `word:${t}`);
    const dims = [];
    Object.entries(DIMENSIONS).forEach(([dimension, values]) => {
      values.forEach(value => {
        if (new RegExp(`\\b${value}\\b`).test(text)) dims.push(`${dimension}:${value}`);
      });
    });
    const category = normalize(item.category).split(' ').slice(0, 2).join('_');
    if (category) dims.push(`category:${category}`);
    return [...new Set([...dims, ...base])];
  }

  function workCatalog() {
    const dynamic = Array.isArray(root.__allSetsRef) && root.__allSetsRef.length ? root.__allSetsRef : [];
    const source = dynamic.length ? dynamic : FALLBACK_WORK;
    return source.map(x => ({ ...x, kind:'work', imageUrl:x.imageUrl || x.img }));
  }

  function inspoCatalog() {
    if (typeof document === 'undefined') return CURATED_INSPO.slice();
    const cards = [...document.querySelectorAll('#inspo-scroll .inspo-card')];
    if (!cards.length) return CURATED_INSPO.slice();
    return cards.map((card, index) => {
      const fallback = CURATED_INSPO[index] || {};
      return {
        kind:'inspo',
        id: card.dataset.inspoId || fallback.id || `inspo_${index + 1}`,
        style: card.querySelector('.inspo-style')?.textContent?.trim() || fallback.style || `Inspo ${index + 1}`,
        category: card.querySelector('.inspo-category')?.textContent?.trim() || fallback.category || 'Inspo',
        img: card.querySelector('img')?.getAttribute('src') || fallback.img || '',
        curatedScore: fallback.curatedScore ?? Math.max(.2, 1 - index * .05)
      };
    });
  }

  const getSavedWorkIds = () => [...new Set(read(KEYS.workSaved, []))];
  const getSavedInspo = () => read(KEYS.inspoSaved, []);

  const WEIGHTS = { impression:0, view:.12, dwell:.65, open:1.35, save:5.5, share:3.2, book:7.5, reorder:10, unsave:-3.2, dislike:-6 };
  const DEDUPE_MS = { view:90000, dwell:90000, open:20000, impression:600000 };

  function eventFingerprint(event) { return `${event.kind}:${event.itemId}:${event.action}`; }

  function track(action, item, meta = {}) {
    if (!item || !(action in WEIGHTS)) return null;
    const now = Date.now();
    let events = read(KEYS.events, []);
    const fingerprint = `${item.kind || meta.kind || 'work'}:${item.id}:${action}`;
    const dedupe = DEDUPE_MS[action] || 0;
    if (dedupe) {
      const duplicate = [...events].reverse().find(e => eventFingerprint(e) === fingerprint && now - Number(e.ts || 0) < dedupe);
      if (duplicate) return duplicate;
    }
    const event = {
      id: uid(), visitorId, sessionId,
      kind:item.kind || meta.kind || 'work', itemId:item.id,
      action, weight:WEIGHTS[action], features:features(item), ts:now,
      surface:meta.surface || currentSurface(), source:meta.source || null,
      dwellMs:meta.dwellMs || null
    };
    events.push(event);
    write(KEYS.events, events.slice(-MAX_EVENTS));
    const outbox = read(KEYS.outbox, []);
    outbox.push(event);
    write(KEYS.outbox, outbox.slice(-MAX_OUTBOX));
    if (['open','save','share','book','reorder','dislike'].includes(action)) markHistoryEngaged(item.kind, item.id, action);
    scheduleRefresh();
    return event;
  }

  function currentSurface() {
    if (typeof location === 'undefined') return 'unknown';
    const page = (location.pathname.split('/').pop() || 'index.html').replace('.html','');
    return page || 'home';
  }

  function history() { return read(KEYS.history, []); }
  function saveHistory(rows) { write(KEYS.history, rows.slice(-MAX_HISTORY)); }
  function markShown(item, surface, bucket, rank) {
    const rows = history();
    const key = `${item.kind}:${item.id}:${surface}`;
    let row = rows.find(x => x.key === key);
    if (!row) {
      row = { key, kind:item.kind, itemId:item.id, surface, shown:0, engaged:0, lastShown:0, lastEngaged:0, buckets:{} };
      rows.push(row);
    }
    row.shown += 1;
    row.lastShown = Date.now();
    row.lastRank = rank;
    row.buckets[bucket] = (row.buckets[bucket] || 0) + 1;
    saveHistory(rows);
  }
  function markHistoryEngaged(kind, itemId, action) {
    const rows = history();
    rows.forEach(row => {
      if (row.kind === kind && row.itemId === itemId) {
        row.engaged = (row.engaged || 0) + 1;
        row.lastEngaged = Date.now();
        row.lastAction = action;
      }
    });
    saveHistory(rows);
  }
  function repetitionPenalty(item, surface) {
    const rows = history().filter(x => x.kind === item.kind && x.itemId === item.id);
    if (!rows.length) return 0;
    const now = Date.now();
    const surfaceRow = rows.find(x => x.surface === surface);
    const shown = rows.reduce((s, x) => s + Number(x.shown || 0), 0);
    const engaged = rows.reduce((s, x) => s + Number(x.engaged || 0), 0);
    const recent = surfaceRow && now - surfaceRow.lastShown < 3 * DAY ? .12 : 0;
    const fatigue = Math.min(.34, Math.max(0, shown - engaged) * .055);
    const rewarded = Math.min(.12, engaged * .03);
    return Math.max(0, fatigue + recent - rewarded);
  }

  function buildProfile() {
    const score = new Map();
    const evidence = new Map();
    const add = (feature, value) => {
      score.set(feature, (score.get(feature) || 0) + value);
      evidence.set(feature, (evidence.get(feature) || 0) + 1);
    };
    const now = Date.now();
    read(KEYS.events, []).forEach(event => {
      const age = Math.max(0, (now - Number(event.ts || now)) / DAY);
      const decay = Math.exp(-Math.LN2 * age / HALF_LIFE_DAYS);
      const weight = Number(event.weight || WEIGHTS[event.action] || 0) * decay;
      (event.features || []).forEach(f => add(f, weight));
    });
    const work = workCatalog();
    const workById = new Map(work.map(x => [x.id, x]));
    getSavedWorkIds().forEach(id => features(workById.get(id)).forEach(f => add(f, 2.4)));
    getSavedInspo().forEach(item => features({ ...item, kind:'inspo' }).forEach(f => add(f, 2.2)));

    const ordered = [...score.entries()].sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
    const strength = ordered.reduce((sum,[,v]) => sum + Math.max(0,v), 0);
    const allEvents = read(KEYS.events, []);
    const strongEvents = allEvents.filter(e => ['save','share','book','reorder'].includes(e.action)).length;
    const meaningfulEvents = allEvents.filter(e => ['dwell','open','save','share','book','reorder','unsave','dislike'].includes(e.action)).length;
    return { score, evidence, ordered, strength, established: strongEvents >= 2 || meaningfulEvents >= 6 };
  }

  function affinity(item, profile) {
    const fs = features(item);
    if (!fs.length || !profile.score.size) return 0;
    let positive = 0, negative = 0;
    fs.forEach(f => {
      const v = profile.score.get(f) || 0;
      if (v >= 0) positive += Math.min(v, 18);
      else negative += Math.abs(Math.max(v, -18));
    });
    return Math.tanh((positive - negative * 1.25) / (5 + Math.sqrt(fs.length) * 3));
  }

  function tokenSet(item) { return new Set(features(item)); }
  function jaccard(a,b) {
    const A = tokenSet(a), B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(x => { if (B.has(x)) n++; });
    return n / (A.size + B.size - n);
  }
  function categoryKey(item) { return normalize(item.category).split(' ').slice(0,2).join('_') || item.kind; }
  function quality(item, catalog) {
    if (item.kind === 'inspo') return Math.max(.25, Number(item.curatedScore || .5));
    const maxLikes = Math.max(1, ...catalog.map(x => Number(x.likes || 0)));
    return Math.min(1, .3 + .7 * Number(item.likes || 0) / maxLikes);
  }
  function noveltyToProfile(item, profile) {
    const fs = features(item);
    if (!fs.length || !profile.score.size) return 1;
    const known = fs.filter(f => Math.abs(profile.score.get(f) || 0) >= 1.5).length;
    return 1 - known / fs.length;
  }

  function scoreCandidate(item, catalog, profile, surface, selected) {
    const a = affinity(item, profile);
    const q = quality(item, catalog);
    const novelty = noveltyToProfile(item, profile);
    const diversity = selected.length ? 1 - Math.max(...selected.map(x => jaccard(item, x))) : 1;
    const repeat = repetitionPenalty(item, surface);
    return {
      a, q, novelty, diversity, repeat,
      core: a * .66 + q * .17 + diversity * .17 - repeat,
      adjacent: a * .32 + novelty * .30 + q * .18 + diversity * .20 - repeat,
      explore: novelty * .42 + diversity * .28 + q * .30 - repeat
    };
  }

  function pickBest(pool, catalog, profile, surface, selected, mode, categoryCounts) {
    let best = null, bestIndex = -1, bestScore = -Infinity;
    pool.forEach((item, index) => {
      const cat = categoryKey(item);
      if ((categoryCounts.get(cat) || 0) >= 2) return;
      const s = scoreCandidate(item, catalog, profile, surface, selected)[mode];
      if (s > bestScore) { best = item; bestIndex = index; bestScore = s; }
    });
    if (!best && pool.length) { best = pool[0]; bestIndex = 0; }
    return { item:best, index:bestIndex };
  }

  function recommend(catalog, { limit=4, surface='generic', excludeIds=[] } = {}) {
    const profile = buildProfile();
    const excluded = new Set(excludeIds);
    let pool = catalog.filter(x => !excluded.has(x.id));
    if (pool.length < limit) pool = catalog.slice();
    if (!pool.length) return [];

    const selected = [];
    const buckets = [];
    const counts = new Map();
    const take = mode => {
      if (!pool.length || selected.length >= limit) return;
      const picked = pickBest(pool, catalog, profile, surface, selected, mode, counts);
      if (!picked.item) return;
      pool.splice(picked.index, 1);
      selected.push(picked.item);
      buckets.push(mode);
      const cat = categoryKey(picked.item);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    };

    if (!profile.established) {
      while (selected.length < limit && pool.length) take('explore');
    } else {
      const coreCount = Math.max(1, Math.floor(limit * .5));
      const adjacentCount = Math.max(1, Math.floor(limit * .25));
      for (let i=0;i<coreCount;i++) take('core');
      for (let i=0;i<adjacentCount;i++) take('adjacent');
      while (selected.length < limit && pool.length) take('explore');
    }

    return selected.map((item,index) => ({ ...item, recommendation:{ bucket:buckets[index] || 'explore', rank:index+1, surface } }));
  }

  function recommendWork(limit=4, surface='work') {
    return recommend(workCatalog(), { limit, surface, excludeIds:getSavedWorkIds() });
  }
  function recommendInspo(limit=4, surface='inspo') {
    return recommend(inspoCatalog(), { limit, surface, excludeIds:getSavedInspo().map(x => x.id) });
  }
  function recommendMixed(limit=4, surface='saved') {
    return recommend([...workCatalog(), ...inspoCatalog()], { limit, surface, excludeIds:[...getSavedWorkIds(), ...getSavedInspo().map(x => x.id)] });
  }

  function workHref(item) { return `work.html?set=${encodeURIComponent(item.id)}&source=taste`; }
  function inspoSlug(item) { return `${item.id}-${slugify(item.style || item.title || 'inspo')}`; }
  function inspoHref(item) { return `inspo.html?look=${encodeURIComponent(inspoSlug(item))}&source=taste`; }
  function itemHref(item) { return item.kind === 'inspo' ? inspoHref(item) : workHref(item); }
  function imageOf(item) { return item.kind === 'inspo' ? item.img : item.imageUrl; }
  function titleOf(item) { return item.title || item.style || 'Lune look'; }

  function renderTasteCard(item) {
    const href = itemHref(item);
    const image = imageOf(item);
    return `<article class="taste-card" data-lune-reco="${item.kind}:${item.id}" data-reco-bucket="${item.recommendation?.bucket || 'explore'}" data-reco-rank="${item.recommendation?.rank || 1}" data-reco-surface="${item.recommendation?.surface || currentSurface()}">
      <figure><a href="${href}" data-taste-open><img src="${image}" alt="${titleOf(item)}" loading="lazy"></a></figure>
      <div class="taste-copy"><small>${item.category || 'Inspo'}</small><h3>${titleOf(item)}</h3><p>${item.style && item.title ? item.style : ''}</p>
      <div class="card-actions"><a class="quiet-action" href="${href}" data-taste-open>Open</a><button class="quiet-action" type="button" data-taste-save="${item.kind}:${item.id}">Save</button><button class="quiet-action" type="button" data-taste-share="${item.kind}:${item.id}">Share</button><button class="quiet-action" type="button" data-taste-dislike="${item.kind}:${item.id}">Not my direction</button></div></div>
    </article>`;
  }

  function findItem(kind,id) {
    return (kind === 'inspo' ? inspoCatalog() : workCatalog()).find(x => x.id === id) || null;
  }

  function saveItem(item) {
    if (!item) return;
    if (item.kind === 'work') {
      let ids = getSavedWorkIds();
      const adding = !ids.includes(item.id);
      ids = adding ? [...ids,item.id] : ids.filter(x => x !== item.id);
      write(KEYS.workSaved, ids);
      track(adding ? 'save' : 'unsave', item, { source:'taste-card' });
    } else {
      let items = getSavedInspo();
      const exists = items.some(x => x.id === item.id);
      items = exists ? items.filter(x => x.id !== item.id) : [...items,{ id:item.id, slug:inspoSlug(item), img:item.img, category:item.category, style:item.style }];
      write(KEYS.inspoSaved, items);
      track(exists ? 'unsave' : 'save', item, { source:'taste-card' });
    }
    if (typeof document !== 'undefined') {
      const total = getSavedWorkIds().length + getSavedInspo().length;
      document.querySelectorAll('[data-saved-count]').forEach(el => { el.textContent = total ? String(total) : ''; });
    }
    root.dispatchEvent?.(new CustomEvent('aura:taste-changed'));
    root.dispatchEvent?.(new CustomEvent('lune:taste-changed'));
    scheduleRefresh();
  }

  async function shareItem(item) {
    if (!item) return;
    track('share', item, { source:'taste-card' });
    const url = new URL(itemHref(item), typeof location !== 'undefined' ? location.href : 'https://lune.example/');
    url.searchParams.set('ref','share');
    try {
      if (root.navigator?.share) await root.navigator.share({ title:`${titleOf(item)} — Lune`, url:url.toString() });
      else if (root.navigator?.clipboard) await root.navigator.clipboard.writeText(url.toString());
    } catch (err) { if (err?.name !== 'AbortError') console.warn('Share failed', err); }
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    if (typeof document === 'undefined') return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshSurfaces, 60);
  }

  function refreshHome() {
    if (!document.body.classList.contains('aura-home-page')) return;
    const work = recommendWork(3,'home-work');
    const inspo = recommendInspo(3,'home-inspo');
    const obsession = work[0];
    if (obsession) {
      const title = document.getElementById('obsession-title');
      const cat = document.getElementById('obsession-category');
      const link = document.querySelector('[data-obsession-link]');
      if (title) title.textContent = obsession.title;
      if (cat) cat.textContent = obsession.category;
      if (link) link.href = workHref(obsession);
    }
    document.querySelectorAll('.work-preview .work-shot').forEach((figure,index) => {
      const item = work[index]; if (!item) return;
      const img = figure.querySelector('img'); const caption = figure.querySelector('figcaption');
      if (img) { img.src = item.imageUrl; img.alt = item.title; }
      if (caption) caption.textContent = `${item.style || item.category}`;
      figure.dataset.luneReco = `work:${item.id}`;
      figure.dataset.recoBucket = item.recommendation?.bucket || 'explore';
      figure.dataset.recoRank = item.recommendation?.rank || index + 1;
      figure.dataset.recoSurface = 'home-work';
    });
    document.querySelectorAll('.references-preview .reference-shot').forEach((figure,index) => {
      const item = inspo[index]; if (!item) return;
      const img = figure.querySelector('img');
      if (img) { img.src = item.img; img.alt = item.style; }
      figure.dataset.luneReco = `inspo:${item.id}`;
      figure.dataset.recoBucket = item.recommendation?.bucket || 'explore';
      figure.dataset.recoRank = item.recommendation?.rank || index + 1;
      figure.dataset.recoSurface = 'home-inspo';
      figure.style.cursor = 'pointer';
      figure.onclick = () => { track('open', item,{surface:'home-inspo'}); location.href = inspoHref(item); };
    });
  }

  function refreshInspo() {
    const grid = document.getElementById('personal-inspo-grid');
    if (!grid) return;
    const items = recommendInspo(4,'inspo-personal');
    if (!items.length) return;
    grid.innerHTML = items.map(renderTasteCard).join('');
    const profile = buildProfile();
    const heading = document.querySelector('[data-personal-inspo-heading]');
    const copy = document.querySelector('[data-personal-inspo-copy]');
    if (heading) heading.textContent = profile.established ? 'Your direction, with room to move.' : 'A strong place to start.';
    if (copy) copy.textContent = profile.established ? 'Familiar enough to feel right. Different enough to keep the choice open.' : 'Four different directions to make the first choice easier.';
    armRecommendationVisibility(grid);
  }

  function refreshSaved() {
    const grid = document.getElementById('taste-recommendations');
    if (!grid) return;
    const items = recommendMixed(4,'saved-recommendations');
    if (!items.length) return;
    grid.innerHTML = items.map(renderTasteCard).join('');
    const profile = buildProfile();
    const title = document.querySelector('[data-recommendation-title]');
    const copy = document.querySelector('[data-recommendation-copy]');
    if (title) title.textContent = profile.established ? 'More in your orbit.' : 'A few worth keeping.';
    if (copy) copy.textContent = profile.established ? 'Some close to what you keep. One or two there to move the taste somewhere new.' : 'A varied starting point across different finishes, structures and moods.';
    armRecommendationVisibility(grid);
  }

  function refreshWorkNudge() {
    if (!document.body.classList.contains('aura-work-page')) return;
    const items = recommendInspo(3,'work-inspo-nudge');
    document.querySelectorAll('.page-section.alt .reference-shot').forEach((figure,index) => {
      const item = items[index]; if (!item) return;
      const img = figure.querySelector('img');
      if (img) { img.src = item.img; img.alt = item.style; }
      figure.dataset.luneReco = `inspo:${item.id}`;
      figure.dataset.recoBucket = item.recommendation?.bucket || 'explore';
      figure.dataset.recoRank = item.recommendation?.rank || index + 1;
      figure.dataset.recoSurface = 'work-inspo-nudge';
      figure.style.cursor = 'pointer';
      figure.onclick = () => { track('open', item,{surface:'work-inspo-nudge'}); location.href = inspoHref(item); };
    });
  }

  function refreshSurfaces() {
    if (typeof document === 'undefined') return;
    refreshHome(); refreshInspo(); refreshSaved(); refreshWorkNudge();
    armRecommendationVisibility(document);
  }

  const seenVisibility = new Set();
  let recoObserver = null;
  function armRecommendationVisibility(scope) {
    if (typeof IntersectionObserver === 'undefined') return;
    if (!recoObserver) {
      recoObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.intersectionRatio < .55) return;
          const el = entry.target;
          const key = el.dataset.luneReco;
          const surface = el.dataset.recoSurface || currentSurface();
          if (!key || seenVisibility.has(key + ':' + surface)) return;
          seenVisibility.add(key + ':' + surface);
          const [kind,id] = key.split(':');
          const item = findItem(kind,id);
          if (item) {
            markShown(item, surface, el.dataset.recoBucket || 'explore', Number(el.dataset.recoRank || 1));
            track('impression', item, { source:'recommendation', surface });
          }
          recoObserver.unobserve(el);
        });
      }, { threshold:[.55] });
    }
    scope.querySelectorAll?.('[data-lune-reco]').forEach(el => recoObserver.observe(el));
  }

  function armOrganicDwell() {
    if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const timers = new WeakMap();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const el = entry.target;
        const data = resolveElementItem(el);
        if (!data.item) return;
        if (entry.isIntersecting && entry.intersectionRatio >= .6) {
          if (!timers.has(el)) {
            const started = Date.now();
            const timer = setTimeout(() => {
              track('dwell', data.item, { source:'organic', dwellMs:Date.now()-started });
              timers.delete(el);
            }, 3200);
            timers.set(el,{ timer, started });
            track('view', data.item,{source:'organic'});
          }
        } else if (timers.has(el)) {
          clearTimeout(timers.get(el).timer); timers.delete(el);
        }
      });
    }, { threshold:[.6] });
    const attach = () => {
      document.querySelectorAll('.gallery-card[data-id], .inspo-card[data-inspo-id]').forEach(el => {
        if (el.dataset.tasteObserved) return;
        el.dataset.tasteObserved = '1'; observer.observe(el);
      });
    };
    attach();
    new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});
  }

  function resolveElementItem(el) {
    const gallery = el.closest?.('.gallery-card[data-id]');
    if (gallery) return { item:findItem('work',gallery.dataset.id), kind:'work' };
    const inspo = el.closest?.('.inspo-card[data-inspo-id]');
    if (inspo) return { item:findItem('inspo',inspo.dataset.inspoId), kind:'inspo' };
    const reco = el.closest?.('[data-lune-reco]');
    if (reco) { const [kind,id] = reco.dataset.luneReco.split(':'); return { item:findItem(kind,id), kind }; }
    return { item:null, kind:null };
  }

  function bindDelegatedActions() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', event => {
      const save = event.target.closest('[data-taste-save]');
      if (save) {
        event.preventDefault(); const [kind,id] = save.dataset.tasteSave.split(':'); saveItem(findItem(kind,id)); return;
      }
      const share = event.target.closest('[data-taste-share]');
      if (share) {
        event.preventDefault(); const [kind,id] = share.dataset.tasteShare.split(':'); shareItem(findItem(kind,id)); return;
      }
      const dislike = event.target.closest('[data-taste-dislike]');
      if (dislike) {
        event.preventDefault(); const [kind,id] = dislike.dataset.tasteDislike.split(':'); const item = findItem(kind,id); if (item) { track('dislike',item,{source:'recommendation'}); dislike.closest('.taste-card')?.remove(); scheduleRefresh(); } return;
      }
      const open = event.target.closest('[data-taste-open]');
      if (open) { const card = open.closest('[data-lune-reco]'); if (card) { const [kind,id] = card.dataset.luneReco.split(':'); const item = findItem(kind,id); if (item) track('open',item,{source:'recommendation'}); } }
      const gallery = event.target.closest('.gallery-card[data-id]');
      if (gallery && event.target.closest('.card-image-wrap')) { const item=findItem('work',gallery.dataset.id); if (item) track('open',item,{source:'work-grid'}); }
      const inspo = event.target.closest('.inspo-card[data-inspo-id]');
      if (inspo) { const item=findItem('inspo',inspo.dataset.inspoId); if (item) track('open',item,{source:'inspo-library'}); }
    }, true);
  }

  function wrapLegacyActions() {
    const wrap = (name, handler) => {
      const fn = root[name];
      if (typeof fn !== 'function' || fn.__luneWrapped) return;
      const wrapped = function (...args) { handler(args); return fn.apply(this,args); };
      wrapped.__luneWrapped = true; root[name] = wrapped;
    };
    wrap('toggleLike', ([id]) => {
      const item=findItem('work',id); if (!item) return;
      const adding=!getSavedWorkIds().includes(id); track(adding?'save':'unsave',item,{source:'work-heart'});
    });
    wrap('shareSet', ([id]) => { const item=findItem('work',id); if(item) track('share',item,{source:'work-share'}); });
    wrap('triggerDepositBooking', ([id]) => { const item=findItem('work',id); if(item) track('book',item,{source:'deposit'}); });
    wrap('openLightbox', ([id]) => { const item=findItem('work',id); if(item) track('open',item,{source:'lightbox'}); });
  }

  function recordDeepLinkOpen() {
    if (typeof location === 'undefined') return;
    const params = new URLSearchParams(location.search);
    const setId = params.get('set');
    const look = params.get('look');
    if (setId) { const item=findItem('work',setId); if(item) track('open',item,{source:params.get('ref') || params.get('source') || 'deep-link'}); }
    if (look) {
      const id = look.match(/^(inspo_\d+)/)?.[1];
      if (id) { const item=findItem('inspo',id); if(item) track('open',item,{source:params.get('ref') || params.get('source') || 'deep-link'}); }
    }
  }

  let persistenceAdapter = null;
  async function flush() {
    if (!persistenceAdapter || typeof persistenceAdapter.send !== 'function') return { sent:0, pending:read(KEYS.outbox,[]).length };
    const batch = read(KEYS.outbox, []).slice(0,100);
    if (!batch.length) return { sent:0, pending:0 };
    await persistenceAdapter.send(batch,{ visitorId, sessionId });
    const ids = new Set(batch.map(x => x.id));
    const remaining = read(KEYS.outbox, []).filter(x => !ids.has(x.id));
    write(KEYS.outbox, remaining);
    return { sent:batch.length, pending:remaining.length };
  }
  function setPersistenceAdapter(adapter) { persistenceAdapter = adapter; return flush(); }

  function snapshot() {
    const profile = buildProfile();
    return {
      visitorId, sessionId, established:profile.established, strength:profile.strength,
      topPreferences:profile.ordered.filter(([,v]) => v > 0).slice(0,12),
      negativePreferences:profile.ordered.filter(([,v]) => v < 0).slice(0,8),
      events:read(KEYS.events,[]).length,
      recommendationHistory:history().length,
      outbox:read(KEYS.outbox,[]).length
    };
  }

  function boot() {
    wrapLegacyActions();
    setTimeout(wrapLegacyActions,250);
    setTimeout(wrapLegacyActions,900);
    bindDelegatedActions();
    armOrganicDwell();
    recordDeepLinkOpen();
    setTimeout(refreshSurfaces,120);
    root.addEventListener?.('aura:taste-changed', scheduleRefresh);
    root.addEventListener?.('lune:taste-changed', scheduleRefresh);
    root.addEventListener?.('storage', event => { if ([KEYS.workSaved,KEYS.inspoSaved,KEYS.events].includes(event.key)) scheduleRefresh(); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
  }

  return {
    version:'5.0.0', visitorId, sessionId,
    track, recommendWork, recommendInspo, recommendMixed, buildProfile, features,
    saveItem, shareItem, snapshot, flush, setPersistenceAdapter,
    catalogs:{ work:workCatalog, inspo:inspoCatalog },
    _test:{ affinity, noveltyToProfile, repetitionPenalty, recommend }
  };
});