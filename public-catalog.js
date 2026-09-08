(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => `KSh ${Number(value || 0).toLocaleString('en-KE')}`;

  let work = [];
  let inspo = [];
  let category = 'all';
  let query = '';

  function normalizeWork(row) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category || '',
      style: row.style || '',
      description: row.description || '',
      imageUrl: row.image_url || row.imageUrl || '',
      price: Number(row.price_kes ?? row.priceKes ?? row.price ?? 0),
      priceKes: Number(row.price_kes ?? row.priceKes ?? row.price ?? 0),
      tags: Array.isArray(row.tags) ? row.tags : [],
      likes: Number(row.popularity_score ?? row.likes ?? 0),
      serviceCode: row.service_code || row.serviceCode || null,
      kind: 'work'
    };
  }

  function normalizeInspo(row) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title || row.style,
      style: row.title || row.style,
      category: row.category || '',
      img: row.image_url || row.imageUrl || row.img || '',
      imageUrl: row.image_url || row.imageUrl || row.img || '',
      shape: row.shape || null,
      length: row.length || null,
      finish: row.finish || null,
      palette: row.palette || null,
      structure: row.structure || null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      curatedScore: Number(row.editorial_score ?? row.curatedScore ?? 0.5),
      serviceCode: row.service_code || row.serviceCode || null,
      kind: 'inspo'
    };
  }

  async function api(path) {
    const response = await fetch(`/api${path}`, { credentials:'same-origin' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `request_failed_${response.status}`);
    return data;
  }

  function matchesCategory(item) {
    if (category === 'all') return true;
    const selected = String(category).toLowerCase();
    const itemCategory = String(item.category || '').toLowerCase();
    if (selected === '3d') return itemCategory.includes('3d') || item.tags.some(tag => String(tag).toLowerCase().includes('3d'));
    return itemCategory.includes(selected);
  }

  function matchesQuery(item) {
    if (!query) return true;
    const haystack = [item.title, item.style, item.category, item.description, ...(item.tags || [])].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function workCard(item) {
    return `<article class="gallery-card" data-id="${esc(item.id)}">
      <div class="card-image-wrap">
        <img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" loading="lazy">
        <span class="card-badge-category">${esc(item.category)}</span>
        ${item.price ? `<span class="card-badge-price">${money(item.price)}</span>` : ''}
        <div class="card-quick-actions">
          <button class="action-circle-btn" type="button" title="Save" aria-label="Save this set" data-ui-save-work="${esc(item.id)}">♡</button>
          <button class="action-circle-btn" type="button" title="Share" aria-label="Share this set" data-ui-share-work="${esc(item.id)}">↗</button>
        </div>
      </div>
      <div class="card-content">
        <h3 class="card-title">${esc(item.title)}</h3>
        <p class="card-style-sub">${esc(item.style)}</p>
        <div class="card-tags-list">${(item.tags || []).slice(0,5).map(tag => `<span class="tag-pill">#${esc(tag)}</span>`).join('')}</div>
        <div class="card-footer-btns"></div>
      </div>
    </article>`;
  }

  function renderWork() {
    const grid = $('#gallery-grid');
    if (!grid) return;
    const filtered = work.filter(item => matchesCategory(item) && matchesQuery(item));
    if (!filtered.length) {
      grid.innerHTML = '<div class="saved-empty" style="grid-column:1/-1"><strong>No sets found.</strong><span>Try another finish, clear the search, or move into Inspo.</span><div class="saved-empty-actions"><button class="quiet-action" type="button" data-clear-work-search>All work</button><a class="quiet-action" href="inspo.html">See inspo</a></div></div>';
      return;
    }
    grid.innerHTML = filtered.map(workCard).join('');
  }

  function renderInspo() {
    const grid = $('#inspo-scroll');
    if (!grid) return;
    if (!inspo.length) {
      grid.innerHTML = '<div class="ops-empty">Inspo is temporarily unavailable.</div>';
      return;
    }
    grid.innerHTML = inspo.map(item => `<article class="inspo-card" data-inspo-id="${esc(item.id)}">
      <div class="inspo-img-wrap"><img src="${esc(item.img)}" alt="${esc(item.style)}" loading="lazy"></div>
      <div class="inspo-info"><span class="inspo-category">${esc(item.category || 'Inspo')}</span><strong class="inspo-style">${esc(item.style)}</strong></div>
    </article>`).join('');
  }

  function bindFilters() {
    $$('#services-filter-list [data-category]').forEach(node => node.addEventListener('click', () => {
      category = node.dataset.category || 'all';
      $$('#services-filter-list [data-category]').forEach(x => x.classList.toggle('active', x === node));
      renderWork();
    }));
    $('#gallery-search')?.addEventListener('input', event => {
      query = event.target.value.trim();
      renderWork();
    });
  }

  async function load() {
    const needsWork = Boolean($('#gallery-grid') || document.body.classList.contains('aura-favorites-page'));
    const needsInspo = Boolean($('#inspo-scroll') || document.body.classList.contains('aura-favorites-page') || document.body.classList.contains('aura-inspo-page'));
    try {
      const [workResult, inspoResult] = await Promise.all([
        needsWork ? api('/catalog/work') : Promise.resolve({items:[]}),
        needsInspo ? api('/catalog/inspo') : Promise.resolve({items:[]})
      ]);
      work = (workResult.items || []).map(normalizeWork);
      inspo = (inspoResult.items || []).map(normalizeInspo);
      if (needsWork) window.__allSetsRef = work;
      if (needsInspo) window.__luneInspoCatalog = inspo;
      renderWork();
      renderInspo();
      window.dispatchEvent(new CustomEvent('lune:catalog-ready', { detail:{ work, inspo } }));
    } catch (error) {
      const workGrid = $('#gallery-grid');
      if (workGrid) workGrid.innerHTML = '<div class="saved-empty" style="grid-column:1/-1"><strong>Work is temporarily unavailable.</strong><span>Your saved direction is safe. Try again shortly.</span><div class="saved-empty-actions"><a class="quiet-action" href="inspo.html">See inspo</a></div></div>';
      const inspoGrid = $('#inspo-scroll');
      if (inspoGrid) inspoGrid.innerHTML = '<div class="saved-empty"><strong>Inspo is temporarily unavailable.</strong><span>Try again shortly.</span></div>';
      window.dispatchEvent(new CustomEvent('lune:catalog-error', { detail:{ message:error.message } }));
    }
  }

  bindFilters();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();
