/* Aura Nails Hub — quiet functional enhancements only. */
(function () {
  function initNailOfTheWeek() {
    const getSaved = () => {
      try { return JSON.parse(localStorage.getItem('aura-notw') || 'null'); }
      catch (_) { return null; }
    };

    function apply(data) {
      if (!data || !data.title) return;
      const title = document.getElementById('notw-title');
      const cat = document.getElementById('notw-cat');
      if (title) title.textContent = data.title;
      if (cat) cat.textContent = data.category || '';
    }

    apply(getSaved());

    const view = document.querySelector('.notw-cta');
    if (view) {
      view.addEventListener('click', e => {
        e.preventDefault();
        const current = getSaved();
        const setId = current?.setId || view.dataset.setId;
        const portfolio = document.getElementById('services-portfolio');
        if (portfolio) portfolio.scrollIntoView({ behavior: 'smooth' });
        if (setId && window.openLightbox) setTimeout(() => window.openLightbox(setId), 280);
        else if (current?.category && window.filterGalleryByCategory) window.filterGalleryByCategory(current.category);
      });
    }

    const save = document.getElementById('notw-save-btn');
    if (save) {
      save.addEventListener('click', () => {
        const useUpload = document.getElementById('notw-checkbox')?.checked;
        const customTitle = document.getElementById('notw-custom-title')?.value.trim();
        const customCat = document.getElementById('notw-custom-cat')?.value.trim();
        const title = useUpload ? (document.getElementById('set-title')?.value.trim() || customTitle) : customTitle;
        const category = useUpload ? (document.getElementById('set-category')?.value || customCat) : customCat;
        if (!title) return;

        let setId = null;
        if (window.__allSetsRef) {
          const match = window.__allSetsRef.find(s => s.title.toLowerCase() === title.toLowerCase());
          if (match) setId = match.id;
        }
        const data = { title, category, updatedAt: new Date().toISOString(), ...(setId ? { setId } : {}) };
        localStorage.setItem('aura-notw', JSON.stringify(data));
        apply(data);
        if (view && setId) view.dataset.setId = setId;
      });
    }
  }

  function initAvailability() {
    const book = document.querySelector('.btn-book-nav');
    if (!book || document.getElementById('avail-badge')) return;
    const badge = document.createElement('span');
    badge.id = 'avail-badge';
    badge.textContent = 'Embu · by appointment';
    book.parentElement.insertBefore(badge, book);
  }

  function initGalleryReveal() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.gallery-card:not([data-reveal-ready])').forEach(card => {
        card.dataset.revealReady = 'true';
        card.classList.add('reveal-on-scroll');
        requestAnimationFrame(() => card.classList.add('revealed'));
      });
    });
    const gallery = document.getElementById('gallery-grid');
    if (gallery) observer.observe(gallery, { childList: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNailOfTheWeek();
    initAvailability();
    initGalleryReveal();
  });
})();
