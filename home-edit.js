(() => {
  'use strict';

  const hash = value => [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
  const dayNumber = () => Math.floor(Date.now() / 86400000);
  const monthKey = () => new Date().toISOString().slice(0, 7);
  const pick = (items, key, excludedId = '') => {
    const choices = items.filter(item => item.id !== excludedId);
    return choices.length ? choices[hash(key) % choices.length] : items[0];
  };

  async function loadEdit() {
    const label = document.querySelector('#home-edit-label');
    const title = document.querySelector('#obsession-title');
    const category = document.querySelector('#obsession-category');
    const link = document.querySelector('[data-obsession-link]');
    if (!label || !title || !category || !link) return;
    try {
      const response = await fetch('/api/catalog/work', { credentials:'same-origin' });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.items) || !payload.items.length) return;
      const items = payload.items;
      const isMonthlySet = Math.floor(dayNumber() / 3) % 2 === 1;
      const item = isMonthlySet ? pick(items, `month:${monthKey()}`) : pick(items, `obsession:${Math.floor(dayNumber() / 3)}`);
      label.textContent = isMonthlySet ? 'SET OF THE MONTH' : 'CURRENT OBSESSION';
      title.textContent = item.title || 'Lune set';
      category.textContent = item.style || item.category || 'Finished work';
      link.href = `work.html?set=${encodeURIComponent(item.id)}`;
      link.innerHTML = isMonthlySet ? 'See the monthly set <span class="arrow">→</span>' : 'See the set <span class="arrow">→</span>';
    } catch (_) {
      // The thoughtful static fallback remains visible while the catalogue is unavailable.
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadEdit, { once:true });
  else loadEdit();
})();
