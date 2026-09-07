(() => {
  const html = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  html.classList.add('motion-ready');

  const transition = document.createElement('div');
  transition.className = 'page-transition';
  transition.setAttribute('aria-hidden', 'true');
  document.body.appendChild(transition);

  const ready = () => requestAnimationFrame(() => html.classList.add('is-loaded'));
  if (document.fonts?.ready) {
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 420))]).then(ready);
  } else {
    setTimeout(ready, 80);
  }

  window.addEventListener('pageshow', () => {
    html.classList.remove('is-leaving');
    requestAnimationFrame(() => html.classList.add('is-loaded'));
  });

  const header = document.querySelector('.site-header');
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  function observeReveal(root = document) {
    const nodes = [...root.querySelectorAll('[data-reveal], .aura-work-page .gallery-card:not([data-motion]), .aura-reference-page .inspo-card:not([data-motion])')];
    if (!nodes.length) return;

    nodes.forEach((el, index) => {
      if (el.dataset.motion === '1') return;
      el.dataset.motion = '1';
      el.style.setProperty('--delay', `${Math.min(index % 6, 5) * 55}ms`);
      if (reduced) {
        el.classList.add('is-visible');
        return;
      }
      revealObserver.observe(el);
    });
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });

  observeReveal();

  const mutation = new MutationObserver(mutations => {
    let changed = false;
    mutations.forEach(m => { if (m.addedNodes.length) changed = true; });
    if (!changed) return;
    polishDynamicWork();
    observeReveal();
  });
  mutation.observe(document.body, { childList: true, subtree: true });

  function polishDynamicWork() {
    document.querySelectorAll('.aura-work-page .gallery-card').forEach(card => {
      if (card.dataset.v2Polished === '1') return;
      card.dataset.v2Polished = '1';

      const wa = card.querySelector('.card-footer-btns a[href*="wa.me"]');
      const button = card.querySelector('.btn-book-look');
      if (button && wa) {
        button.innerHTML = 'Book this look <span aria-hidden="true">↗</span>';
        button.onclick = e => {
          e.preventDefault();
          window.open(wa.href, '_blank', 'noopener');
        };
      }

      [...card.querySelectorAll('.card-content > div')].forEach(el => {
        if (/30% Deposit/i.test(el.textContent)) el.remove();
      });
    });
  }
  polishDynamicWork();

  function updateObsession() {
    const title = document.getElementById('obsession-title');
    const cat = document.getElementById('obsession-category');
    if (!title) return;
    try {
      const data = JSON.parse(localStorage.getItem('aura-notw') || 'null');
      if (data?.title) title.textContent = data.title;
      if (cat && data?.category) cat.textContent = data.category;
    } catch (_) {}
  }
  updateObsession();

  document.querySelectorAll('img').forEach(img => {
    if (img.complete) img.classList.add('is-loaded-media');
    else img.addEventListener('load', () => img.classList.add('is-loaded-media'), { once: true });
  });

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
