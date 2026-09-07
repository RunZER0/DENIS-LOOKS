(() => {
  const KEY='lune_admin_state_v1';
  const now=()=>new Date();
  const money=n=>`Ksh ${Number(n||0).toLocaleString()}`;
  const dateTime=v=>new Date(v).toLocaleString('en-KE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const uid=p=>`${p}_${Math.random().toString(36).slice(2,8)}`;

  const seed={
    partners:[
      {id:'p_01',name:'Nia Beauty House',area:'Westlands',status:'active',quality:4.8,acceptance:94,lateRate:3,openRequests:1,locations:['loc_01','loc_02'],contact:'ops@niabeauty.test'},
      {id:'p_02',name:'Studio Kora',area:'Kilimani',status:'active',quality:4.7,acceptance:91,lateRate:5,openRequests:0,locations:['loc_03'],contact:'bookings@studiokora.test'},
      {id:'p_03',name:'Mira Nail Bar',area:'Roysambu',status:'review',quality:4.2,acceptance:84,lateRate:11,openRequests:2,locations:['loc_04'],contact:'hello@miranails.test'}
    ],
    locations:[
      {id:'loc_01',name:'Nia Westlands',area:'Westlands',partnerId:'p_01',experience:['Lune Select','Calm'],capacity:7,status:'active'},
      {id:'loc_02',name:'Nia Parklands',area:'Parklands',partnerId:'p_01',experience:['Closest','Calm'],capacity:5,status:'active'},
      {id:'loc_03',name:'Kora Kilimani',area:'Kilimani',partnerId:'p_02',experience:['Lune Select','Closest'],capacity:6,status:'active'},
      {id:'loc_04',name:'Mira Roysambu',area:'Roysambu',partnerId:'p_03',experience:['Closest'],capacity:4,status:'limited'}
    ],
    technicians:[
      {id:'t_01',name:'Wanjiku N.',partnerId:'p_01',locationId:'loc_01',status:'active',rating:4.9,skills:['Natural','French','Chrome','3D']},
      {id:'t_02',name:'Achieng M.',partnerId:'p_01',locationId:'loc_02',status:'active',rating:4.7,skills:['Natural','French','Structure']},
      {id:'t_03',name:'Mercy K.',partnerId:'p_02',locationId:'loc_03',status:'active',rating:4.8,skills:['Chrome','3D','Stiletto','Structure']},
      {id:'t_04',name:'Faith W.',partnerId:'p_03',locationId:'loc_04',status:'review',rating:4.2,skills:['Natural','French']}
    ],
    orders:[
      {id:'LN-1048',customer:'Njeri W.',customerId:'c_01',look:'Clean Minimalist Chrome',experience:'Lune Select',partnerId:'p_02',locationId:'loc_03',when:new Date(Date.now()+7200000).toISOString(),status:'confirmed',amount:950},
      {id:'LN-1049',customer:'Amina J.',customerId:'c_02',look:'Classic Parisian French',experience:'Closest',partnerId:'p_01',locationId:'loc_02',when:new Date(Date.now()+14400000).toISOString(),status:'matching',amount:800},
      {id:'LN-1050',customer:'Lydia M.',customerId:'c_03',look:'Liquid Chrome & 3D Drops',experience:'Lune Select',partnerId:'p_01',locationId:'loc_01',when:new Date(Date.now()+86400000).toISOString(),status:'partner_accepted',amount:1200},
      {id:'LN-1046',customer:'Sharon T.',customerId:'c_04',look:'Milky Quartz Natural Ombré',experience:'Same place again',partnerId:'p_03',locationId:'loc_04',when:new Date(Date.now()-86400000).toISOString(),status:'issue',amount:400},
      {id:'LN-1045',customer:'Wambui R.',customerId:'c_05',look:'Soft Nude French Curve',experience:'Calm',partnerId:'p_02',locationId:'loc_03',when:new Date(Date.now()-172800000).toISOString(),status:'completed',amount:1000}
    ],
    payments:[
      {id:'PSK_80021',orderId:'LN-1048',customer:'Njeri W.',amount:950,provider:'Paystack',status:'success',at:new Date(Date.now()-3600000).toISOString()},
      {id:'PSK_80019',orderId:'LN-1050',customer:'Lydia M.',amount:1200,provider:'Paystack',status:'success',at:new Date(Date.now()-5400000).toISOString()},
      {id:'PSK_80018',orderId:'LN-1046',customer:'Sharon T.',amount:400,provider:'Paystack',status:'success',at:new Date(Date.now()-90000000).toISOString()},
      {id:'PSK_80017',orderId:'LN-1045',customer:'Wambui R.',amount:1000,provider:'Paystack',status:'success',at:new Date(Date.now()-180000000).toISOString()}
    ],
    payouts:[
      {id:'po_01',partnerId:'p_01',period:'Sep 1–7',gross:2150,lune:430,adjustments:0,payable:1720,status:'pending'},
      {id:'po_02',partnerId:'p_02',period:'Sep 1–7',gross:1950,lune:390,adjustments:-100,payable:1460,status:'pending'},
      {id:'po_03',partnerId:'p_03',period:'Sep 1–7',gross:400,lune:80,adjustments:0,payable:320,status:'hold'}
    ],
    customers:[
      {id:'c_01',name:'Njeri W.',last:'2026-09-07',orders:5,spend:5100,saved:12,preference:'Chrome · short · structured',state:'returning'},
      {id:'c_02',name:'Amina J.',last:'2026-09-04',orders:2,spend:1600,saved:7,preference:'French · almond · nude',state:'active'},
      {id:'c_03',name:'Lydia M.',last:'2026-09-01',orders:3,spend:3600,saved:18,preference:'3D · chrome · statement',state:'active'},
      {id:'c_04',name:'Sharon T.',last:'2026-09-06',orders:1,spend:400,saved:3,preference:'Natural · soft · short',state:'recovery'},
      {id:'c_05',name:'Wambui R.',last:'2026-09-05',orders:7,spend:6800,saved:9,preference:'French · calm · medium',state:'loyal'}
    ],
    offers:[
      {id:'of_01',name:'Saved shortlist return',trigger:'Saved ≥ 3 · no booking in 7 days',message:'Your shortlist is still here.',action:'Open saved',status:'active'},
      {id:'of_02',name:'Favourite station opening',trigger:'Preferred station gains weekend capacity',message:'Your usual spot has room this weekend.',action:'See times',status:'active'},
      {id:'of_03',name:'First booking recovery',trigger:'Payment abandoned',message:'Your set is still waiting.',action:'Continue booking',status:'paused'}
    ],
    recommendation:{affinity:64,quality:14,novelty:22,categoryCap:2,exploration:true,decay:true},
    curation:{work:{},inspo:{}},
    audit:[]
  };

  const clone=o=>JSON.parse(JSON.stringify(o));
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return saved?{...clone(seed),...saved}:clone(seed);}catch(_){return clone(seed);}}
  let state=load();
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(state));
  const audit=(action,entity,id)=>{state.audit.unshift({id:uid('log'),action,entity,entityId:id,at:new Date().toISOString()});state.audit=state.audit.slice(0,100);persist();};
  const partner=id=>state.partners.find(x=>x.id===id);
  const location=id=>state.locations.find(x=>x.id===id);
  const techsFor=p=>state.technicians.filter(x=>x.partnerId===p);

  const toast=msg=>{const el=document.querySelector('.admin-toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2200);};
  const statusClass=s=>['active','success','confirmed','completed','partner_accepted','returning','loyal'].includes(s)?'good':['review','matching','pending','limited','active'].includes(s)?'warn':['issue','hold','suspended','failed','recovery'].includes(s)?'bad':'';
  const statusLabel=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());

  function metrics(){
    const live=state.orders.filter(x=>['matching','partner_accepted','confirmed'].includes(x.status)).length;
    const gmv=state.payments.filter(x=>x.status==='success').reduce((s,x)=>s+x.amount,0);
    const active=state.partners.filter(x=>x.status==='active').length;
    const quality=(state.partners.reduce((s,x)=>s+x.quality,0)/Math.max(1,state.partners.length)).toFixed(1);
    return [
      ['Live bookings',live,'Across matching and confirmed'],
      ['Captured',money(gmv),'Recorded payments'],
      ['Active partners',active,`${state.locations.filter(x=>x.status==='active').length} active locations`],
      ['Network quality',quality,'Partner average / 5']
    ];
  }

  function renderOverview(){
    document.getElementById('metric-grid').innerHTML=metrics().map(m=>`<article class="metric"><span>${m[0]}</span><strong>${m[1]}</strong><small>${m[2]}</small></article>`).join('');
    const attention=state.orders.filter(x=>['matching','issue','partner_accepted'].includes(x.status)).slice(0,5);
    document.getElementById('attention-orders').innerHTML=`<div class="attention-list">${attention.map(o=>`<div class="attention-row"><div><b>${o.id} · ${o.customer}</b><span>${o.look}</span></div><button class="row-action" data-order-open="${o.id}">${statusLabel(o.status)} →</button></div>`).join('')||'<p>No orders need attention.</p>'}</div>`;
    document.getElementById('partner-pulse').innerHTML=`<div class="pulse-list">${state.partners.map(p=>`<div class="pulse-row"><div><b>${p.name}</b><span>${p.area} · ${p.acceptance}% acceptance</span></div><span class="status ${statusClass(p.status)}">${statusLabel(p.status)}</span></div>`).join('')}</div>`;
    const late=(state.partners.reduce((s,p)=>s+p.lateRate,0)/Math.max(1,state.partners.length)).toFixed(1);
    const accept=(state.partners.reduce((s,p)=>s+p.acceptance,0)/Math.max(1,state.partners.length)).toFixed(0);
    document.getElementById('quality-strip').innerHTML=[['4.6','Customer rating'],[`${accept}%`,'Partner acceptance'],[`${late}%`,'Late-start rate'],['1','Open service issue']].map(x=>`<div class="quality-item"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
  }

  let orderFilter='all';
  function filteredOrders(){if(orderFilter==='all')return state.orders;if(orderFilter==='issue')return state.orders.filter(x=>x.status==='issue');if(orderFilter==='completed')return state.orders.filter(x=>x.status==='completed');if(orderFilter==='confirmed')return state.orders.filter(x=>['confirmed','partner_accepted'].includes(x.status));return state.orders.filter(x=>x.status===orderFilter);}
  function renderOrders(){document.getElementById('orders-body').innerHTML=filteredOrders().map(o=>`<tr><td><strong>${o.id}</strong></td><td>${o.customer}</td><td>${o.look}</td><td>${o.experience}</td><td>${partner(o.partnerId)?.name||'—'}</td><td>${dateTime(o.when)}</td><td><span class="status ${statusClass(o.status)}">${statusLabel(o.status)}</span></td><td><button class="row-action" data-order-open="${o.id}">Open</button></td></tr>`).join('');}

  function renderPartners(){document.getElementById('partners-grid').innerHTML=state.partners.map(p=>`<article class="ops-card"><div class="ops-card-head"><div><span class="admin-kicker">${p.area}</span><h3>${p.name}</h3><p>${p.locations.length} location${p.locations.length===1?'':'s'} · ${techsFor(p.id).length} technicians</p></div><span class="status ${statusClass(p.status)}">${statusLabel(p.status)}</span></div><div class="ops-meta"><div><span>Quality</span><b>${p.quality}/5</b></div><div><span>Acceptance</span><b>${p.acceptance}%</b></div><div><span>Late</span><b>${p.lateRate}%</b></div><div><span>Requests</span><b>${p.openRequests}</b></div></div><div class="ops-actions"><button class="admin-secondary" data-partner-open="${p.id}">Open</button><button class="admin-secondary" data-partner-toggle="${p.id}">${p.status==='suspended'?'Activate':'Suspend'}</button></div></article>`).join('');}
  function renderLocations(){document.getElementById('locations-body').innerHTML=state.locations.map(l=>`<tr><td><strong>${l.name}</strong></td><td>${l.area}</td><td>${partner(l.partnerId)?.name||'—'}</td><td>${l.experience.join(' · ')}</td><td>${l.capacity} slots/day</td><td><span class="status ${statusClass(l.status)}">${statusLabel(l.status)}</span></td></tr>`).join('');}
  function renderTechnicians(){document.getElementById('technicians-grid').innerHTML=state.technicians.map(t=>`<article class="ops-card"><div class="ops-card-head"><div><span class="admin-kicker">${location(t.locationId)?.area||''}</span><h3>${t.name}</h3><p>${partner(t.partnerId)?.name||'—'}</p></div><span class="status ${statusClass(t.status)}">${statusLabel(t.status)}</span></div><div class="ops-meta"><div><span>Rating</span><b>${t.rating}/5</b></div><div><span>Skills</span><b>${t.skills.length}</b></div></div><p style="margin-top:16px">${t.skills.join(' · ')}</p><div class="ops-actions"><button class="admin-secondary" data-tech-toggle="${t.id}">${t.status==='suspended'?'Activate':'Suspend'}</button></div></article>`).join('');}

  function renderPayments(){
    const captured=state.payments.filter(x=>x.status==='success').reduce((s,x)=>s+x.amount,0),failed=state.payments.filter(x=>x.status==='failed').length,pending=state.orders.filter(x=>x.status==='payment_pending').length;
    document.getElementById('payment-metrics').innerHTML=[['Captured',money(captured),'Successful payments'],['Pending',pending,'Orders waiting for payment'],['Failed',failed,'Needs recovery']].map(m=>`<article class="metric"><span>${m[0]}</span><strong>${m[1]}</strong><small>${m[2]}</small></article>`).join('');
    document.getElementById('payments-body').innerHTML=state.payments.map(p=>`<tr><td><strong>${p.id}</strong></td><td>${p.orderId}</td><td>${p.customer}</td><td>${money(p.amount)}</td><td>${p.provider}</td><td><span class="status ${statusClass(p.status)}">${statusLabel(p.status)}</span></td><td>${dateTime(p.at)}</td></tr>`).join('');
  }
  function renderPayouts(){document.getElementById('payouts-body').innerHTML=state.payouts.map(p=>`<tr><td><strong>${partner(p.partnerId)?.name||'—'}</strong></td><td>${p.period}</td><td>${money(p.gross)}</td><td>${money(p.lune)}</td><td>${money(p.adjustments)}</td><td>${money(p.payable)}</td><td><span class="status ${statusClass(p.status)}">${statusLabel(p.status)}</span></td></tr>`).join('');}
  function renderCustomers(){document.getElementById('customers-body').innerHTML=state.customers.map(c=>`<tr><td><strong>${c.name}</strong></td><td>${c.last}</td><td>${c.orders}</td><td>${money(c.spend)}</td><td>${c.saved}</td><td>${c.preference}</td><td><span class="status ${statusClass(c.state)}">${statusLabel(c.state)}</span></td></tr>`).join('');}

  let curationTab='work';
  function renderCuration(){
    const items=curationTab==='work'?(window.LuneCatalog?.work||[]):(window.LuneCatalog?.inspo||[]);
    document.getElementById('curation-grid').innerHTML=items.map(i=>{const cfg=state.curation[curationTab][i.id]||{active:true,priority:false};const img=curationTab==='work'?i.imageUrl:i.img;return `<article class="curation-card"><figure><img src="${img}" alt="${i.title||i.style}" loading="lazy"></figure><div class="curation-copy"><small>${i.category}</small><h3>${i.title||i.style}</h3><div class="curation-actions"><label class="mini-switch"><input type="checkbox" data-curation-active="${i.id}" ${cfg.active!==false?'checked':''}> Live</label><label class="mini-switch"><input type="checkbox" data-curation-priority="${i.id}" ${cfg.priority?'checked':''}> Feature</label></div></div></article>`;}).join('');
  }
  function renderOffers(){document.getElementById('offers-grid').innerHTML=state.offers.map(o=>`<article class="ops-card"><div class="ops-card-head"><div><span class="admin-kicker">${o.trigger}</span><h3>${o.name}</h3><p>${o.message}</p></div><span class="status ${statusClass(o.status)}">${statusLabel(o.status)}</span></div><div class="ops-meta"><div><span>Action</span><b>${o.action}</b></div><div><span>State</span><b>${statusLabel(o.status)}</b></div></div><div class="ops-actions"><button class="admin-secondary" data-offer-toggle="${o.id}">${o.status==='active'?'Pause':'Activate'}</button></div></article>`).join('');}
  function renderReco(){const form=document.getElementById('reco-form');Object.entries(state.recommendation).forEach(([k,v])=>{const input=form.elements[k];if(!input)return;if(input.type==='checkbox')input.checked=!!v;else input.value=v;const out=form.querySelector(`[data-output="${k}"]`);if(out)out.value=k==='categoryCap'?v:`${v}%`;});}

  function renderCounts(){document.querySelector('[data-count="orders"]').textContent=state.orders.length;document.querySelector('[data-count="partners"]').textContent=state.partners.length;document.querySelector('[data-count="locations"]').textContent=state.locations.length;document.querySelector('[data-count="technicians"]').textContent=state.technicians.length;}
  function renderAll(){renderCounts();renderOverview();renderOrders();renderPartners();renderLocations();renderTechnicians();renderPayments();renderPayouts();renderCustomers();renderCuration();renderOffers();renderReco();}

  const titles={overview:['NETWORK','Overview'],orders:['FULFILMENT','Orders'],partners:['SUPPLY','Partners'],locations:['NETWORK','Locations'],technicians:['CAPABILITY','Technicians'],payments:['MONEY','Payments'],payouts:['SETTLEMENTS','Payouts'],customers:['RETENTION','Customers'],curation:['DISCOVERY','Curation'],offers:['RETENTION','Offers'],recommendations:['TASTE ENGINE','Recommendations']};
  function openView(view){document.querySelectorAll('.admin-view').forEach(x=>x.classList.toggle('active',x.dataset.viewPanel===view));document.querySelectorAll('.admin-nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));document.querySelector('[data-view-kicker]').textContent=titles[view]?.[0]||'LUNE';document.querySelector('[data-view-title]').textContent=titles[view]?.[1]||view;document.querySelector('.admin-sidebar').classList.remove('open');history.replaceState({},'',`#${view}`);}

  function openOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const p=partner(o.partnerId),l=location(o.locationId);openDrawer(`<span class="admin-kicker">ORDER ${o.id}</span><h2 class="drawer-title">${o.look}</h2><p>${o.customer} · ${o.experience}</p><div class="drawer-section"><h4>Booking</h4><div class="drawer-row"><span>Status</span><b>${statusLabel(o.status)}</b></div><div class="drawer-row"><span>When</span><b>${dateTime(o.when)}</b></div><div class="drawer-row"><span>Value</span><b>${money(o.amount)}</b></div></div><div class="drawer-section"><h4>Fulfilment</h4><div class="drawer-row"><span>Partner</span><b>${p?.name||'Matching'}</b></div><div class="drawer-row"><span>Location</span><b>${l?.name||'—'}</b></div></div><div class="drawer-section"><h4>Actions</h4><div class="ops-actions"><button class="admin-secondary" data-order-status="${o.id}|confirmed">Confirm</button><button class="admin-secondary" data-order-status="${o.id}|issue">Flag issue</button><button class="admin-secondary" data-order-status="${o.id}|completed">Complete</button></div></div>`);}
  function openPartner(id){const p=partner(id);if(!p)return;openDrawer(`<span class="admin-kicker">PARTNER</span><h2 class="drawer-title">${p.name}</h2><p>${p.area} · ${p.contact}</p><div class="drawer-section"><h4>Performance</h4><div class="drawer-row"><span>Quality</span><b>${p.quality}/5</b></div><div class="drawer-row"><span>Acceptance</span><b>${p.acceptance}%</b></div><div class="drawer-row"><span>Late starts</span><b>${p.lateRate}%</b></div></div><div class="drawer-section"><h4>Network</h4><div class="drawer-row"><span>Locations</span><b>${p.locations.length}</b></div><div class="drawer-row"><span>Technicians</span><b>${techsFor(p.id).length}</b></div><div class="drawer-row"><span>Open requests</span><b>${p.openRequests}</b></div></div><div class="drawer-section"><h4>Control</h4><button class="admin-secondary" data-partner-toggle="${p.id}">${p.status==='suspended'?'Activate partner':'Suspend partner'}</button></div>`);}
  function openDrawer(html){const d=document.getElementById('admin-drawer');d.querySelector('[data-drawer-content]').innerHTML=html;d.classList.add('open');d.setAttribute('aria-hidden','false');}
  function closeDrawer(){const d=document.getElementById('admin-drawer');d.classList.remove('open');d.setAttribute('aria-hidden','true');}

  const field=(name,label,type='text',extra='')=>`<label class="${extra.includes('wide')?'wide':''}">${label}<input name="${name}" type="${type}" ${extra.replace('wide','')} required></label>`;
  let dialogMode='';
  function openDialog(mode){dialogMode=mode;const d=document.getElementById('admin-dialog'),fields=d.querySelector('[data-dialog-fields]'),title=d.querySelector('[data-dialog-title]');d.querySelector('[data-dialog-kicker]').textContent='NEW';
    if(mode==='partner'){title.textContent='Partner';fields.innerHTML=field('name','Partner name')+field('area','Primary area')+field('contact','Operations email','email','wide');}
    if(mode==='location'){title.textContent='Location';fields.innerHTML=field('name','Location name')+field('area','Area')+`<label>Partner<select name="partnerId">${state.partners.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label>`+field('capacity','Daily capacity','number');}
    if(mode==='technician'){title.textContent='Technician';fields.innerHTML=field('name','Name')+`<label>Partner<select name="partnerId">${state.partners.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label>`+`<label>Location<select name="locationId">${state.locations.map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}</select></label>`+field('skills','Skills, comma separated','text','wide');}
    if(mode==='offer'){title.textContent='Offer';fields.innerHTML=field('name','Offer name')+field('trigger','Trigger')+field('message','Message','text','wide')+field('action','Action label','text','wide');}
    d.showModal();
  }
  function saveDialog(form){const fd=new FormData(form);if(dialogMode==='partner'){const id=uid('p');state.partners.push({id,name:fd.get('name'),area:fd.get('area'),contact:fd.get('contact'),status:'active',quality:5,acceptance:100,lateRate:0,openRequests:0,locations:[]});audit('created','partner',id);}
    if(dialogMode==='location'){const id=uid('loc'),partnerId=fd.get('partnerId');state.locations.push({id,name:fd.get('name'),area:fd.get('area'),partnerId,experience:['Closest'],capacity:Number(fd.get('capacity')||4),status:'active'});const p=partner(partnerId);if(p&&!p.locations.includes(id))p.locations.push(id);audit('created','location',id);}
    if(dialogMode==='technician'){const id=uid('t');state.technicians.push({id,name:fd.get('name'),partnerId:fd.get('partnerId'),locationId:fd.get('locationId'),status:'active',rating:5,skills:String(fd.get('skills')||'').split(',').map(x=>x.trim()).filter(Boolean)});audit('created','technician',id);}
    if(dialogMode==='offer'){const id=uid('of');state.offers.push({id,name:fd.get('name'),trigger:fd.get('trigger'),message:fd.get('message'),action:fd.get('action'),status:'active'});audit('created','offer',id);}
    persist();renderAll();toast('Saved.');}

  function wire(){
    document.querySelectorAll('.admin-nav-item').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.view)));
    document.addEventListener('click',e=>{
      const jump=e.target.closest('[data-jump]');if(jump){openView(jump.dataset.jump);return;}
      const oo=e.target.closest('[data-order-open]');if(oo){openOrder(oo.dataset.orderOpen);return;}
      const po=e.target.closest('[data-partner-open]');if(po){openPartner(po.dataset.partnerOpen);return;}
      const pt=e.target.closest('[data-partner-toggle]');if(pt){const p=partner(pt.dataset.partnerToggle);if(p){p.status=p.status==='suspended'?'active':'suspended';audit('status changed','partner',p.id);persist();renderAll();toast(p.status==='suspended'?'Partner suspended.':'Partner active.');closeDrawer();}return;}
      const tt=e.target.closest('[data-tech-toggle]');if(tt){const t=state.technicians.find(x=>x.id===tt.dataset.techToggle);if(t){t.status=t.status==='suspended'?'active':'suspended';audit('status changed','technician',t.id);persist();renderAll();toast(t.status==='suspended'?'Technician suspended.':'Technician active.');}return;}
      const ot=e.target.closest('[data-offer-toggle]');if(ot){const o=state.offers.find(x=>x.id===ot.dataset.offerToggle);if(o){o.status=o.status==='active'?'paused':'active';audit('status changed','offer',o.id);persist();renderOffers();toast(o.status==='active'?'Offer active.':'Offer paused.');}return;}
      const os=e.target.closest('[data-order-status]');if(os){const [id,status]=os.dataset.orderStatus.split('|'),o=state.orders.find(x=>x.id===id);if(o){o.status=status;audit('status changed','order',id);persist();renderAll();openOrder(id);toast(`Order ${statusLabel(status).toLowerCase()}.`);}return;}
      const add=e.target.closest('[data-add]');if(add){openDialog(add.dataset.add);return;}
      if(e.target.closest('[data-quick-action]')){openDialog('partner');return;}
      if(e.target.closest('[data-drawer-close]')){closeDrawer();return;}
      if(e.target.closest('[data-menu-toggle]')){document.querySelector('.admin-sidebar').classList.toggle('open');return;}
      if(e.target.closest('[data-run-payouts]')){state.payouts.filter(x=>x.status==='pending').forEach(x=>x.status='prepared');audit('prepared','payout batch','current');persist();renderPayouts();toast('Payout batch prepared.');return;}
    });
    document.querySelector('[data-order-filters]').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;document.querySelectorAll('[data-order-filters] button').forEach(x=>x.classList.remove('active'));b.classList.add('active');orderFilter=b.dataset.filter;renderOrders();});
    document.querySelector('[data-curation-tabs]').addEventListener('click',e=>{const b=e.target.closest('[data-curation]');if(!b)return;document.querySelectorAll('[data-curation-tabs] button').forEach(x=>x.classList.remove('active'));b.classList.add('active');curationTab=b.dataset.curation;renderCuration();});
    document.getElementById('curation-grid').addEventListener('change',e=>{const active=e.target.closest('[data-curation-active]'),priority=e.target.closest('[data-curation-priority]');const id=active?.dataset.curationActive||priority?.dataset.curationPriority;if(!id)return;const cfg=state.curation[curationTab][id]||{active:true,priority:false};if(active)cfg.active=active.checked;if(priority)cfg.priority=priority.checked;state.curation[curationTab][id]=cfg;audit('curation changed',curationTab,id);persist();toast('Curation updated.');});
    document.getElementById('reco-form').addEventListener('input',e=>{const input=e.target;if(!input.name)return;const out=document.querySelector(`[data-output="${input.name}"]`);if(out)out.value=input.name==='categoryCap'?input.value:`${input.value}%`;});
    document.getElementById('reco-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;state.recommendation={affinity:Number(f.affinity.value),quality:Number(f.quality.value),novelty:Number(f.novelty.value),categoryCap:Number(f.categoryCap.value),exploration:f.exploration.checked,decay:f.decay.checked};const total=state.recommendation.affinity+state.recommendation.quality+state.recommendation.novelty;if(total!==100){state.recommendation.affinity=Math.round(state.recommendation.affinity/total*100);state.recommendation.quality=Math.round(state.recommendation.quality/total*100);state.recommendation.novelty=100-state.recommendation.affinity-state.recommendation.quality;}audit('recommendation balance changed','recommendation','global');persist();renderReco();toast('Recommendation balance saved.');});
    const dialog=document.getElementById('admin-dialog');document.getElementById('admin-dialog-form').addEventListener('submit',e=>{e.preventDefault();saveDialog(e.currentTarget);dialog.close();e.currentTarget.reset();});
    const search=document.querySelector('[data-global-search]');search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();if(!q)return;const o=state.orders.find(x=>[x.id,x.customer,x.look].some(v=>String(v).toLowerCase().includes(q)));if(o){openView('orders');setTimeout(()=>openOrder(o.id),80);return;}const p=state.partners.find(x=>[x.name,x.area].some(v=>String(v).toLowerCase().includes(q)));if(p){openView('partners');setTimeout(()=>openPartner(p.id),80);}});
  }

  function tick(){document.querySelector('[data-admin-clock]').textContent=new Date().toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'});}  
  function init(){renderAll();wire();tick();setInterval(tick,60000);const initial=location.hash.slice(1);if(titles[initial])openView(initial);}
  window.LuneAdmin={getState:()=>clone(state),replaceState:next=>{state={...clone(seed),...next};persist();renderAll();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();