(function(root,factory){
  const api=factory(root||{});
  if(root&&root.document) api.boot();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:null,function(root){
  'use strict';
  const CONTEXT_KEY='lune_discovery_context_v1';
  const TRAIL_KEY='lune_discovery_trail_v1';
  const MAX_CONTEXT_AGE=14*86400000;
  const memory=new Map();
  const store=(()=>{try{return root.localStorage||null}catch(_){return null}})();
  const read=(k,f)=>{try{const r=store?store.getItem(k):memory.get(k);return r?JSON.parse(r):f}catch(_){return f}};
  const write=(k,v)=>{const r=JSON.stringify(v);try{if(store)store.setItem(k,r);else memory.set(k,r)}catch(_){memory.set(k,r)}};
  const normalize=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const meaningfulTokens=v=>normalize(v).split(/\s+/).filter(t=>t.length>2&&!['nail','nails','gel','tips','look','set','with','and','the','art','style','natural','design'].includes(t));
  function overlapScore(a,b){const A=new Set(meaningfulTokens(a)),B=new Set(meaningfulTokens(b));if(!A.size||!B.size)return 0;let n=0;A.forEach(t=>{if(B.has(t))n++});return n/Math.max(A.size,B.size)}
  function strongestSeed(v){return meaningfulTokens(v)[0]||normalize(v).split(/\s+/)[0]||''}
  const workUrl=id=>`work.html?set=${encodeURIComponent(id)}`;
  const inspoUrl=key=>`inspo.html?look=${encodeURIComponent(key)}`;
  const reduced=()=>{try{return root.matchMedia?.('(prefers-reduced-motion: reduce)').matches}catch(_){return false}};
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function page(doc){const b=doc?.body;if(!b)return'unknown';if(b.classList.contains('aura-home-page'))return'home';if(b.classList.contains('aura-work-page'))return'work';if(b.classList.contains('aura-inspo-page'))return'inspo';if(b.classList.contains('aura-favorites-page'))return'saved';if(b.classList.contains('aura-standard-page'))return'standard';return'unknown'}
  function rememberTrail(p,href){if(p==='unknown')return;const trail=read(TRAIL_KEY,[]).filter(x=>x?.page!==p||x?.href!==href);trail.push({page:p,href,ts:Date.now()});write(TRAIL_KEY,trail.slice(-12))}
  function rememberContext(ctx){if(ctx?.type&&ctx?.title&&ctx?.href)write(CONTEXT_KEY,{...ctx,ts:Date.now()})}
  function recentContext(){const c=read(CONTEXT_KEY,null);return c?.ts&&Date.now()-Number(c.ts)<=MAX_CONTEXT_AGE?c:null}
  function ensureStyles(doc){if(doc.querySelector('link[data-discovery-css]'))return;const l=doc.createElement('link');l.rel='stylesheet';l.href='discovery-experience.css?v=20260907a';l.dataset.discoveryCss='1';doc.head.appendChild(l)}
  function pulse(node){if(!node)return;node.classList.add('is-context-target');setTimeout(()=>node.classList.remove('is-context-target'),2200)}

  function fromWork(card){if(!card?.dataset.id)return null;const id=card.dataset.id;return{type:'work',id,title:card.querySelector('.card-title')?.textContent?.trim()||'Saved set',style:card.querySelector('.card-style-sub')?.textContent?.trim()||'',image:card.querySelector('.card-image-wrap img')?.getAttribute('src')||'',href:workUrl(id)}}
  function fromInspo(card){if(!card)return null;const id=card.dataset.inspoId||'',key=card.dataset.inspoKey||id,title=card.querySelector('.inspo-style, .personal-inspo-copy h3')?.textContent?.trim()||card.dataset.inspoStyle||'Saved inspo';if(!key)return null;return{type:'inspo',id,key,title,style:card.querySelector('.inspo-category, .personal-inspo-copy small')?.textContent?.trim()||card.dataset.inspoCategory||'',image:card.querySelector('img')?.getAttribute('src')||'',href:inspoUrl(key)}}

  function home(doc){
    const c=recentContext();
    const count=k=>{try{return JSON.parse(root.localStorage?.getItem(k)||'[]').length}catch(_){return 0}};
    const total=count('auranails_liked')+count('aura_inspo_saved');
    if((!c&&!total)||doc.querySelector('[data-discovery-continuation]'))return;
    const anchor=doc.querySelector('.obsession')||doc.querySelector('.home-hero');if(!anchor)return;
    const s=doc.createElement('section');s.className='discovery-continuation';s.dataset.discoveryContinuation='1';
    s.innerHTML=c?`<div class="shell discovery-continuation-inner">${c.image?`<figure><img src="${esc(c.image)}" alt="" loading="lazy"></figure>`:''}<div class="discovery-continuation-copy"><div class="eyebrow">${c.type==='inspo'?'STILL ON YOUR MIND?':'PICK UP WHERE YOU LEFT IT'}</div><strong>${esc(c.title)}</strong>${c.style?`<span>${esc(c.style)}</span>`:''}</div><a class="text-link" href="${esc(c.href)}">Keep looking <span class="arrow">→</span></a></div>`:`<div class="shell discovery-continuation-inner discovery-continuation-simple"><div class="discovery-continuation-copy"><div class="eyebrow">YOUR SHORTLIST</div><strong>${total} ${total===1?'look is':'looks are'} waiting.</strong></div><a class="text-link" href="favorites.html">Open saved <span class="arrow">→</span></a></div>`;
    anchor.insertAdjacentElement('afterend',s);
  }

  function work(doc){
    if(doc.body.dataset.discoveryWorkCapture!=='1'){
      doc.body.dataset.discoveryWorkCapture='1';
      doc.addEventListener('click',e=>{const image=e.target.closest('.aura-work-page .card-image-wrap');if(!image)return;const c=fromWork(image.closest('.gallery-card'));if(c)rememberContext(c)},true);
    }
    const params=new URLSearchParams(root.location.search),requested=params.get('set'),seed=params.get('seed')||params.get('style');
    const resolve=(n=0)=>{const cards=[...doc.querySelectorAll('.gallery-card')];if(!cards.length&&n<24)return setTimeout(()=>resolve(n+1),120);if(requested){const card=cards.find(x=>x.dataset.id===requested);if(card){const c=fromWork(card);if(c)rememberContext(c);card.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'center'});pulse(card);setTimeout(()=>card.querySelector('.card-image-wrap')?.click(),reduced()?0:320);return}}if(seed){const input=doc.getElementById('gallery-search'),token=strongestSeed(seed);if(input&&token){input.value=token;input.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>doc.getElementById('gallery-grid')?.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'}),120)}}};
    setTimeout(()=>resolve(),140);
    const dialog=doc.getElementById('work-lightbox');
    if(dialog&&!dialog.querySelector('[data-discovery-inspo-link]')){const a=doc.createElement('a');a.className='quiet-action discovery-related-link';a.dataset.discoveryInspoLink='1';a.href='inspo.html';a.textContent='See inspo in this direction →';dialog.querySelector('.v2-lightbox-copy')?.appendChild(a);new MutationObserver(()=>{const s=dialog.querySelector('p')?.textContent?.trim()||dialog.querySelector('h2')?.textContent?.trim()||'';a.href=`inspo.html?from=work&seed=${encodeURIComponent(s)}`}).observe(dialog,{childList:true,subtree:true,characterData:true})}
  }

  function inspo(doc){
    if(doc.body.dataset.discoveryInspoCapture!=='1'){
      doc.body.dataset.discoveryInspoCapture='1';
      doc.addEventListener('click',e=>{if(e.target.closest('button[data-inspo-share], button[data-share-inspo]'))return;const card=e.target.closest('.aura-inspo-page .inspo-card, .aura-inspo-page .personal-inspo-card');const c=fromInspo(card);if(c)rememberContext(c)},true);
    }
    const seed=new URLSearchParams(root.location.search).get('seed');
    if(seed){const focus=(n=0)=>{const cards=[...doc.querySelectorAll('#inspo-scroll .inspo-card')];if(!cards.length&&n<24)return setTimeout(()=>focus(n+1),120);const target=cards.map(card=>({card,score:overlapScore(seed,`${card.querySelector('.inspo-style')?.textContent||''} ${card.querySelector('.inspo-category')?.textContent||''}`)})).sort((a,b)=>b.score-a.score)[0]?.card;if(target){target.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'center'});pulse(target)}};setTimeout(()=>focus(),180)}
    const dialog=doc.getElementById('inspo-dialog');
    if(dialog&&!dialog.querySelector('[data-discovery-work-link]')){const a=doc.createElement('a');a.className='quiet-action discovery-related-link';a.dataset.discoveryWorkLink='1';a.href='work.html';a.textContent='See finished work →';(dialog.querySelector('.card-actions')||dialog.querySelector('.v3-dialog-copy'))?.appendChild(a);new MutationObserver(()=>{const t=dialog.querySelector('[data-dialog-title]')?.textContent?.trim()||'';a.href=`work.html?from=inspo&seed=${encodeURIComponent(t)}`}).observe(dialog,{childList:true,subtree:true,characterData:true})}
  }

  function saved(doc){const empty=doc.getElementById('saved-empty');if(!empty)return;setTimeout(()=>{if(doc.querySelector('#saved-work-grid > *, #saved-inspo-grid > *'))return;empty.hidden=false;if(!empty.textContent.trim())empty.innerHTML='<strong>Your shortlist starts with one save.</strong><span>Start with inspo when you want a direction, or Work when you already know the finish.</span>';if(!empty.querySelector('.saved-empty-actions')){const a=doc.createElement('div');a.className='saved-empty-actions';a.innerHTML='<a class="quiet-action" href="inspo.html">See inspo</a><a class="quiet-action" href="work.html">See work</a>';empty.appendChild(a)}},700)}
  function standard(doc){const c=recentContext(),band=doc.querySelector('.page-link-band .shell');if(!c||!band||doc.querySelector('[data-context-return]'))return;const a=doc.createElement('a');a.className='quiet-action context-return';a.dataset.contextReturn='1';a.href=c.href;a.textContent=`Back to ${c.title} →`;band.appendChild(a)}

  function boot(){const doc=root.document;if(!doc)return;const start=()=>{const p=page(doc);if(p==='unknown')return;ensureStyles(doc);rememberTrail(p,`${root.location.pathname}${root.location.search}`);if(p==='home')home(doc);if(p==='work')work(doc);if(p==='inspo')inspo(doc);if(p==='saved')saved(doc);if(p==='standard')standard(doc)};if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start()}
  return{boot,normalize,meaningfulTokens,overlapScore,strongestSeed,workUrl,inspoUrl,recentContext};
});