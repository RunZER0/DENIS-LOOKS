(() => {
  'use strict';

  function prepareCards() {
    document.querySelectorAll('.aura-inspo-page .inspo-card[data-inspo-id]').forEach(card => {
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
      if (!card.hasAttribute('role')) card.setAttribute('role', 'button');
      const title = card.querySelector('.inspo-style')?.textContent?.trim() || 'inspiration';
      card.setAttribute('aria-label', `Preview ${title}`);

      const info = card.querySelector('.inspo-info');
      if (info && !info.querySelector('[data-inspo-preview-trigger]')) {
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.className = 'inspo-preview-link';
        preview.dataset.inspoPreviewTrigger = '';
        preview.textContent = 'Preview';
        info.appendChild(preview);
      }
    });
  }

  // Reserve is a direct action. Do not let the card-level preview handler steal it.
  window.addEventListener('click', event => {
    const reserve = event.target.closest?.('.aura-inspo-page .inspo-card [data-lune-reserve]');
    if (!reserve) return;
    const id = reserve.closest('.inspo-card')?.dataset.inspoId;
    const item = window.LuneTaste?.catalogs?.inspo?.().find?.(entry => entry.id === id);
    if (item) window.LuneTaste?.track?.('book', { ...item, kind:'inspo' }, { surface:'inspo', source:'reserve-link' });
    event.stopPropagation();
  }, true);

  document.addEventListener('keydown', event => {
    const card = event.target.closest?.('.aura-inspo-page .inspo-card[data-inspo-id]');
    if (!card || event.target.closest('a,button,input,select,textarea')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    }
  });

  window.addEventListener('lune:catalog-ready', prepareCards);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepareCards, { once:true });
  } else {
    prepareCards();
  }
  setTimeout(prepareCards, 250);
  setTimeout(prepareCards, 900);
})();
