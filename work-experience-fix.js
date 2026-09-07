(() => {
  const KEY = 'auranails_liked';
  const ids = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const syncHearts = () => {
    const saved = new Set(ids());
    document.querySelectorAll('.gallery-card').forEach(card => {
      const id = card.dataset.id;
      const button = card.querySelector('button[onclick*="toggleLike"]');
      if (!id || !button) return;
      const on = saved.has(id);
      button.classList.toggle('is-saved', on);
      button.title = on ? 'Saved' : 'Save';
      button.setAttribute('aria-label', on ? 'Remove from saved' : 'Save this set');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-solid', on);
        icon.classList.toggle('fa-regular', !on);
        icon.style.color = on ? 'var(--lacquer, #8f3f52)' : '';
      }
    });
  };

  if (typeof window.toggleLike === 'function') {
    const baseToggle = window.toggleLike;
    window.toggleLike = id => {
      baseToggle(id);
      requestAnimationFrame(syncHearts);
    };
  }

  function keepSearchAlive() {
    const grid = document.getElementById('gallery-grid');
    if (!grid || grid.querySelector('.gallery-card') || grid.querySelector('[data-search-fallback]')) return;
    if (!/No sets found/i.test(grid.textContent)) return;
    const sets = Array.isArray(window.__allSetsRef) ? window.__allSetsRef : [];
    if (!sets.length) return;
    const fallback = [...sets].sort((a,b) => Number(b.likes || 0) - Number(a.likes || 0)).slice(0,4);
    const section = document.createElement('div');
    section.dataset.searchFallback = '1';
    section.style.cssText = 'grid-column:1/-1;margin-top:18px;text-align:left;';
    section.innerHTML = `<div class="eyebrow" style="margin-bottom:16px">CLOSEST DIRECTIONS</div><div class="taste-grid">${fallback.map(set => `<article class="taste-card"><figure><a href="work.html?set=${encodeURIComponent(set.id)}"><img src="${set.imageUrl}" alt="${set.title}" loading="lazy"></a></figure><div class="taste-copy"><small>${set.category}</small><h3>${set.title}</h3><p>${set.style}</p><div class="card-actions"><a class="quiet-action" href="work.html?set=${encodeURIComponent(set.id)}">Open</a><button class="quiet-action" type="button" onclick="shareSet('${set.id}')">Share</button></div></div></article>`).join('')}</div><div class="card-actions" style="margin-top:22px"><a class="quiet-action" href="work.html">All work</a><a class="quiet-action" href="inspo.html">See inspo</a><a class="quiet-action" href="favorites.html">Open saved</a></div>`;
    grid.appendChild(section);
  }

  const observer = new MutationObserver(() => { syncHearts(); keepSearchAlive(); });
  const boot = () => {
    syncHearts(); keepSearchAlive();
    const grid = document.getElementById('gallery-grid');
    if (grid) observer.observe(grid, { childList:true, subtree:true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
