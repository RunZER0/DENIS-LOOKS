(() => {
  'use strict';

  const DISMISS_KEY = 'lune_circle_invite_until_v1';
  const ELIGIBLE_PAGES = ['aura-home-page', 'aura-inspo-page', 'aura-work-page'];

  const isEligible = () => ELIGIBLE_PAGES.some(name => document.body.classList.contains(name));
  const wasDismissed = () => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
  const dismissForAWhile = () => localStorage.setItem(DISMISS_KEY, String(Date.now() + 21 * 86400000));

  function ensureDialog() {
    let dialog = document.getElementById('lune-circle-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'lune-circle-dialog';
    dialog.className = 'membership-dialog';
    dialog.innerHTML = `<button class="membership-dialog-close" type="button" aria-label="Close">×</button><div class="membership-dialog-inner"><img class="circle-scribbles" src="lune-circle-scribbles.png" alt="" aria-hidden="true"><div class="circle-main"><div class="eyebrow">LUNE CIRCLE</div><p class="circle-handnote">a little closer, together</p><h2>Good taste likes good company.</h2><p class="circle-intro">A closer place for the people who keep a direction.</p><div class="membership-benefits"><div class="membership-benefit"><b>Earlier openings</b>First word on selected appointments.</div><div class="membership-benefit"><b>Your edit, kept close</b>A personal line to the work you save.</div><div class="membership-benefit"><b>New work, before the feed</b>See it while it is still fresh.</div></div></div><aside class="circle-plan-card"><span class="circle-plan-mark" aria-hidden="true">✦</span><small>FIRST CIRCLE · OPENING SOON</small><strong>Selected offers, shown before payment.</strong><p>When Circle pricing is available, it is added to the booking before you pay.</p><div class="membership-dialog-actions"><a class="button" href="account.html">Keep Circle close <span class="arrow">→</span></a><button class="quiet-action" type="button" data-circle-dismiss>Not now</button></div></aside></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.membership-dialog-close')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-circle-dismiss]')?.addEventListener('click', () => { dismissForAWhile(); dialog.close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  function showInvite() {
    if (!isEligible() || wasDismissed() || document.querySelector('.membership-invite')) return;
    const invite = document.createElement('aside');
    invite.className = 'membership-invite';
    invite.setAttribute('aria-label', 'Lune Circle membership');
    invite.innerHTML = '<button class="membership-dismiss" type="button" aria-label="Dismiss">×</button><small>LUNE CIRCLE</small><h2>Your signature deserves a place to return to.</h2><p>Member pricing. Priority access. A closer edit.</p><button type="button" data-open-circle>See Circle <span aria-hidden="true">→</span></button>';
    document.body.appendChild(invite);
    invite.querySelector('.membership-dismiss')?.addEventListener('click', () => { dismissForAWhile(); invite.remove(); });
    requestAnimationFrame(() => invite.classList.add('show'));
  }

  function boot() {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-open-circle]');
      if (!trigger) return;
      event.preventDefault();
      const dialog = ensureDialog();
      if (!dialog.open) dialog.showModal();
    });
    if (!isEligible() || wasDismissed()) return;
    let shown = false;
    const reveal = () => {
      if (shown) return;
      shown = true;
      window.removeEventListener('scroll', onScroll);
      setTimeout(showInvite, 550);
    };
    const onScroll = () => {
      const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollY / total > .42) reveal();
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    window.setTimeout(reveal, 18000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
