(() => {
  'use strict';

  const html = document.documentElement;
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once:true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  html.classList.add('motion-ready');

  if (document.querySelector('.v2-lightbox')) {
    const dialogStyles = document.createElement('link');
    dialogStyles.rel = 'stylesheet';
    dialogStyles.href = 'dialogs-v2.css?v=20260908a';
    document.head.appendChild(dialogStyles);
  }

  const transition = document.createElement('div');
  transition.className = 'page-transition';
  transition.setAttribute('aria-hidden', 'true');
  document.body.appendChild(transition);

  const ready = () => requestAnimationFrame(() => html.classList.add('is-loaded'));
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 420))]).then(ready);
  else setTimeout(ready, 80);

  window.addEventListener('pageshow', () => {
    html.classList.remove('is-leaving');
    requestAnimationFrame(() => html.classList.add('is-loaded'));
  });

  const header = document.querySelector('.site-header');
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive:true });

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold:.12, rootMargin:'0px 0px -7% 0px' });

  function observeReveal(root = document) {
    const nodes = [...root.querySelectorAll('[data-reveal], .aura-work-page .gallery-card:not([data-motion]), .aura-inspo-page .inspo-card:not([data-motion])')];
    nodes.forEach((element, index) => {
      if (element.dataset.motion === '1') return;
      element.dataset.motion = '1';
      if (!element.style.getPropertyValue('--delay')) element.style.setProperty('--delay', `${Math.min(index % 6, 5) * 55}ms`);
      if (reduced) element.classList.add('is-visible');
      else revealObserver.observe(element);
    });
  }

  observeReveal();
  const mutation = new MutationObserver(mutations => {
    if (mutations.some(item => item.addedNodes.length)) observeReveal();
  });
  mutation.observe(document.body, { childList:true, subtree:true });

  function applyWorkFocus() {
    if (!document.body.classList.contains('aura-work-page')) return;
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
      input.dispatchEvent(new Event('input', { bubbles:true }));
      setTimeout(() => document.getElementById('gallery-grid')?.scrollIntoView({ behavior:reduced ? 'auto' : 'smooth', block:'start' }), 120);
    };
    setTimeout(apply, 120);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyWorkFocus, { once:true });
  else applyWorkFocus();

  function markMedia(root = document) {
    root.querySelectorAll?.('img:not([data-motion-media])').forEach(img => {
      img.dataset.motionMedia = '1';
      if (img.complete) img.classList.add('is-loaded-media');
      else img.addEventListener('load', () => img.classList.add('is-loaded-media'), { once:true });
    });
  }
  markMedia();
  new MutationObserver(() => markMedia()).observe(document.body, { childList:true, subtree:true });

  function openWorkLightbox(card) {
    const dialog = document.getElementById('work-lightbox');
    if (!dialog || !card) return;
    const source = card.querySelector('.card-image-wrap img');
    const title = card.querySelector('.card-title')?.textContent?.trim() || 'Lune set';
    const style = card.querySelector('.card-style-sub')?.textContent?.trim() || 'Finished Lune work';
    const image = dialog.querySelector('.v2-lightbox-media img');
    if (image && source) { image.src = source.src; image.alt = source.alt || title; }
    const heading = dialog.querySelector('.v2-lightbox-copy h2');
    const paragraph = dialog.querySelector('.v2-lightbox-copy p');
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = style;
    dialog.dataset.setId = card.dataset.id || '';
    dialog.dataset.priceKes = card.dataset.priceKes || '';
    dialog.dispatchEvent(new CustomEvent('lune:dialog-item',{bubbles:true,detail:{kind:'work',id:dialog.dataset.setId}}));
    if (!dialog.open) dialog.showModal();
  }

  document.querySelectorAll('.v2-lightbox').forEach(dialog => {
    dialog.querySelector('.v2-lightbox-close')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });

  document.addEventListener('click', event => {
    const workTarget = event.target.closest('.aura-work-page .card-image-wrap, .aura-work-page [data-open-work-preview]');
    if (!workTarget) return;
    event.preventDefault();
    event.stopPropagation();
    openWorkLightbox(workTarget.closest('.gallery-card'));
  }, true);

  if (!reduced && window.matchMedia('(pointer:fine)').matches) {
    let ticking = false;
    const drift = () => {
      const vh = window.innerHeight;
      document.querySelectorAll('[data-drift]').forEach(element => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;
        const center = rect.top + rect.height / 2;
        const amount = ((center - vh / 2) / vh) * -16;
        element.style.transform = `translate3d(0, ${amount.toFixed(2)}px, 0)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(drift);
    }, { passive:true });
    drift();
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return;
    event.preventDefault();
    html.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, reduced ? 0 : 420);
  });

  function loadScript(src, marker, value='1') {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(marker,value);
    document.body.appendChild(script);
  }

  loadScript('lune-data.js?v=20260908a','data-lune-data');
  loadScript('taste-engine-v5.js?v=20260908a','data-lune-taste-engine','5');
  loadScript('discovery-experience.js?v=20260908a','data-lune-discovery');
  loadScript('booking-links.js?v=20260908a','data-lune-booking-links');
  loadScript('membership-experience.js?v=20260908a','data-lune-membership');
})();
