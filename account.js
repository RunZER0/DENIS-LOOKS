(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const params = new URLSearchParams(location.search);
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function status(node, message, error = false) {
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-error', Boolean(error));
  }

  function niceError(err) {
    const map = {
      valid_email_required: 'Enter a valid email address.', password_too_short: 'Use at least 8 characters.',
      email_already_registered: 'That email already has a Lune account.', invalid_credentials: 'Email or password is incorrect.',
      database_not_configured: 'Lune accounts are temporarily unavailable.'
    };
    return map[err?.message] || 'Something went wrong. Try again.';
  }

  function nextPage() {
    const value = params.get('next');
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || !['/partner.html','/admin.html','/booking.html'].includes(url.pathname)) return '';
      return url.pathname + url.search;
    } catch (_) { return ''; }
  }

  function destinationName(path) {
    if (path.startsWith('/booking.html')) return 'Sign in to continue your booking with your details and appointment history close.';
    if (path.startsWith('/partner.html')) return 'Sign in to open your partner desk.';
    if (path.startsWith('/admin.html')) return 'Sign in to open Lune operations.';
    return '';
  }

  function switchTab(name) {
    $$('[data-account-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.accountTab === name));
    $('[data-login-form]').hidden = name !== 'login';
    $('[data-register-form]').hidden = name !== 'register';
  }

  function renderUser(user) {
    const guest = $('[data-account-guest]');
    const member = $('[data-account-member]');
    guest.hidden = Boolean(user);
    member.hidden = !user;
    document.body.classList.toggle('is-signed-in', Boolean(user));
    if (!user) return;
    $('[data-account-name]').textContent = user.displayName || 'Your Lune';
    $('[data-account-email]').textContent = user.email || '';
    const profile = $('[data-profile-form]');
    if (profile) {
      profile.elements.displayName.value = user.displayName || '';
      profile.elements.phone.value = user.phone || '';
    }
  }

  function orderDate(order) {
    return order.scheduled_for ? new Date(order.scheduled_for).toLocaleString('en-KE', { weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }) : 'Date not chosen yet';
  }

  function canRebook(order) { return ['completed','reviewed','confirmed','upcoming'].includes(order?.status); }

  function rebookUrl(order) {
    return `booking.html?reorder=${encodeURIComponent(order.id)}&source=reorder`;
  }

  function renderNow(continuity, orders) {
    const target = $('[data-account-now-content]');
    if (!target) return;
    const active = continuity?.activeOrder;
    const completed = continuity?.lastCompleted || orders.find(order => ['completed','reviewed'].includes(order.status));
    if (active) {
      const title = active.item_snapshot?.title || active.item_snapshot?.style || 'your appointment';
      target.innerHTML = `<h3>${esc(title)} is in motion.</h3><p>${esc(String(active.status || 'matching').replace(/_/g, ' '))} · ${esc(orderDate(active))}. Everything around this appointment is waiting in one place.</p><a class="button" href="order.html?id=${encodeURIComponent(active.id)}">Open appointment <span class="arrow">→</span></a>`;
      return;
    }
    if (completed?.id) {
      const title = completed.item_snapshot?.title || completed.item_snapshot?.style || 'That set';
      target.innerHTML = `<h3>${esc(title)} still looks like you.</h3><p>Return to the same direction, keep the right details, or let it become the starting point for something new.</p><a class="button" href="${rebookUrl(completed)}">Book it again <span class="arrow">→</span></a>`;
      return;
    }
    target.innerHTML = '<h3>Start with what feels like you.</h3><p>Save references, explore the edit, then book when the right set is sitting in front of you.</p><a class="button" href="inspo.html">Explore your direction <span class="arrow">→</span></a>';
  }

  function rewardLabel(reward = {}) {
    if (reward.type === 'percent' && Number(reward.percent) > 0) return `${Number(reward.percent)}% off`;
    if (reward.type === 'fixed_kes' && Number(reward.amount) > 0) return `KSh ${Number(reward.amount).toLocaleString('en-KE')} off`;
    return 'A Lune offer';
  }

  function renderOffer(offer) {
    const target = $('[data-account-offer]');
    if (!target) return;
    if (!offer?.code) { target.hidden = true; target.innerHTML = ''; return; }
    target.hidden = false;
    target.innerHTML = `<div><div class="eyebrow">AVAILABLE FOR YOUR NEXT APPOINTMENT</div><strong>${esc(rewardLabel(offer.reward))}</strong><p>${esc(offer.copy || offer.title || 'This offer is added to your booking before payment.')}</p></div><a class="button" href="booking.html?offer=${encodeURIComponent(offer.code)}">Use offer <span class="arrow">→</span></a>`;
  }

  async function renderAccess() {
    const grid = $('.account-continuation-grid');
    if (!grid || !window.LuneData?.user) return;
    grid.querySelectorAll('[data-role-link]').forEach(node => node.remove());
    try {
      const access = await window.LuneData.request('/access');
      if ((access.memberships || []).length) grid.insertAdjacentHTML('beforeend', '<a class="account-continuation" data-role-link href="partner.html"><span>PARTNER</span><strong>Open partner desk</strong><em>Requests, appointments and capacity.</em></a>');
      if (access.isAdmin) grid.insertAdjacentHTML('beforeend', '<a class="account-continuation" data-role-link href="admin.html"><span>OPERATIONS</span><strong>Open Lune control</strong><em>Network, orders, payouts and offers.</em></a>');
    } catch (_) {}
  }

  function renderOrders(orders) {
    const target = $('[data-account-orders]');
    if (!target) return;
    if (!orders.length) { target.innerHTML = '<p class="account-muted">No appointments yet. When you are ready, start from a direction you want to keep.</p>'; return; }
    target.innerHTML = orders.slice(0, 10).map(order => {
      const title = order.item_snapshot?.title || order.item_id || 'Lune booking';
      const rebook = canRebook(order) ? `<a class="text-link" href="${rebookUrl(order)}">Book again <span class="arrow">→</span></a>` : '';
      return `<article class="account-order"><a class="account-order-main" href="order.html?id=${encodeURIComponent(order.id)}"><span class="account-order-status">${esc(String(order.status || 'draft').replace(/_/g, ' '))}</span><strong>${esc(title)}</strong></a><div class="account-order-meta"><em>${esc(orderDate(order))}</em><div class="account-order-actions"><a class="text-link" href="order.html?id=${encodeURIComponent(order.id)}">Open</a>${rebook}</div></div></article>`;
    }).join('');
  }

  async function renderDashboard() {
    if (!window.LuneData?.user) return;
    const now = $('[data-account-now-content]');
    try {
      const [orderData, continuity] = await Promise.all([
        window.LuneData.orders(),
        window.LuneData.request(`/continuity?visitorId=${encodeURIComponent(window.LuneData.visitorId || '')}`)
      ]);
      const orders = orderData.orders || [];
      renderNow(continuity, orders);
      renderOffer(continuity.offer);
      renderOrders(orders);
    } catch (_) {
      if (now) now.innerHTML = '<h3>Your Lune is ready.</h3><p>Your saved work and account details are still here. Appointments will appear once they are available.</p><a class="button" href="work.html">See finished sets <span class="arrow">→</span></a>';
    }
  }

  async function afterAuth(user) {
    renderUser(user);
    await Promise.all([renderDashboard(), renderAccess()]);
    const next = nextPage();
    if (next) location.assign(next);
  }

  async function boot() {
    let tries = 0;
    while (!window.LuneData && tries++ < 40) await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.LuneData) return;
    await window.LuneData.ready;
    const next = nextPage();
    const returnNote = $('[data-account-return-note]');
    if (returnNote && next) { returnNote.textContent = destinationName(next); returnNote.hidden = false; }
    renderUser(window.LuneData.user);
    if (window.LuneData.user) await Promise.all([renderDashboard(), renderAccess()]);

    $$('[data-account-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.accountTab)));
    $('[data-login-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, node = $('[data-login-status]'), button = form.querySelector('button[type="submit"]');
      status(node, ''); button.disabled = true;
      try { await afterAuth(await window.LuneData.login({ email: form.elements.email.value, password: form.elements.password.value })); }
      catch (err) { status(node, niceError(err), true); } finally { button.disabled = false; }
    });
    $('[data-register-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, node = $('[data-register-status]'), button = form.querySelector('button[type="submit"]');
      status(node, ''); button.disabled = true;
      try { await afterAuth(await window.LuneData.register({ displayName:form.elements.displayName.value, phone:form.elements.phone.value, email:form.elements.email.value, password:form.elements.password.value })); }
      catch (err) { status(node, niceError(err), true); } finally { button.disabled = false; }
    });
    $('[data-profile-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, node = $('[data-profile-status]'); status(node, '');
      try { const user = await window.LuneData.updateProfile({ displayName:form.elements.displayName.value, phone:form.elements.phone.value }); renderUser(user); status(node, 'Saved.'); }
      catch (err) { status(node, niceError(err), true); }
    });
    $('[data-logout]')?.addEventListener('click', async () => {
      await window.LuneData.logout();
      ['auranails_liked','aura_inspo_saved','lune_taste_events_v1','lune_recommendation_history_v1','lune_taste_outbox_v1','lune_discovery_context_v1','lune_discovery_trail_v1','lune_visitor_id_v1'].forEach(key => localStorage.removeItem(key));
      location.assign('index.html');
    });
    window.addEventListener('lune:identity', async event => { renderUser(event.detail?.user || null); if (event.detail?.user) await Promise.all([renderDashboard(), renderAccess()]); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
