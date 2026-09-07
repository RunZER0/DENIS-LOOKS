(() => {
  const KEY='lune_admin_services_v1';
  const defaults=[
    {id:'svc_natural',name:'Natural gel',status:'active',partners:['p_01','p_02','p_03']},
    {id:'svc_structure',name:'Structured gel',status:'active',partners:['p_01','p_02']},
    {id:'svc_extensions',name:'Extensions',status:'active',partners:['p_01','p_02','p_03']},
    {id:'svc_chrome',name:'Chrome',status:'active',partners:['p_01','p_02']},
    {id:'svc_3d',name:'3D sculpture',status:'active',partners:['p_01','p_02']},
    {id:'svc_pedi',name:'Pedicure',status:'active',partners:['p_01','p_03']}
  ];
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||defaults;}catch(_){return defaults;}};
  const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
  let services=read();

  function render(){
    const panel=document.querySelector('[data-view-panel="partners"]');
    if(!panel)return;
    let section=document.getElementById('service-control-panel');
    if(!section){
      section=document.createElement('section');
      section.id='service-control-panel';
      section.className='admin-panel';
      section.style.marginTop='22px';
      panel.appendChild(section);
    }
    const state=window.LuneAdmin?.getState?.()||{};
    const partners=state.partners||[];
    section.innerHTML=`<div class="panel-head"><div><span class="admin-kicker">SERVICE CONTROL</span><h3>What the network can accept</h3></div></div><div class="service-control-grid">${services.map(s=>`<article class="service-control"><div><b>${s.name}</b><span>${s.partners.map(id=>partners.find(p=>p.id===id)?.name).filter(Boolean).join(' · ')||'No certified partner'}</span></div><button class="admin-secondary" data-service-toggle="${s.id}">${s.status==='active'?'Suspend':'Activate'}</button></article>`).join('')}</div>`;
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-service-toggle]');
    if(!b)return;
    const s=services.find(x=>x.id===b.dataset.serviceToggle);if(!s)return;
    s.status=s.status==='active'?'suspended':'active';write(services);render();
    const toast=document.querySelector('.admin-toast');if(toast){toast.textContent=s.status==='active'?`${s.name} active.`:`${s.name} suspended.`;toast.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>toast.classList.remove('show'),2200);}
  });

  const style=document.createElement('style');
  style.textContent='.service-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-top:1px solid var(--line)}.service-control{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--line)}.service-control:nth-child(odd){padding-right:20px}.service-control:nth-child(even){padding-left:20px}.service-control b{display:block;font-size:.78rem}.service-control span{display:block;margin-top:5px;color:var(--muted);font-size:.64rem}@media(max-width:760px){.service-control-grid{grid-template-columns:1fr}.service-control:nth-child(n){padding-left:0;padding-right:0}}';
  document.head.appendChild(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  window.addEventListener('storage',e=>{if(e.key===KEY){services=read();render();}});
})();