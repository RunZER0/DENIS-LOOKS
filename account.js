(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const params = new URLSearchParams(location.search);

  function status(node, message, error = false) {
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-error', Boolean(error));
  }

  function niceError(err) {
    const map = {
      valid_email_required: 'Enter a valid email address.',
      password_too_short: 'Use at least 8 characters.',
      email_already_registered: 'That email already has a Lune account.',
      invalid_credentials: 'Email or password is incorrect.',
      database_not_configured: 'Lune accounts are temporarily unavailable.'
    };
    return map[err?.message] || 'Something went wrong. Try again.';
  }

  function nextPage() {
    const value = params.get('next');
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin) return '';
      if (!['/partner.html','/admin.html','/booking.html'].includes(url.pathname)) return '';
      return url.pathname + url.search;
    } catch (_) { return ''; }
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
    if (!user) return;
    $('[data-account-name]').textContent = user.displayName || 'Your Lune';
    $('[data-account-email]').textContent = user.email || '';
    const profile = $('[data-profile-form]');
    if (profile) {
      profile.elements.displayName.value = user.displayName || '';
      profile.elements.phone.value = user.phone || '';
    }
  }

  async function renderAccess() {
    const grid = $('.account-continuation-grid');
    if (!grid || !window.LuneData?.user) return;
    grid.querySelectorAll('[data-role-link]').forEach(node => node.remove());
    try {
      const access = await window.LuneData.request('/access');
      if ((access.memberships || []).length) grid.insertAdjacentHTML('beforeend','<a class="account-continuation" data-role-link href="partner.html"><span>PARTNER</span><strong>Open partner desk</strong><em>Requests, appointments and capacity.</em></a>');
      if (access.isAdmin) grid.insertAdjacentHTML('beforeend','<a class="account-continuation" data-role-link href="admin.html"><span>OPERATIONS</span><strong>Open Lune control</strong><em>Network, orders, payouts and offers.</em></a>');
    } catch (_) {}
  }

  async function renderOrders() {
    const target = $('[data-account-orders]');
    if (!target || !window.LuneData?.user) return;
    try {
      const data = await window.LuneData.orders();
      const orders = data.orders || [];
      if (!orders.length) { target.innerHTML = '<p class="account-muted">No bookings yet.</p>'; return; }
      target.innerHTML = orders.slice(0, 10).map(order => {
        const when = order.scheduled_for ? new Date(order.scheduled_for).toLocaleString('en-KE',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}) : 'Date not chosen yet';
        return `<a class="account-order" href="order.html?id=${encodeURIComponent(order.id)}"><div><span>${String(order.status || 'draft').replace(/_/g, ' ')}</span><strong>${order.item_snapshot?.title || order.item_id || 'Lune booking'}</strong></div><em>${when}</em></a>`;
      }).join('');
    } catch (_) {}
  }

  async function afterAuth(user) {
    renderUser(user);
    await Promise.all([renderOrders(), renderAccess()]);
    const next = nextPage();
    if (next) location.href = next;
  }

  async function boot() {
    let tries = 0;
    while (!window.LuneData && tries++ < 40) await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.LuneData) return;
    await window.LuneData.ready;
    renderUser(window.LuneData.user);
    if (window.LuneData.user) await Promise.all([renderOrders(),renderAccess()]);

    $$('[data-account-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.accountTab)));

    $('[data-login-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const node = $('[data-login-status]');
      status(node, '');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const user = await window.LuneData.login({ email: form.elements.email.value, password: form.elements.password.value });
        await afterAuth(user);
      } catch (err) { status(node, niceError(err), true); }
      finally { button.disabled = false; }
    });

    $('[data-register-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const node = $('[data-register-status]');
      status(node, '');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const user = await window.LuneData.register({
          displayName: form.elements.displayName.value,
          phone: form.elements.phone.value,
          email: form.elements.email.value,
          password: form.elements.password.value
        });
        await afterAuth(user);
      } catch (err) { status(node, niceError(err), true); }
      finally { button.disabled = false; }
    });

    $('[data-profile-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const node = $('[data-profile-status]');
      status(node, '');
      try {
        const user = await window.LuneData.updateProfile({ displayName: form.elements.displayName.value, phone: form.elements.phone.value });
        renderUser(user);
        status(node, 'Saved.');
      } catch (err) { status(node, niceError(err), true); }
    });

    $('[data-logout]')?.addEventListener('click', async () => {
      await window.LuneData.logout();
      ['auranails_liked','aura_inspo_saved','lune_taste_events_v1','lune_recommendation_history_v1','lune_taste_outbox_v1','lune_discovery_context_v1','lune_discovery_trail_v1','lune_visitor_id_v1'].forEach(key => localStorage.removeItem(key));
      location.href = 'index.html';
    });

    window.addEventListener('lune:identity', event => renderUser(event.detail?.user || null));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
