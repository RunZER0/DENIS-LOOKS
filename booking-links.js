(() => {
  'use strict';

  const source = document.body.classList.contains('aura-favorites-page') ? 'saved'
    : document.body.classList.contains('aura-inspo-page') ? 'inspo'
    : document.body.classList.contains('aura-work-page') ? 'work'
    : 'site';

  function bookingUrl(kind,id){
    const url = new URL('booking.html', location.href);
    url.searchParams.set('kind',kind);
    url.searchParams.set('id',id);
    url.searchParams.set('source',source);
    const ref = new URLSearchParams(location.search).get('ref');
    if(ref) url.searchParams.set('ref',ref);
    return url.toString();
  }

  function addLink(container,kind,id,label='Reserve this look'){
    if(!container || !id || container.querySelector('[data-lune-reserve]')) return;
    const link=document.createElement('a');
    link.className='quiet-action lune-reserve-link';
    link.dataset.luneReserve='';
    link.href=bookingUrl(kind,id);
    link.textContent=label;
    link.addEventListener('click',()=>{
      const taste=window.LuneTaste;
      const item=kind==='work' ? taste?.catalogs?.work?.().find(x=>x.id===id) : taste?.catalogs?.inspo?.().find(x=>x.id===id);
      if(item) taste?.track?.('book',{...item,kind},{surface:source,source:'reserve-link'});
    });
    container.appendChild(link);
  }

  function syncWork(){
    document.querySelectorAll('.gallery-card[data-id]').forEach(card=>{
      const id=card.dataset.id;
      const actions=card.querySelector('.card-footer-btns') || card.querySelector('.card-content');
      addLink(actions,'work',id);
    });
    document.querySelectorAll('.taste-card[data-set-id]').forEach(card=>{
      addLink(card.querySelector('.card-actions'),'work',card.dataset.setId);
    });
    const dialog=document.getElementById('work-lightbox');
    if(dialog?.dataset.setId){
      const copy=dialog.querySelector('.v2-lightbox-copy');
      addLink(copy,'work',dialog.dataset.setId,'Reserve this set');
    }
  }

  function syncInspo(){
    document.querySelectorAll('.inspo-card[data-inspo-id], .personal-inspo-card[data-inspo-id]').forEach(card=>{
      const id=card.dataset.inspoId;
      const actions=card.querySelector('.card-actions') || card.querySelector('.inspo-info') || card.querySelector('.personal-inspo-copy');
      addLink(actions,'inspo',id);
    });
    const dialog=document.getElementById('inspo-dialog');
    if(dialog?.dataset.inspoId){
      addLink(dialog.querySelector('.card-actions'),'inspo',dialog.dataset.inspoId,'Reserve this direction');
    }
  }

  function sync(){ syncWork(); syncInspo(); }

  const observer=new MutationObserver(()=>requestAnimationFrame(sync));
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-set-id','data-inspo-id']});
  document.addEventListener('click',event=>{
    if(event.target.closest('.card-image-wrap,.inspo-card')) setTimeout(sync,0);
  },true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',sync,{once:true}); else sync();
})();
