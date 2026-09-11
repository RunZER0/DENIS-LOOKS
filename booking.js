(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const form = document.querySelector('[data-booking-form]');
  if (!form) return;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const visitorId = () => window.LuneData?.visitorId || localStorage.getItem('lune_visitor_id_v1') || '';
  const money = value => `KSh ${Number(value || 0).toLocaleString('en-KE')}`;
  const state = {
    step:1,itemKind:params.get('kind'),itemId:params.get('id'),item:null,service:null,
    matches:[],selectedLocationId:null,manualSelected:false,
    previousLocationId:null,previousLocationName:null,sourceOrderId:null,
    offer:null,reorderToken:params.get('token') || '',loading:false
  };

  function status(node,message,error=false){if(!node)return;node.textContent=message||'';node.classList.toggle('is-error',Boolean(error));node.classList.toggle('is-good',Boolean(message)&&!error);}
  async function request(path,options={}){
    if(window.LuneData?.request)return window.LuneData.request(path,options);
    const response=await fetch(`/api${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});
    const data=await response.json().catch(()=>null);if(!response.ok)throw Object.assign(new Error(data?.error||`request_failed_${response.status}`),{status:response.status,data});return data;
  }
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setStep(next){
    state.step=Math.max(1,Math.min(4,next));
    $$('[data-step]').forEach(section=>section.classList.toggle('is-active',Number(section.dataset.step)===state.step));
    $$('.booking-progress span').forEach((node,index)=>node.classList.toggle('is-active',index<state.step));
    window.scrollTo({top:Math.max(0,form.getBoundingClientRect().top+scrollY-125),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    renderSummary();
  }

  function scheduledIso(){
    const date=form.elements.date?.value,time=form.elements.time?.value;
    if(!date||!time)return null;
    const value=new Date(`${date}T${time}:00`);
    return Number.isNaN(value.getTime())?null:value.toISOString();
  }

  function experience(){return form.elements.experience?.value||'closest';}
  function currentArea(){return form.elements.area?.value?.trim()||'';}
  function offerDiscount(total){
    const reward=state.offer?.reward||{};if(!total||!state.offer||form.elements.offerCode?.value!==state.offer.code)return 0;
    if(reward.type==='percent')return Math.min(total,Math.round(total*Math.max(0,Math.min(100,Number(reward.percent||0)))/100));
    if(reward.type==='fixed_kes')return Math.min(total,Math.max(0,Math.round(Number(reward.amount||0))));
    return 0;
  }

  function renderLook(){
    const target=$('[data-look-summary]');if(!target)return;
    if(!state.item){target.innerHTML='<div class="eyebrow">YOUR DIRECTION</div><p class="ops-muted">Choose a finished set below and the reservation will continue around it.</p>';return;}
    const image=state.item.imageUrl||state.item.image_url||state.item.img||'';
    const title=state.item.title||state.item.style||'Lune look';
    target.innerHTML=`<div class="booking-look">${image?`<img src="${esc(image)}" alt="${esc(title)}">`:''}<div><div class="eyebrow">${state.itemKind==='inspo'?'INSPO':'FINISHED SET'}</div><strong>${esc(title)}</strong><span>${esc(state.item.category||state.item.style||'')}</span></div></div>`;
  }

  function renderSummary(){
    const target=$('[data-booking-summary]');if(!target)return;
    const when=scheduledIso()?new Date(scheduledIso()).toLocaleString('en-KE',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Not chosen';
    const labels={closest:'Closest fit',select:'Lune Select',calm:'Calm',same:'Same place'};
    const chosen=state.matches.find(m=>m.locationId===state.selectedLocationId);
    const area=chosen?chosen.name:(currentArea()||'Not chosen');
    const basePrice=state.item&&state.service ? (state.itemKind==='work'&&Number(state.item.priceKes||state.item.price_kes)>0?Number(state.item.priceKes||state.item.price_kes):Number(state.service.basePriceKes||state.service.base_price_kes)) : 0;
    const price=basePrice+(experience()==='select'?500:0);
    const party=Number(form.elements.groupSize?.value||1),discount=offerDiscount(price);target.innerHTML=`<div class="summary-row"><span>When</span><strong>${esc(when)}</strong></div><div class="summary-row"><span>Experience</span><strong>${esc(labels[experience()]||'Closest fit')}</strong></div><div class="summary-row"><span>${chosen?'Station':'Area'}</span><strong>${esc(area)}</strong></div>${party>1?`<div class="summary-row"><span>Coming together</span><strong>${party} people</strong></div>`:''}${discount?`<div class="summary-row"><span>Before Lune offer</span><strong>${money(price)}</strong></div><div class="summary-row"><span>Lune offer</span><strong>− ${money(discount)}</strong></div>`:''}<div class="summary-row"><span>${discount?'Estimate after offer':'Estimate'}</span><strong>${price?money(price-discount):'—'}</strong></div>`;
  }

  async function chooseFallback(){
    const block=document.createElement('div');block.dataset.pickFirst='1';block.className='ops-card';block.style.marginBottom='24px';
    block.innerHTML='<div class="eyebrow">START HERE</div><h3>Pick a finished set.</h3><p class="ops-muted">A few strong directions are here so the reservation never starts from a blank page.</p><div class="match-list" data-fallback-list><div class="ops-muted">Loading…</div></div>';
    $('[data-step="1"]')?.prepend(block);
    try{
      const data=await request('/catalog/work');
      const items=(data.items||[]).slice(0,4);
      const list=block.querySelector('[data-fallback-list]');
      if(!items.length){list.innerHTML='<a class="text-link" href="inspo.html">Start with inspo <span class="arrow">→</span></a>';return;}
      list.innerHTML=items.map(item=>`<button type="button" class="match-card" data-fallback-id="${esc(item.id)}"><span><strong>${esc(item.title)}</strong><span class="match-meta">${esc(item.style||item.category||'')}</span></span><span class="match-state">${money(item.price_kes)}</span></button>`).join('');
      list.addEventListener('click',async e=>{const button=e.target.closest('[data-fallback-id]');if(!button)return;state.itemKind='work';state.itemId=button.dataset.fallbackId;await loadItem();block.remove();});
    }catch(_){block.querySelector('[data-fallback-list]').innerHTML='<a class="text-link" href="work.html">See finished work <span class="arrow">→</span></a>';}
  }

  async function loadReorder(){
    const reorder=params.get('reorder');if(!reorder)return false;
    const query=new URLSearchParams({visitorId:visitorId()});if(state.reorderToken)query.set('token',state.reorderToken);
    const data=await request(`/orders/${encodeURIComponent(reorder)}/reorder?${query}`);
    const seed=data.seed||{};
    state.itemKind=seed.itemKind;state.itemId=seed.itemId;state.previousLocationId=seed.preferredLocationId||null;state.previousLocationName=seed.preferredLocationName||null;state.sourceOrderId=seed.sourceOrderId||reorder;
    if(state.previousLocationId){$('[data-same-option]')?.classList.remove('ops-hidden');const radio=form.querySelector('input[name="experience"][value="same"]');if(radio){radio.checked=true;syncExperienceCards();}}
    return true;
  }

  async function loadItem(){
    if(!state.itemKind||!state.itemId){renderLook();renderSummary();return chooseFallback();}
    try{
      const data=await request(`/booking/item?kind=${encodeURIComponent(state.itemKind)}&id=${encodeURIComponent(state.itemId)}`);
      state.item=data.item;state.service=data.service;renderLook();renderSummary();
      const image=state.item?.imageUrl||state.item?.image_url; if(image) document.documentElement.style.setProperty('--booking-image',`url("${String(image).replace(/"/g,'')}")`);
    }catch(err){
      const unavailable = Number(err?.status) === 404;
      status(
        $('[data-step="1"] [data-step-status]'),
        unavailable ? 'That look is no longer available. Pick another direction.' : 'Lune could not load this direction right now. Try again shortly, or choose another set.',
        true
      );
      state.item=null;renderLook();chooseFallback();
    }
  }

  function syncExperienceCards(){
    $$('.experience-option').forEach(label=>label.classList.toggle('is-selected',Boolean(label.querySelector('input')?.checked)));renderSummary();
  }

  async function findMatches(){
    const when=scheduledIso();if(!when)return status($('[data-step="3"] [data-step-status]'),'Choose the date and time first.',true);
    if(!state.item)return status($('[data-step="3"] [data-step-status]'),'Choose a set first.',true);
    const button=$('[data-find-matches]');button.disabled=true;status($('[data-location-status]'),'Looking at capability, availability and distance…');
    const query=new URLSearchParams({kind:state.itemKind,id:state.itemId,scheduledFor:when,experience:experience(),area:currentArea()});
    if(form.elements.latitude.value)query.set('lat',form.elements.latitude.value);if(form.elements.longitude.value)query.set('lng',form.elements.longitude.value);
    if(experience()==='same'&&state.previousLocationId)query.set('preferredLocationId',state.previousLocationId);
    try{
      const data=await request(`/booking/matches?${query}`);state.matches=data.matches||[];state.service=data.service||state.service;renderMatches();status($('[data-location-status]'),state.matches.length?'Suitable stations found.':'No confirmed station is showing for this exact time yet.');
    }catch(err){state.matches=[];renderMatches();status($('[data-location-status]'),'Lune could not check stations right now. You can still continue and we will route it for attention.',true);}finally{button.disabled=false;renderSummary();}
  }

  function renderMatches(){
    const region=$('[data-match-region]'),list=$('[data-match-list]');region?.classList.remove('ops-hidden');
    if(!list)return;
    if(!state.matches.length){list.innerHTML='<div class="ops-empty">No confirmed match is visible for this exact moment. Try another time, or continue and Lune will keep the request in the operations queue instead of dropping it.</div>';}
    else list.innerHTML=state.matches.map(m=>`<button type="button" class="match-card ${state.selectedLocationId===m.locationId?'is-selected':''}" data-location-id="${esc(m.locationId)}"><span><strong>${esc(m.name)}</strong><span class="match-meta">${esc(m.area||m.address||'Nairobi')}${m.distanceKm!=null?` · ${m.distanceKm} km`:''}</span></span><span class="match-state">${m.availability==='available'?'Available':m.availability==='confirming'?'Confirming':'Ask first'}</span></button>`).join('');
    const same=experience()==='same'&&state.previousLocationId;const previous=state.matches.find(m=>m.locationId===state.previousLocationId);const uncertain=same&&(!previous||previous.availability!=='available');
    $('[data-same-warning]')?.classList.toggle('ops-hidden',!uncertain);$('[data-force-same-wrap]')?.classList.toggle('ops-hidden',!uncertain);
  }

  function useLocation(){
    const node=$('[data-location-status]');if(!navigator.geolocation)return status(node,'Location is not available in this browser. Type your area instead.',true);
    status(node,'Finding you…');
    navigator.geolocation.getCurrentPosition(pos=>{form.elements.latitude.value=pos.coords.latitude.toFixed(7);form.elements.longitude.value=pos.coords.longitude.toFixed(7);status(node,'Location added. Lune will use it only for this match.');findMatches();},()=>status(node,'Location was not shared. Type your area and continue.',true),{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
  }

  function validateStep(step){
    const node=$(`[data-step="${step}"] [data-step-status]`);status(node,'');
    if(step===1){const when=scheduledIso();if(!state.item)return status(node,'Choose a set first.',true),false;if(!when||new Date(when).getTime()<Date.now()+15*60000)return status(node,'Choose a valid future date and time.',true),false;}
    if(step===3&&!currentArea()&&!form.elements.latitude.value&&!state.selectedLocationId)return status(node,'Add an area, share your location, or choose a station.',true),false;
    return true;
  }

  function finalSummary(){
    const target=$('[data-final-summary]');if(!target)return;
    const match=state.matches.find(m=>m.locationId===state.selectedLocationId);const title=state.item?.title||state.item?.style||'Your set';
    const base=state.item&&state.service?(state.itemKind==='work'&&Number(state.item.priceKes||state.item.price_kes)>0?Number(state.item.priceKes||state.item.price_kes):Number(state.service.basePriceKes||state.service.base_price_kes)):0;const fee=experience()==='select'?500:0;
    const total=base+fee,discount=offerDiscount(total);target.innerHTML=`<div class="eyebrow">BEFORE LUNE SENDS IT</div><h3>${esc(title)}</h3><div class="summary-list"><div class="summary-row"><span>Time</span><strong>${esc(new Date(scheduledIso()).toLocaleString('en-KE',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))}</strong></div><div class="summary-row"><span>Routing</span><strong>${esc(match?match.name:(experience()==='same'&&state.previousLocationName?state.previousLocationName:'Lune chooses'))}</strong></div>${fee?`<div class="summary-row"><span>Lune Select</span><strong>+ KSh 500</strong></div>`:''}${discount?`<div class="summary-row"><span>Before Lune offer</span><strong>${money(total)}</strong></div><div class="summary-row"><span>Lune offer applied</span><strong>− ${money(discount)}</strong></div>`:''}<div class="summary-row"><span>${discount?'Total after offer':'Estimate'}</span><strong>${base?money(total-discount):'—'}</strong></div><div class="summary-row"><span>Payment</span><strong>After station acceptance</strong></div></div>`;
  }

  function storeOrderToken(orderId,accessToken){
    try{const map=JSON.parse(localStorage.getItem('lune_order_tokens_v1')||'{}');map[orderId]=accessToken;localStorage.setItem('lune_order_tokens_v1',JSON.stringify(map));}catch(_){}
  }

  async function submit(event){
    event.preventDefault();if(state.loading)return;if(!validateStep(3)||!state.item)return;
    const node=$('[data-submit-status]');status(node,'');
    const email=form.elements.customerEmail.value.trim(),phone=form.elements.customerPhone.value.trim();if(!email||!phone)return status(node,'Email and phone keep the reservation reachable.',true);
    state.loading=true;$('[data-submit]').disabled=true;status(node,'Securing the request…');
    const manualLocation=state.manualSelected?state.selectedLocationId:null;const same=experience()==='same'&&state.previousLocationId;
    const preferredLocationId=manualLocation||(same?state.previousLocationId:null);const forceSame=Boolean(form.elements.forceSame?.checked);const forcePreferred=Boolean(manualLocation||forceSame);
    const payload={
      visitorId:visitorId(),itemKind:state.itemKind,itemId:state.itemId,scheduledFor:scheduledIso(),experiencePreference:experience(),
      preferredLocationId,forcePreferredLocation:forcePreferred,customerName:form.elements.customerName.value.trim(),customerEmail:email,customerPhone:phone,
      area:currentArea(),latitude:form.elements.latitude.value?Number(form.elements.latitude.value):null,longitude:form.elements.longitude.value?Number(form.elements.longitude.value):null,
      offerCode:form.elements.offerCode?.value||null,partySize:Math.max(1,Math.min(4,Number(form.elements.groupSize?.value||1))),sourceOrderId:state.sourceOrderId,source:params.get('source')||params.get('ref')||'booking',referralCode:params.get('referral')||null
    };
    try{
      if(window.LuneTaste?.track)window.LuneTaste.track(state.sourceOrderId?'reorder':'book',{...state.item,kind:state.itemKind,id:state.itemId},{surface:'booking'});
      const data=await request('/orders',{method:'POST',body:payload});storeOrderToken(data.id,data.token);
      const url=new URL('order.html',location.href);url.searchParams.set('id',data.id);url.searchParams.set('token',data.token);location.href=url.toString();
    }catch(err){status(node,{valid_future_schedule_required:'That time is no longer valid.',valid_email_required:'Use a valid email address.',phone_required:'Add a phone number.',service_unavailable:'That service is temporarily unavailable.'}[err.message]||'Lune could not create the reservation. Nothing was charged. Try again.',true);state.loading=false;$('[data-submit]').disabled=false;}
  }

  async function continuity(){
    try{
      const query=new URLSearchParams({visitorId:visitorId()});const data=await request(`/continuity?${query}`);
      state.offer=data.offer||null;if(state.offer&&!params.get('offer')){const field=$('[data-offer-field]');field?.classList.remove('ops-hidden');form.elements.offerCode.value=state.offer.code;const note=document.createElement('p');note.className='ops-muted';note.textContent=`${state.offer.copy||state.offer.title||'Lune offer'} The total below includes it.`;field?.appendChild(note);}else if(params.get('offer')){const field=$('[data-offer-field]');field?.classList.remove('ops-hidden');form.elements.offerCode.value=params.get('offer');}
    }catch(_){}
  }

  async function prefillIdentity(){
    let tries=0;while(!window.LuneData&&tries++<30)await new Promise(r=>setTimeout(r,100));
    if(window.LuneData?.ready)await window.LuneData.ready.catch(()=>{});const user=window.LuneData?.user;if(user){form.elements.customerName.value=user.displayName||'';form.elements.customerEmail.value=user.email||'';form.elements.customerPhone.value=user.phone||'';}
  }

  function groupNudge(){
    if(params.get('group')||sessionStorage.getItem('lune_group_nudge'))return;
    sessionStorage.setItem('lune_group_nudge','1');const nudge=document.createElement('aside');nudge.className='experience-nudge';nudge.innerHTML='<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>COMING TOGETHER?</small><h3>The experience is better in person.</h3><p>Bring a friend and let Lune coordinate the time with the station.</p><button class="text-link" type="button">Plan it together <span class="arrow">→</span></button>';document.body.appendChild(nudge);nudge.querySelector('.experience-nudge-close').addEventListener('click',()=>nudge.remove());nudge.querySelector('.text-link').addEventListener('click',()=>{const group=form.elements.groupSize;if(group){group.value='2';group.dispatchEvent(new Event('change'));}nudge.remove();});requestAnimationFrame(()=>nudge.classList.add('show'));
  }

  function wire(){
    $$('[data-next]').forEach(btn=>btn.addEventListener('click',()=>{if(validateStep(state.step)){if(state.step===3)finalSummary();setStep(state.step+1);}}));
    $$('[data-back]').forEach(btn=>btn.addEventListener('click',()=>setStep(state.step-1)));
    $$('input[name="experience"]').forEach(input=>input.addEventListener('change',()=>{syncExperienceCards();state.selectedLocationId=null;state.manualSelected=false;if(state.step>=3)findMatches();}));
    $('[data-location]')?.addEventListener('click',useLocation);$('[data-find-matches]')?.addEventListener('click',findMatches);
    $('[data-match-list]')?.addEventListener('click',e=>{const card=e.target.closest('[data-location-id]');if(!card)return;state.selectedLocationId=card.dataset.locationId;state.manualSelected=true;renderMatches();renderSummary();});
    $('[data-auto-match]')?.addEventListener('click',()=>{state.selectedLocationId=null;state.manualSelected=false;renderMatches();renderSummary();});
    form.addEventListener('input',renderSummary);form.addEventListener('submit',submit);
  }

  async function boot(){
    const today=new Date();form.elements.date.min=today.toISOString().slice(0,10);form.elements.date.value=params.get('date')||'';form.elements.time.value=params.get('time')||'';
    wire();await prefillIdentity();await loadReorder().catch(()=>false);await loadItem();await continuity();renderSummary();setTimeout(groupNudge,2600);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
