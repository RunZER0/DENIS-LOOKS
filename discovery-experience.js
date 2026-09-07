(function (root, factory) {
  const api = factory(root || {});
  if (root && root.document) api.boot();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const CONTEXT_KEY = 'lune_discovery_context_v1';
  const TRAIL_KEY = 'lune_discovery_trail_v1';
  const MAX_TRAIL = 12;
  const MAX_CONTEXT_AGE = 14 * 86400000;
  const memory = new Map();
  const store = (() => { try { return root.localStorage || null; } catch (_) { return null; } })();

  const read = (key, fallback) => {
    try {
      const raw = store ? store.getItem(key) : memory.get(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  };
  const write = (key, value) => {
    const raw = JSON.stringify(value);
    try { if (store) store.setItem(key, raw); else memory.set(key, raw); } catch (_) { memory.set(key, raw); }
  };

  const normalize = value => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const meaningfulTokens = value => normalize(value).split(/\s+/).filter(token =>
    token.length > 2 && !['nail','nails','gel','tips','look','set','with','and','the','art','style','natural','design'].includes(token)
  );

  function overlapScore(a, b) {
    const A = new Set(meaningfulTokens(a));
    const B = new Set(meaningfulTokens(b));
    if (!A.size || !B.size) return 0;
    let hits = 0;
    A.forEach(token => { if (B.has(token)) hits += 1; });
    return hits / Math.max(A.size, B.size);
  }

  function strongestSeed(value) {
    const tokens = meaningfulTokens(value);
    return tokens[0] || normalize(value).split(/\s+/)[0] || '';
  }

  const workUrl = id => `work.html?set=${encodeURIComponent(id)}`;
  const inspoUrl = key => `inspo.html?look=${encodeURIComponent(key)}`;

  function currentPage(doc) {
    const body = doc?.body;
    if (!body) return 'unknown';
    if (body.classList.contains('aura-home-page')) return 'home';
    if (body.classList.contains('aura-work-page')) return 'work';
    if (body.classList.contains('aura-inspo-page')) return 'inspo';
    if (body.classList.contains('aura-favorites-page')) return 'saved';
    if (body.classList.contains('aura-standard-page')) return 'standard';
    return 'unknown';
  }

  function rememberTrail(page, href) {
    if (page === 'unknown') return;
    const trail = read(TRAIL_KEY, []).filter(item => item?.page !== page || item?.href !== href);
    trail.push({ page, href, ts: Date.now() });
    write(TRAIL_KEY, trail.slice(-MAX_TRAIL));
  }

  function rememberContext(context) {
    if (!context?.type || !context?.title || !context?.href) return;
    write(CONTEXT_KEY, { ...context, ts: Date.now() });
  }

  function recentContext() {
    const context = read(CONTEXT_KEY, null);
    if (!context?.ts || Date.now() - Number(context.ts) > MAX_CONTEXT_AGE) return null;
    return context;
  }

  function safeText(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function ensureStyles(doc) {
    if (doc.querySelector('link[data-discovery-css]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'discovery-experience.css?v=20260907a';
    link.dataset.discoveryCss = '1';
    doc.head.appendChild(link);
  }

  function reducedMotion() {
    try { return root.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }

  function setTargetState(node) {
    if (!node) return;
    node.classList.add('is-context-target');
    setTimeout(() => node.classList.remove('is-context-target'), 2200);
  }

  function contextFromWorkCard(card) {
    if (!card?.dataset.id) return null;
    const id = card.dataset.id;
    const title = card.querySelector('.card-title')?.textContent?.trim() || 'Saved set';
    const style = card.querySelector('.card-style-sub')?.textContent?.trim() || '';
    const image = card.querySelector('.card-image-wrap img')?.getAttribute('src') || '';
    return { type: 'work', id, title, style, image, href: workUrl(id) };
  }

  function contextFromInspoCard(card) {
    if (!card) return null;
    const id = card.dataset.inspoId || '';
    const key = card.dataset.inspoKey || id;
    const title = card.querySelector('.inspo-style, .personal-inspo-copy h3')?.textContent?.trim() || card.dataset.inspoStyle || 'Saved inspo';
    const style = card.querySelector('.inspo-category, .personal-inspo-copy small')?.textContent?.trim() || card.dataset.inspoCategory || '';
    const image = card.querySelector('img')?.getAttribute('src') || '';
    if (!key || !title) return null;
    return { type: 'inspo', id, key, title, style, image, href: inspoUrl(key) };
  }

  function addHomeContinuation(doc) {
    const context = recentContext();
    const likedCount = (() => { try { return JSON.parse(root.localStorage?.getItem('auranails_liked') || '[]').length; } catch (_) { return 0; } })();
    const inspoCount = (() => { try { return JSON.parse(root.localStorage?.getItem('aura_inspo_saved') || '[]').length; } catch (_) { return 0; } })();
    if (!context && !(likedCount + inspoCount)) return;
    if (doc.querySelector('[data-discovery-continuation]')) return;
    const anchor = doc.querySelector('.obsession') || doc.querySelector('.home-hero');
    if (!anchor) return;

    const section = doc.createElement('section');
    section.className = 'discovery-continuation';
    section.dataset.discoveryContinuation = '1';
    if (context) {
      const label = context.type === 'inspo' ? 'STILL ON YOUR MIND?' : 'PICK UP WHERE YOU LEFT IT';
      section.innerHTML = `<div class="shell discovery-continuation-inner">
        ${context.image ? `<figure><img src="${safeText(context.image)}" alt="" loading="lazy"></figure>` : ''}
        <div class="discovery-continuation-copy"><div class="eyebrow">${label}</div><strong>${safeText(context.title)}</strong>${context.style ? `<span>${safeText(context.style)}</span>` : ''}</div>
        <a class="text-link" href="${safeText(context.href)}">Keep looking <span class="arrow">→</span></a>
      </div>`;
    } else {
      const total = likedCount + inspoCount;
      section.innerHTML = `<div class="shell discovery-continuation-inner discovery-continuation-simple">
        <div class="discovery-continuation-copy"><div class="eyebrow">YOUR SHORTLIST</div><strong>${total} ${total === 1 ? 'look is' : 'looks are'} waiting.</strong></div>
        <a class="text-link" href="favorites.html">Open saved <span class="arrow">→</span></a>
      </div>`;
    }
    anchor.insertAdjacentElement('afterend', section);
  }

  function enhanceWork(doc) {
    const bind = () => {
      doc.querySelectorAll('.gallery-card').forEach(card => {
        if (card.dataset.discoveryBound === '1') return;
        card.dataset.discoveryBound = '1';
        card.querySelector('.card-image-wrap')?.addEventListener('click', () => {
          const context = contextFromWorkCard(card);
          if (context) rememberContext(context);
        }, { capture: true });
      });
    };
    bind();
    const grid = doc.getElementById('gallery-grid');
    if (grid) new MutationObserver(bind).observe(grid, { childList: true, subtree: true });

    const params = new URLSearchParams(root.location.search);
    const requested = params.get('set');
    const seed = params.get('seed') || params.get('style');
    const openRequested = (attempt = 0) => {
      const cards = [...doc.querySelectorAll('.gallery-card')];
      if (!cards.length && attempt < 24) return setTimeout(() => openRequested(attempt + 1), 120);
      if (requested) {
        const card = cards.find(node => node.dataset.id === requested);
        if (card) {
          const context = contextFromWorkCard(card);
          if (context) rememberContext(context);
          card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
          setTargetState(card);
          setTimeout(() => card.querySelector('.card-image-wrap')?.click(), reducedMotion() ? 0 : 320);
          return;
        }
      }
      if (seed) {
        const search = doc.getElementById('gallery-search');
        const token = strongestSeed(seed);
        if (search && token) {
          search.value = token;
          search.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => grid?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }), 120);
        }
      }
    };
    setTimeout(() => openRequested(), 140);

    const dialog = doc.getElementById('work-lightbox');
    if (dialog && !dialog.querySelector('[data-discovery-inspo-link]')) {
      const related = doc.createElement('a');
      related.className = 'quiet-action discovery-related-link';
      related.dataset.discoveryInspoLink = '1';
      related.href = 'inspo.html';
      related.textContent = 'See inspo in this direction →';
      dialog.querySelector('.v2-lightbox-copy')?.appendChild(related);
      new MutationObserver(() => {
        const seedValue = dialog.querySelector('p')?.textContent?.trim() || dialog.querySelector('h2')?.textContent?.trim() || '';
        related.href = `inspo.html?from=work&seed=${encodeURIComponent(seedValue)}`;
      }).observe(dialog, { childList: true, subtree: true, characterData: true });
    }
  }

  function enhanceInspo(doc) {
    const bind = () => {
      doc.querySelectorAll('.inspo-card, .personal-inspo-card').forEach(card => {
        if (card.dataset.discoveryBound === '1') return;
        card.dataset.discoveryBound = '1';
        card.addEventListener('click', event => {
          if (event.target.closest('button[data-inspo-share], button[data-share-inspo]')) return;
          const context = contextFromInspoCard(card);
          if (context) rememberContext(context);
        }, { capture: true });
      });
    };
    bind();
    const library = doc.getElementById('inspo-scroll');
    const personal = doc.getElementById('personal-inspo-grid');
    if (library) new MutationObserver(bind).observe(library, { childList: true, subtree: true });
    if (personal) new MutationObserver(bind).observe(personal, { childList: true, subtree: true });

    const seed = new URLSearchParams(root.location.search).get('seed');
    if (seed) {
      const tryFocus = (attempt = 0) => {
        const cards = [...doc.querySelectorAll('#inspo-scroll .inspo-card')];
        if (!cards.length && attempt < 24) return setTimeout(() => tryFocus(attempt + 1), 120);
        const scored = cards.map(card => {
          const label = `${card.querySelector('.inspo-style')?.textContent || ''} ${card.querySelector('.inspo-category')?.textContent || ''}`;
          return { card, score: overlapScore(seed, label) };
        }).sort((a, b) => b.score - a.score);
        const target = scored[0]?.card;
        if (target) {
          target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
          setTargetState(target);
        }
      };
      setTimeout(() => tryFocus(), 180);
    }

    const dialog = doc.getElementById('inspo-dialog');
    if (dialog && !dialog.querySelector('[data-discovery-work-link]')) {
      const related = doc.createElement('a');
      related.className = 'quiet-action discovery-related-link';
      related.dataset.discoveryWorkLink = '1';
      related.href = 'work.html';
      related.textContent = 'See finished work →';
      (dialog.querySelector('.card-actions') || dialog.querySelector('.v3-dialog-copy'))?.appendChild(related);
      new MutationObserver(() => {
        const title = dialog.querySelector('[data-dialog-title]')?.textContent?.trim() || '';
        related.href = `work.html?from=inspo&seed=${encodeURIComponent(title)}`;
      }).observe(dialog, { childList: true, subtree: true, characterData: true });
    }
  }

  function enhanceSaved(doc) {
    const empty = doc.getElementById('saved-empty');
    if (!empty) return;
    setTimeout(() => {
      const hasSaved = doc.querySelector('#saved-work-grid > *, #saved-inspo-grid > *');
      if (hasSaved) return;
      empty.hidden = false;
      if (!empty.textContent.trim()) empty.innerHTML = '<strong>Your shortlist starts with one save.</strong><span>Start with inspo when you want a direction, or Work when you already know the finish.</span>';
      if (!empty.querySelector('.saved-empty-actions')) {
        const actions = doc.createElement('div');
        actions.className = 'saved-empty-actions';
        actions.innerHTML = '<a class="quiet-action" href="inspo.html">See inspo</a><a class="quiet-action" href="work.html">See work</a>';
        empty.appendChild(actions);
      }
    }, 700);
  }

  function enhanceStandard(doc) {
    const context = recentContext();
    if (!context || doc.querySelector('[data-context-return]')) return;
    const band = doc.querySelector('.page-link-band .shell');
    if (!band) return;
    const link = doc.createElement('a');
    link.className = 'quiet-action context-return';
    link.dataset.contextReturn = '1';
    link.href = context.href;
    link.textContent = `Back to ${context.title} →`;
    band.appendChild(link);
  }

  function boot() {
    const doc = root.document;
    if (!doc) return;
    const start = () => {
      const page = currentPage(doc);
      if (page === 'unknown') return;
      ensureStyles(doc);
      rememberTrail(page, `${root.location.pathname}${root.location.search}`);
      if (page === 'home') addHomeContinuation(doc);
      if (page === 'work') enhanceWork(doc);
      if (page === 'inspo') enhanceInspo(doc);
      if (page === 'saved') enhanceSaved(doc);
      if (page === 'standard') enhanceStandard(doc);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  return { boot, normalize, meaningfulTokens, overlapScore, strongestSeed, workUrl, inspoUrl, recentContext };
});