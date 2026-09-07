(() => {
  const root = window;
  const VISITOR_KEY = 'lune_visitor_id_v1';
  const WORK_KEY = 'auranails_liked';
  const INSPO_KEY = 'aura_inspo_saved';
  const EVENT_KEY = 'lune_taste_events_v1';
  const HISTORY_KEY = 'lune_recommendation_history_v1';
  const OUTBOX_KEY = 'lune_taste_outbox_v1';
  const API = '/api';

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const uuid = () => root.crypto?.randomUUID?.() || `lune_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const visitorId = (() => {
    let value = localStorage.getItem(VISITOR_KEY);
    if (!value) { value = uuid(); localStorage.setItem(VISITOR_KEY, value); }
    return value;
  })();

  let currentUser = null;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  let lastSaved = null;

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || `request_failed_${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function localSavedItems() {
    const work = [...new Set(read(WORK_KEY, []))].map(itemId => ({ kind: 'work', itemId, snapshot: {} }));
    const inspo = read(INSPO_KEY, []).map(item => ({ kind: 'inspo', itemId: item.id, snapshot: item }));
    return [...work, ...inspo];
  }

  function savedMap() {
    return new Map(localSavedItems().map(item => [`${item.kind}:${item.itemId}`, item]));
  }

  async function importLocalSaves() {
    const items = localSavedItems();
    if (!items.length) return;
    await request('/saves/import', { method: 'POST', body: { visitorId, items } });
  }

  function mergeEvents(remoteEvents) {
    const merged = new Map(read(EVENT_KEY, []).map(event => [event.id, event]));
    (remoteEvents || []).forEach(event => merged.set(event.id, event));
    write(EVENT_KEY, [...merged.values()].sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0)).slice(-800));
  }

  function impressionsToHistory(impressions) {
    const rows = new Map();
    (impressions || []).forEach(item => {
      const key = `${item.item_kind}:${item.item_id}:${item.surface}`;
      const row = rows.get(key) || {
        key,
        kind: item.item_kind,
        itemId: item.item_id,
        surface: item.surface,
        shown: 0,
        engaged: 0,
        lastShown: 0,
        lastEngaged: 0,
        buckets: {}
      };
      row.shown += 1;
      const shown = new Date(item.shown_at).getTime();
      row.lastShown = Math.max(row.lastShown, shown || 0);
      if (item.bucket) row.buckets[item.bucket] = (row.buckets[item.bucket] || 0) + 1;
      if (item.engaged_action) {
        row.engaged += 1;
        row.lastAction = item.engaged_action;
        row.lastEngaged = Math.max(row.lastEngaged, new Date(item.engaged_at).getTime() || 0);
      }
      rows.set(key, row);
    });
    return [...rows.values()];
  }

  function mergeHistory(remoteImpressions) {
    const local = new Map(read(HISTORY_KEY, []).map(row => [row.key, row]));
    impressionsToHistory(remoteImpressions).forEach(remote => {
      const existing = local.get(remote.key);
      if (!existing) return local.set(remote.key, remote);
      local.set(remote.key, {
        ...existing,
        shown: Math.max(Number(existing.shown || 0), Number(remote.shown || 0)),
        engaged: Math.max(Number(existing.engaged || 0), Number(remote.engaged || 0)),
        lastShown: Math.max(Number(existing.lastShown || 0), Number(remote.lastShown || 0)),
        lastEngaged: Math.max(Number(existing.lastEngaged || 0), Number(remote.lastEngaged || 0)),
        lastAction: remote.lastEngaged > Number(existing.lastEngaged || 0) ? remote.lastAction : existing.lastAction,
        buckets: { ...(existing.buckets || {}), ...(remote.buckets || {}) }
      });
    });
    write(HISTORY_KEY, [...local.values()].slice(-500));
  }

  function applyRemoteSaves(savedItems, authenticated) {
    const active = (savedItems || []).filter(item => item.is_saved !== false);
    const remoteWork = active.filter(item => item.item_kind === 'work').map(item => item.item_id);
    const remoteInspo = active.filter(item => item.item_kind === 'inspo').map(item => ({
      id: item.item_id,
      ...(item.item_snapshot || {})
    }));

    if (authenticated) {
      write(WORK_KEY, [...new Set(remoteWork)]);
      write(INSPO_KEY, remoteInspo);
    } else {
      write(WORK_KEY, [...new Set([...read(WORK_KEY, []), ...remoteWork])]);
      const merged = new Map(read(INSPO_KEY, []).map(item => [item.id, item]));
      remoteInspo.forEach(item => merged.set(item.id, { ...(merged.get(item.id) || {}), ...item }));
      write(INSPO_KEY, [...merged.values()]);
    }
  }

  async function syncState() {
    const state = await request(`/state?visitorId=${encodeURIComponent(visitorId)}`);
    currentUser = state.user || null;
    applyRemoteSaves(state.savedItems, Boolean(currentUser));
    mergeEvents(state.tasteEvents);
    mergeHistory(state.impressions);
    lastSaved = savedMap();
    root.dispatchEvent(new CustomEvent('lune:identity', { detail: { user: currentUser, visitorId } }));
    root.dispatchEvent(new CustomEvent('lune:taste-changed'));
    updateAccountNav();
    return state;
  }

  async function persistSaveDiff() {
    const current = savedMap();
    const previous = lastSaved || new Map();
    const keys = new Set([...current.keys(), ...previous.keys()]);
    lastSaved = current;
    const jobs = [];
    keys.forEach(key => {
      const before = previous.get(key);
      const after = current.get(key);
      if (Boolean(before) === Boolean(after)) return;
      const item = after || before;
      jobs.push(request('/saves/toggle', {
        method: 'POST',
        body: { visitorId, kind: item.kind, itemId: item.itemId, saved: Boolean(after), snapshot: after?.snapshot || before?.snapshot || {} }
      }));
    });
    await Promise.allSettled(jobs);
  }

  function attachTaste() {
    if (!root.LuneTaste?.setPersistenceAdapter) return false;
    root.LuneTaste.setPersistenceAdapter({
      send: (events, context) => request('/taste/events', {
        method: 'POST',
        body: { visitorId, sessionId: context?.sessionId, events }
      })
    }).catch(() => {});
    return true;
  }

  function scheduleTasteFlush() {
    if (root.LuneTaste?.flush) root.LuneTaste.flush().catch(() => {});
  }

  function updateAccountNav() {
    document.querySelectorAll('.nav-links').forEach(nav => {
      let link = nav.querySelector('[data-lune-account-link]');
      if (!link) {
        link = document.createElement('a');
        link.href = 'account.html';
        link.dataset.luneAccountLink = '1';
        nav.appendChild(link);
      }
      link.textContent = currentUser ? 'Profile' : 'Account';
    });
  }

  async function register({ email, password, displayName, phone }) {
    const data = await request('/auth/register', { method: 'POST', body: { visitorId, email, password, displayName, phone } });
    currentUser = data.user;
    await syncState();
    return currentUser;
  }
  async function login({ email, password }) {
    const data = await request('/auth/login', { method: 'POST', body: { visitorId, email, password } });
    currentUser = data.user;
    await syncState();
    return currentUser;
  }
  async function logout() {
    await request('/auth/logout', { method: 'POST' });
    currentUser = null;
    updateAccountNav();
    root.dispatchEvent(new CustomEvent('lune:identity', { detail: { user: null, visitorId } }));
  }
  async function updateProfile({ displayName, phone }) {
    const data = await request('/profile', { method: 'PATCH', body: { displayName, phone } });
    currentUser = data.user;
    root.dispatchEvent(new CustomEvent('lune:identity', { detail: { user: currentUser, visitorId } }));
    return currentUser;
  }
  async function createDraftOrder(payload = {}) {
    return request('/orders/drafts', { method: 'POST', body: { visitorId, ...payload } });
  }
  async function orders() {
    return request(`/orders?visitorId=${encodeURIComponent(visitorId)}`);
  }

  async function bootstrap() {
    updateAccountNav();
    try {
      const identity = await request('/identity/visitor', {
        method: 'POST',
        body: { visitorId, path: location.pathname, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language }
      });
      currentUser = identity.user || null;
      if (!currentUser) await importLocalSaves().catch(() => {});
      await syncState();
    } catch (err) {
      console.warn('[LuneData] persistence unavailable; continuing locally', err.message);
      lastSaved = savedMap();
      updateAccountNav();
    } finally {
      readyResolve({ user: currentUser, visitorId });
    }
  }

  root.LuneData = {
    version: '1.0.0', visitorId, ready,
    get user() { return currentUser; },
    request, syncState, attachTaste, register, login, logout, updateProfile, createDraftOrder, orders
  };

  root.addEventListener('lune:taste-changed', () => { persistSaveDiff(); scheduleTasteFlush(); });
  root.addEventListener('aura:taste-changed', () => { persistSaveDiff(); scheduleTasteFlush(); });
  root.addEventListener('online', () => { syncState().catch(() => {}); scheduleTasteFlush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') scheduleTasteFlush(); });
  setInterval(scheduleTasteFlush, 12000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
