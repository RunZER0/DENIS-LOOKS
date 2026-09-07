(() => {
  const KEYS = {
    work: 'lune_saved_work',
    inspo: 'lune_saved_inspo',
    events: 'lune_taste_events'
  };
  const MAX_EVENTS = 240;
  const HYDRATED_KEY = 'lune_stashi_hydrated_v1';
  const DIRTY_KEY = 'lune_stashi_dirty_v1';
  let hydrating = false;
  let syncTimer = null;
  let syncInFlight = null;

  const read = (key, fallback = []) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      ...options
    });
    if (!response.ok) throw new Error(`Lune API ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  function eventKey(event) {
    return JSON.stringify([
      event?.kind || '',
      event?.id || '',
      event?.action || '',
      Number(event?.weight || 0),
      Array.isArray(event?.features) ? event.features : [],
      Number(event?.ts || 0)
    ]);
  }

  function mergeEvents(localEvents, remoteEvents) {
    const map = new Map();
    [...(Array.isArray(remoteEvents) ? remoteEvents : []), ...(Array.isArray(localEvents) ? localEvents : [])]
      .forEach(event => {
        if (!event || !event.kind || !event.id || !event.action) return;
        map.set(eventKey(event), event);
      });
    return [...map.values()]
      .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0))
      .slice(-MAX_EVENTS);
  }

  function mergeInspo(localItems, remoteItems) {
    const map = new Map();
    [...(Array.isArray(remoteItems) ? remoteItems : []), ...(Array.isArray(localItems) ? localItems : [])]
      .forEach(item => {
        if (!item?.id) return;
        map.set(item.id, item);
      });
    return [...map.values()];
  }

  function hydrateCatalog(payload) {
    if (!payload || !window.LuneCatalog) return;
    const work = Array.isArray(payload.work) ? payload.work : [];
    const inspo = Array.isArray(payload.inspo) ? payload.inspo : [];
    if (work.length && Array.isArray(window.LuneCatalog.work)) {
      window.LuneCatalog.work.splice(0, window.LuneCatalog.work.length, ...work);
    }
    if (inspo.length && Array.isArray(window.LuneCatalog.inspo)) {
      window.LuneCatalog.inspo.splice(0, window.LuneCatalog.inspo.length, ...inspo);
    }
    window.dispatchEvent(new CustomEvent('lune:catalog-rendered'));
  }

  function hydrateState(payload, mergeLocal = false) {
    if (!payload) return;
    hydrating = true;
    try {
      const localWork = Array.isArray(read(KEYS.work, [])) ? read(KEYS.work, []) : [];
      const localInspo = Array.isArray(read(KEYS.inspo, [])) ? read(KEYS.inspo, []) : [];
      const localEvents = Array.isArray(read(KEYS.events, [])) ? read(KEYS.events, []) : [];

      const nextWork = mergeLocal
        ? [...new Set([...(payload.savedWork || []), ...localWork])]
        : [...new Set(payload.savedWork || [])];
      const nextInspo = mergeLocal
        ? mergeInspo(localInspo, payload.savedInspo || [])
        : (Array.isArray(payload.savedInspo) ? payload.savedInspo : []);
      const nextEvents = mergeLocal
        ? mergeEvents(localEvents, payload.events || [])
        : (Array.isArray(payload.events) ? payload.events.slice(-MAX_EVENTS) : []);

      write(KEYS.work, nextWork);
      write(KEYS.inspo, nextInspo);
      write(KEYS.events, nextEvents);

      if (payload.identity?.state === 'member') {
        window.LuneShell?.setIdentity?.({
          state: 'member',
          firstName: payload.identity.firstName || ''
        });
      }

      window.LuneShell?.syncSavedCount?.();
      window.dispatchEvent(new CustomEvent('lune:taste-changed'));
    } finally {
      hydrating = false;
    }
  }

  function snapshot() {
    return {
      savedWork: Array.isArray(read(KEYS.work, [])) ? read(KEYS.work, []) : [],
      savedInspo: Array.isArray(read(KEYS.inspo, [])) ? read(KEYS.inspo, []) : [],
      events: Array.isArray(read(KEYS.events, [])) ? read(KEYS.events, []).slice(-MAX_EVENTS) : []
    };
  }

  async function syncNow() {
    if (hydrating) return;
    if (syncInFlight) return syncInFlight;
    syncInFlight = request('/api/state', {
      method: 'PUT',
      body: JSON.stringify(snapshot())
    }).then(result => {
      try { localStorage.removeItem(DIRTY_KEY); } catch (_) {}
      return result;
    }).catch(() => null).finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  }

  function scheduleSync() {
    if (hydrating) return;
    try { localStorage.setItem(DIRTY_KEY, '1'); } catch (_) {}
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 320);
  }

  async function initialize() {
    try {
      const firstHydration = localStorage.getItem(HYDRATED_KEY) !== '1';
      const dirty = localStorage.getItem(DIRTY_KEY) === '1';

      const catalogPromise = request('/api/catalog').catch(() => null);
      if (dirty && !firstHydration) {
        await syncNow();
      }

      const [catalog, state] = await Promise.all([
        catalogPromise,
        request('/api/state').catch(() => null)
      ]);

      if (catalog) hydrateCatalog(catalog);
      if (state) {
        hydrateState(state, firstHydration);
        if (firstHydration) {
          try { localStorage.setItem(HYDRATED_KEY, '1'); } catch (_) {}
          await syncNow();
        }
      }
    } catch (_) {}
  }

  window.LuneData = {
    ready: null,
    sync: syncNow,
    snapshot
  };

  window.addEventListener('lune:taste-changed', scheduleSync);
  window.addEventListener('online', () => {
    initialize();
    scheduleSync();
  });
  window.addEventListener('storage', event => {
    if ([KEYS.work, KEYS.inspo, KEYS.events].includes(event.key)) scheduleSync();
  });

  const boot = () => {
    window.LuneData.ready = initialize();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
