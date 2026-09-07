(() => {
  'use strict';
  const params=new URLSearchParams(location.search),orderId=params.get('id');
  const $=s=>document.querySelector(s);const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>`KSh ${Number(v||0).toLocaleString('en-KE')}`;
  let order=null,poll=null,busy=false;
  function storedToken(){if(params.get('token'))return params.get('token');try{return JSON.parse(localStorage.getItem('lune_order_tokens_v1')||'{}')[orderId]||''}catch(_){return''}}
  function visitor(){return window.LuneData?.visitorId||localStorage.getItem('lune_visitor_id_v1')||''}
  async function request(path,options={}){if(window.LuneData?.request)return window.LuneData.request(path,options);const r=await fetch(`/api${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||`request_failed_${r.status}`);return d}
  function query(){const q=new URLSearchParams({visitorId:visitor()});const t=storedToken();if(t)q.set('token',t);return q}
  function status(message,error=false){const n=$('[data-order-status]');if(!n)return;n.textContent=message||'';n.classList.toggle('is-error',error);}

  const STATES={
    matching:{eyebrow:'SECURING YOUR APPOINTMENT',lede:'Lune is asking the strongest suitable station to take this appointment.',index:1},
    needs_attention:{eyebrow:'STILL MATCHING',lede:'The first route did not resolve cleanly. The request is still visible to Lune instead of disappearing.',index:1},
    partner_accepted:{eyebrow:'YOUR STATION IS READY',lede:'The station has accepted. Complete payment to lock the appointment in.',index:2},
    payment_pending:{eyebrow:'PAYMENT',lede:'Your station is being held while payment is completed.',index:2},
    confirmed:{eyebrow:'CONFIRMED',lede:'Everything is set. The station, time and directions are all here.',index:3},
    upcoming:{eyebrow:'COMING UP',lede:'Your Lune appointment is next.',index:3},
    checked_in:{eyebrow:'YOU ARE THERE',lede:'The appointment has started its way through the station.',index:4},
    in_service:{eyebrow:'IN SERVICE',lede:'Your set is being worked on now.',index:4},
    completed:{eyebrow:'DONE',lede:'The set is yours now. Keep the result, rate the experience or do it again.',index:5},
    reviewed:{eyebrow:'KEPT',lede:'Your feedback is part of how Lune protects the standard.',index:5},
    cancelled:{eyebrow:'CANCELLED',lede:'This reservation is closed. Your saved direction is still here when you want to start again.',index:0},
    refund_pending:{eyebrow:'REFUND IN MOTION',lede:'The refund has been sent for processing. Lune will keep the order state with it.',index:0},
    refunded:{eyebrow:'REFUNDED',lede:'This reservation has been refunded.',index:0},
    no_show:{eyebrow:'MISSED',lede:'This appointment was marked as missed.',index:0}
  };

  function timeline(){
    const steps=[['matching','Station match'],['partner_accepted','Station accepted'],['confirmed','Payment confirmed'],['checked_in','Appointment'],['completed','Finished']];
    const current=STATES[order.status]?.index||0;
    $('[data-order-timeline]').innerHTML=steps.map(([,label],i)=>`<div class="timeline-item ${i+1<current?'is-done':i+1===current?'is-current':''}"><strong>${label}</strong><span>${i===0?'Capability, setting and distance':i===1?'The partner confirms the slot':i===2?'Paystack verification completes the booking':i===3?'Check-in and service': 'Ready to rate or reorder'}</span></div>`).join('');
  }

  function actions(){
    const target=$('[data-order-actions]');if(!target)return;const out=[];
    if(['partner_accepted','payment_pending'].includes(order.status)&&order.paymentStatus!=='paid')out.push('<button class="ops-button lacquer" type="button" data-pay>Pay securely <span aria-hidden="true">→</span></button>');
    if(['completed','reviewed'].includes(order.status))out.push('<button class="ops-button lacquer" type="button" data-reorder>Do this again <span aria-hidden="true">→</span></button>');
    if(['matching','needs_attention'].includes(order.status))out.push('<a class="ops-button quiet" href="inspo.html" style="text-decoration:none">Keep exploring while Lune matches</a>');
    target.innerHTML=out.join('');
    target.querySelector('[data-pay]')?.addEventListener('click',pay);
    target.querySelector('[data-reorder]')?.addEventListener('click',()=>{const url=new URL('booking.html',location.href);url.searchParams.set('reorder',order.id);const t=storedToken();if(t)url.searchParams.set('token',t);url.searchParams.set('source','reorder');location.href=url.toString();if(window.LuneTaste&&order.itemId)window.LuneTaste.track('reorder',{id:order.itemId,kind:order.itemKind,...order.item},{surface:'order'});});
  }

  function station(){
    const target=$('[data-station-region]');if(!target)return;
    if(!order.location){target.innerHTML='';return;}
    const showContact=['confirmed','upcoming','checked_in','in_service','completed','reviewed'].includes(order.status);
    target.innerHTML=`<section class="station-card"><div class="eyebrow">YOUR STATION</div><h3>${esc(order.location.name)}</h3><p class="ops-muted">${esc(order.location.address||order.location.area||'Nairobi')}${order.location.technicianName?` · ${esc(order.location.technicianName)}`:''}</p>${showContact&&order.location.directionsUrl?`<div class="ops-actions" style="margin-top:16px"><a class="ops-button quiet" href="${esc(order.location.directionsUrl)}" target="_blank" rel="noopener" style="text-decoration:none">Directions ↗</a></div>`:''}</section>`;
  }

  function review(){
    const target=$('[data-review-region]');if(!target)return;if(!['completed','reviewed'].includes(order.status)){target.innerHTML='';return;}
    if(order.review){target.innerHTML=`<section class="ops-card" style="margin-top:22px"><div class="eyebrow">YOUR FEEDBACK</div><h3>${order.review.rating}/5</h3><p class="ops-muted">${esc(order.review.comment||'Rating saved.')}</p></section>`;return;}
    target.innerHTML=`<section class="ops-card" style="margin-top:22px"><div class="eyebrow">HOW DID IT FEEL?</div><h3>Protect the standard with one rating.</h3><div class="rating-row" data-rating>${[1,2,3,4,5].map(n=>`<button type="button" data-rate="${n}">${n}</button>`).join('')}</div><div class="ops-field" style="margin-top:14px"><textarea data-review-copy placeholder="Anything Lune should know?"></textarea></div><button class="ops-button" type="button" data-review-submit>Save feedback</button><p class="ops-status" data-review-status></p></section>`;
    let rating=0;target.querySelectorAll('[data-rate]').forEach(b=>b.addEventListener('click',()=>{rating=Number(b.dataset.rate);target.querySelectorAll('[data-rate]').forEach(x=>x.classList.toggle('is-active',Number(x.dataset.rate)<=rating));}));
    target.querySelector('[data-review-submit]')?.addEventListener('click',async()=>{const node=target.querySelector('[data-review-status]');if(!rating){node.textContent='Choose a rating first.';return;}try{await request(`/orders/${encodeURIComponent(order.id)}/review`,{method:'POST',body:{visitorId:visitor(),token:storedToken(),rating,comment:target.querySelector('[data-review-copy]').value}});await load();}catch(_){node.textContent='Could not save feedback. Try again.';node.classList.add('is-error');}});
  }

  function render(){
    const state=STATES[order.status]||{eyebrow:'YOUR RESERVATION',lede:'Lune is keeping the order state visible.',index:0};
    $('[data-order-loading]').classList.add('ops-hidden');$('[data-order-content]').classList.remove('ops-hidden');
    $('[data-order-eyebrow]').textContent=state.eyebrow;$('[data-order-title]').textContent=order.item?.title||order.item?.style||'Your set';$('[data-order-lede]').textContent=state.lede;
    const img=$('[data-order-image]');const src=order.item?.imageUrl||order.item?.image_url||'';if(src){img.src=src;img.alt=order.item?.title||'Selected Lune set';}else img.closest('figure').classList.add('ops-hidden');
    const when=order.scheduledFor?new Date(order.scheduledFor).toLocaleString('en-KE',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'}):'Not scheduled';
    $('[data-order-summary]').innerHTML=`<div class="summary-row"><span>When</span><strong>${esc(when)}</strong></div><div class="summary-row"><span>Experience</span><strong>${esc(({closest:'Closest fit',select:'Lune Select',calm:'Calm',same:'Same place'})[order.experiencePreference]||order.experiencePreference||'Lune match')}</strong></div><div class="summary-row"><span>Amount</span><strong>${money(order.amountKes)}</strong></div><div class="summary-row"><span>Payment</span><strong>${esc(String(order.paymentStatus||'unpaid').replace(/_/g,' '))}</strong></div>`;
    actions();timeline();station();review();
    if(['matching','needs_attention'].includes(order.status))startPolling();else stopPolling();
  }

  async function pay(){if(busy)return;busy=true;status('Opening secure payment…');const button=$('[data-pay]');if(button)button.disabled=true;try{const data=await request(`/orders/${encodeURIComponent(order.id)}/payment`,{method:'POST',body:{visitorId:visitor(),token:storedToken()}});if(!data.authorizationUrl)throw new Error('payment_url_missing');location.href=data.authorizationUrl;}catch(err){status(err.message==='paystack_not_configured'?'Payments are not switched on yet. Your station remains accepted.':'Payment could not start. Nothing was charged.',true);busy=false;if(button)button.disabled=false;}}
  function startPolling(){if(poll)return;poll=setInterval(()=>load(true),8000)}function stopPolling(){if(poll){clearInterval(poll);poll=null}}

  async function load(silent=false){
    if(!orderId){$('[data-order-loading]').classList.add('ops-hidden');$('[data-order-error]').classList.remove('ops-hidden');return;}
    try{const data=await request(`/orders/${encodeURIComponent(orderId)}?${query()}`);order=data.order;render();if(params.get('payment')==='failed'&&!silent)status('Payment did not complete. Nothing has been confirmed yet.',true);}
    catch(_){if(!silent){$('[data-order-loading]').classList.add('ops-hidden');$('[data-order-error]').classList.remove('ops-hidden');}stopPolling();}
  }

  async function boot(){let tries=0;while(!window.LuneData&&tries++<20)await new Promise(r=>setTimeout(r,100));if(window.LuneData?.ready)await window.LuneData.ready.catch(()=>{});await load();}
  window.addEventListener('beforeunload',stopPolling);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
