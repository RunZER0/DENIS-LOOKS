(() => {
  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const tokens = value => [...new Set(normalize(value).split(/\s+/).filter(token => token.length > 1))];

  function score(item, focus) {
    const wanted = tokens(focus);
    if (!wanted.length || !item) return 0;
    const haystack = normalize([
      item.title,
      item.style,
      item.category,
      item.description,
      ...(item.tags || [])
    ].filter(Boolean).join(' '));
    return wanted.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
  }

  function makeKeyboardReachable() {
    document.querySelectorAll('.lune-work-page .service-list-item[data-category]').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-pressed', item.classList.contains('active') ? 'true' : 'false');
    });
    document.querySelectorAll('.lune-work-page .card-image-wrap').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      if (!item.getAttribute('aria-label')) {
        const title = item.closest('.gallery-card')?.querySelector('.card-title')?.textContent?.trim() || 'Lune set';
        item.setAttribute('aria-label', `Open ${title}`);
      }
    });
    document.querySelectorAll('.lune-inspo-page #inspo-scroll .inspo-card').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      if (!item.getAttribute('aria-label')) {
        const title = item.querySelector('.inspo-style')?.textContent?.trim() || 'Lune inspiration';
        item.setAttribute('aria-label', `Open ${title}`);
      }
    });
  }

  function resultStatus() {
    if (!document.body.classList.contains('lune-work-page')) return;
    const controls = document.querySelector('.gallery-controls');
    if (!controls) return;
    let status = document.querySelector('[data-lune-results-status]');
    if (!status) {
      status = document.createElement('div');
      status.className = 'lune-sr-only';
      status.dataset.luneResultsStatus = '1';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      controls.after(status);
    }
    const count = document.querySelectorAll('#gallery-grid .gallery-card').length;
    status.textContent = `${count} ${count === 1 ? 'set' : 'sets'} shown.`;
  }

  function syncWorkInspoLinks() {
    if (!document.body.classList.contains('lune-work-page')) return;
    const input = document.getElementById('gallery-search');
    if (!input) return;

    const update = () => {
      const focus = input.value.trim();
      document.querySelectorAll('a[href]').forEach(anchor => {
        const raw = anchor.getAttribute('href');
        if (!raw) return;
        let url;
        try { url = new URL(raw, location.href); } catch (_) { return; }
        if (url.origin !== location.origin || !url.pathname.endsWith('/inspo.html')) return;
        if (focus) url.searchParams.set('focus', focus);
        else url.searchParams.delete('focus');
        anchor.href = `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
      });
    };

    if (input.dataset.luneFlow !== '1') {
      input.dataset.luneFlow = '1';
      input.addEventListener('input', update);
    }
    update();
  }

  function contextNote(container, focus, copy) {
    if (!container || !focus) return;
    let note = container.parentElement?.querySelector(':scope > .lune-context-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'lune-context-note';
      container.before(note);
    }
    note.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = focus;
    note.append(copy.before, strong, copy.after);
  }

  function workContext() {
    if (!document.body.classList.contains('lune-work-page')) return;
    const focus = new URLSearchParams(location.search).get('focus')?.trim();
    if (!focus) return;
    const controls = document.querySelector('.gallery-controls');
    contextNote(controls, focus, { before: 'Still thinking about ', after: '? The work below stays close to that direction.' });
  }

  function inspoContext() {
    if (!document.body.classList.contains('lune-inspo-page')) return;
    const focus = new URLSearchParams(location.search).get('focus')?.trim();
    const container = document.getElementById('inspo-scroll');
    if (!focus || !container || !window.LuneCatalog?.inspo) return;

    const rank = new Map(window.LuneCatalog.inspo.map(item => [item.id, score(item, focus)]));
    [...container.querySelectorAll('.inspo-card')]
      .sort((a, b) => (rank.get(b.dataset.inspoId) || 0) - (rank.get(a.dataset.inspoId) || 0))
      .forEach(card => container.appendChild(card));

    contextNote(container, focus, { before: 'You came in around ', after: '. These directions keep that thread without making every option look the same.' });
  }

  function relatedWorkLink(event) {
    const link = event.target.closest('[data-dialog-book]');
    if (!link) return;
    const dialog = link.closest('#inspo-dialog');
    const item = window.LuneCatalog?.inspo?.find(entry => entry.id === dialog?.dataset.inspoId);
    if (!item) return;
    const focus = item.tags?.find(tag => String(tag).trim().length > 1) || item.category || item.style;
    const url = new URL('work.html', location.href);
    url.searchParams.set('focus', focus);
    link.href = `${url.pathname.split('/').pop()}${url.search}`;
  }

  function syncPressedState() {
    document.querySelectorAll('.lune-work-page .service-list-item[data-category]').forEach(item => {
      item.setAttribute('aria-pressed', item.classList.contains('active') ? 'true' : 'false');
    });
  }

  function sync() {
    makeKeyboardReachable();
    syncPressedState();
    resultStatus();
    syncWorkInspoLinks();
    workContext();
    inspoContext();
  }

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest(
      '.lune-work-page .service-list-item[data-category], .lune-work-page .card-image-wrap, .lune-inspo-page #inspo-scroll .inspo-card'
    );
    if (!target) return;
    event.preventDefault();
    target.click();
  });

  document.addEventListener('click', event => {
    relatedWorkLink(event);
    queueMicrotask(syncPressedState);
  }, true);

  window.addEventListener('lune:catalog-rendered', sync);
  window.addEventListener('lune:taste-changed', sync);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();
})();
