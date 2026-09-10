(() => {
  const request = async (path, options = {}) => {
    const response = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options, body: options.body ? JSON.stringify(options.body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Something went wrong.');
    return payload;
  };
  const esc = value => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const section = document.createElement('section');
  section.className = 'dashboard-section'; section.id = 'applications';
  section.innerHTML = '<div class="dashboard-section-header"><div><div class="eyebrow">PARTNER APPLICATIONS</div><h2>Look at the work before growing the room.</h2></div><button class="ops-button quiet" type="button" data-application-refresh>Refresh</button></div><div class="dashboard-list" data-application-list></div>';
  const mount = () => { const network = document.querySelector('#network'), content = document.querySelector('[data-admin-content]'); if (!network || !content || section.isConnected) return; network.insertAdjacentElement('afterend', section); const nav = document.querySelector('.nav-links'); if (nav && !nav.querySelector('[href="#applications"]')) { const link = document.createElement('a'); link.href = '#applications'; link.textContent = 'Applications'; nav.insertBefore(link, nav.querySelector('[href="#orders"]')); } };
  const render = applications => { const list = section.querySelector('[data-application-list]'); list.innerHTML = applications.length ? applications.map(a => { const links = [a.portfolio_url, a.instagram_url].filter(Boolean).map(link => `<a href="${esc(link)}" target="_blank" rel="noreferrer">View work ↗</a>`).join(' · '); const services = (a.services || []).map(esc).join(' · ') || 'No service notes yet'; return `<article class="dashboard-row" data-application="${esc(a.id)}"><div><div class="eyebrow">${esc(a.status)}${a.select_interest ? ' · SELECT INTEREST' : ''}</div><h3>${esc(a.studio_name)}</h3><p>${esc(a.contact_name)} · ${esc(a.email)}${a.phone ? ` · ${esc(a.phone)}` : ''}</p><p>${esc(a.area || 'Area to confirm')} · ${esc(a.team_size || 1)} person team</p><p>${services}</p>${a.client_experience ? `<p>${esc(a.client_experience)}</p>` : ''}<p>${links}</p></div><div class="application-actions"><select aria-label="Application status" data-application-status><option value="received"${a.status === 'received' ? ' selected' : ''}>Received</option><option value="reviewing"${a.status === 'reviewing' ? ' selected' : ''}>Reviewing</option><option value="accepted"${a.status === 'accepted' ? ' selected' : ''}>Accepted</option><option value="not_now"${a.status === 'not_now' ? ' selected' : ''}>Not now</option></select><button class="ops-button quiet" type="button" data-save-application>Save review</button></div></article>`; }).join('') : '<div class="ops-empty">No partner applications yet.</div>'; };
  const load = async () => { mount(); if (!section.isConnected || document.querySelector('[data-admin-content]')?.classList.contains('ops-hidden')) return; try { render((await request('/admin/partner-applications')).applications || []); } catch { section.querySelector('[data-application-list]').innerHTML = '<div class="ops-empty">Applications will appear here once operations access is available.</div>'; } };
  window.addEventListener('load', () => {
    let attempts = 0;
    const waitForAdmin = window.setInterval(() => {
      load();
      attempts += 1;
      if ((section.isConnected && !document.querySelector('[data-admin-content]')?.classList.contains('ops-hidden')) || attempts > 20) window.clearInterval(waitForAdmin);
    }, 250);
  });
  document.addEventListener('click', async event => { if (event.target.closest('[data-application-refresh]')) return load(); const button = event.target.closest('[data-save-application]'), row = button?.closest('[data-application]'); if (!row) return; button.disabled = true; try { await request(`/admin/partner-applications/${encodeURIComponent(row.dataset.application)}`, { method: 'PATCH', body: { status: row.querySelector('[data-application-status]').value } }); await load(); } catch (error) { alert(error.message); } finally { button.disabled = false; } });
})();
