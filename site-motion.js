(() => {
  const html = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  html.classList.add('motion-ready');

  if (document.querySelector('.v2-lightbox')) {
    const dialogStyles = document.createElement('link');
    dialogStyles.rel = 'stylesheet';
    dialogStyles.href = 'dialogs-v2.css?v=20260907b';
    document.head.appendChild(dialogStyles);
  }

  const transition = document.createElement('div');
  transition.className = 'page-transition';
  transition.setAttribute('aria-hidden', 'true');
  document.body.appendChild(transition);

  const ready = () => requestAnimationFrame(() => html.classList.add('is-loaded'));
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 420))]).then(ready);
  else setTimeout(ready, 80);

  window.addEventListener('pageshow', () => {
    html.classList.remove('is-leaving');
    requestAnimationFrame(() => html.classList.add('is-loaded'));
  });

  const header = document.querySelector('.site-header');
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });

  function observeReveal(root = document) {
    const nodes = [...root.querySelectorAll('[data-reveal], .lune-work-page .gallery-card:not([data-motion]), .lune-inspo-page .inspo-card:not([data-motion])')];
    nodes.forEach((el, index) => {
      if (el.dataset.motion === '1') return;
      el.dataset.motion = '1';
      if (!el.style.getPropertyValue('--delay')) el.style.setProperty('--delay', `${Math.min(index % 6, 5) * 55}ms`);
      if (reduced) el.classList.add('is-visible');
      else revealObserver.observe(el);
    });
  }

  function polishDynamicWork() {
    document.querySelectorAll('.lune-work-page .gallery-card').forEach(card => {
      if (card.dataset.luneMotion === '1') return;
      card.dataset.luneMotion = '1';
      [...card.querySelectorAll('.card-content > div')].forEach(el => {
        if (/30% Deposit/i.test(el.textContent)) el.remove();
      });
    });
  }

  observeReveal();
  polishDynamicWork();

  const mutation = new MutationObserver(mutations => {
    if (!mutations.some(m => m.addedNodes.length)) return;
    polishDynamicWork();
    observeReveal();
  });
  mutation.observe(document.body, { childList: true, subtree: true });

  function updateObsession() {
    const title = document.getElementById('obsession-title');
    const cat = document.getElementById('obsession-category');
    const link = document.querySelector('.obsession a[href]');
    if (!title) return;
    try {
      const current = localStorage.getItem('lune-current-edit');
      const legacy = localStorage.getItem('aura-notw');
      const data = JSON.parse(current || legacy || 'null');
      if (data?.title) title.textContent = data.title;
      if (cat && data?.category) cat.textContent = data.category;
      if (!current && data) localStorage.setItem('lune-current-edit', JSON.stringify(data));
    } catch (_) {}
    if (link) link.href = `work.html?focus=${encodeURIComponent(title.textContent.trim())}`;
  }
  updateObsession();

  function applyWorkFocus() {
    if (!document.body.classList.contains('lune-work-page')) return;
    const focus = new URLSearchParams(location.search).get('focus');
    if (!focus) return;
    const input = document.getElementById('gallery-search');
    if (!input) return;

    let tries = 0;
    const apply = () => {
      tries += 1;
      const cards = [...document.querySelectorAll('.gallery-card')];
      if (!cards.length && tries < 18) return setTimeout(apply, 120);
      input.value = focus;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => document.getElementById('gallery-grid')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }), 120);
    };
    setTimeout(apply, 120);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyWorkFocus, { once: true });
  else applyWorkFocus();

  document.querySelectorAll('img').forEach(img => {
    if (img.complete) img.classList.add('is-loaded-media');
    else img.addEventListener('load', () => img.classList.add('is-loaded-media'), { once: true });
  });

  function openWorkLightbox(card) {
    const dialog = document.getElementById('work-lightbox');
    if (!dialog || !card) return;
    const source = card.querySelector('.card-image-wrap img');
    const title = card.querySelector('.card-title')?.textContent?.trim() || 'Lune set';
    const style = card.querySelector('.card-style-sub')?.textContent?.trim() || 'Nail direction';
    const image = dialog.querySelector('.v2-lightbox-media img');
    if (image && source) { image.src = source.src; image.alt = source.alt || title; }
    const heading = dialog.querySelector('.v2-lightbox-copy h2');
    const paragraph = dialog.querySelector('.v2-lightbox-copy p');
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = style;
    dialog.showModal();
  }

  document.querySelectorAll('.v2-lightbox').forEach(dialog => {
    dialog.querySelector('.v2-lightbox-close')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => {
      const rect = dialog.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      if (outside) dialog.close();
    });
  });

  document.addEventListener('click', e => {
    const workImage = e.target.closest('.lune-work-page .card-image-wrap');
    if (!workImage) return;
    e.preventDefault();
    e.stopPropagation();
    openWorkLightbox(workImage.closest('.gallery-card'));
  }, true);

  if (!reduced && window.matchMedia('(pointer:fine)').matches) {
    let ticking = false;
    const driftEls = [...document.querySelectorAll('[data-drift]')];
    const drift = () => {
      const vh = window.innerHeight;
      driftEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;
        const center = rect.top + rect.height / 2;
        const amount = ((center - vh / 2) / vh) * -16;
        el.style.transform = `translate3d(0, ${amount.toFixed(2)}px, 0)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(drift);
    }, { passive: true });
    drift();
  }

  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return;
    if (document.startViewTransition) return;

    e.preventDefault();
    html.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, reduced ? 0 : 520);
  });
})();
