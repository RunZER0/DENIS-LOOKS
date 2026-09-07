(() => {
  const STORAGE = {
    work: 'lune_saved_work',
    inspo: 'lune_saved_inspo',
    events: 'lune_taste_events',
    nudge: 'lune_nudge_seen'
  };
  const DAY = 86400000;
  const MAX_EVENTS = 240;
  const read = (key, fallback=[]) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const work = () => window.LuneCatalog?.work || [];
  const inspo = () => window.LuneCatalog?.inspo || [];
  const savedWork = () => [...new Set(read(STORAGE.work, []))];
  const savedInspo = () => read(STORAGE.inspo, []);
  const normalize = v => String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const tokens = v => normalize(v).split(/\s+/).filter(t => t.length > 2 && !['nail','nails','with','plus','and','the','gel','art'].includes(t));
  const features = item => [...new Set([...tokens(item.title),...tokens(item.style),...tokens(item.category),...tokens(item.description),...((item.tags||[]).flatMap(tokens))])];
  const slugify = v => normalize(v).replace(/\s+/g,'-');
  const inspoSlug = item => `${item.id}-${slugify(item.style)}`;

  function record(kind, item, action) {
    const weights = {open:1.2,save:6,unsave:-2.5,share:3.5,book:8};
    if (!item || !(action in weights)) return;
    const list = read(STORAGE.events, []);
    list.push({kind,id:item.id,action,weight:weights[action],features:features(item),ts:Date.now()});
    write(STORAGE.events, list.slice(-MAX_EVENTS));
  }

  function profile() {
    const p = new Map();
    const add = (t,w) => p.set(t,(p.get(t)||0)+w);
    const now = Date.now();
    read(STORAGE.events, []).forEach(e => {
      const decay = Math.exp(-Math.max(0,(now-Number(e.ts||now))/DAY)/52);
      (e.features||[]).forEach(t => add(t,Number(e.weight||0)*decay));
    });
    work().filter(x=>savedWork().includes(x.id)).forEach(x=>features(x).forEach(t=>add(t,2.2)));
    savedInspo().forEach(x=>features(x).forEach(t=>add(t,2.0)));
    return p;
  }

  function affinity(item,p) {
    const f=features(item); if(!f.length||!p.size) return 0;
    const raw=f.reduce((s,t)=>s+Math.max(0,p.get(t)||0),0);
    const denom=Math.sqrt(f.length)*Math.max(1,Math.sqrt([...p.values()].filter(v=>v>0).reduce((a,b)=>a+b,0)));
    return raw/denom;
  }

  function jaccard(a,b) {
    const A=new Set(features(a)),B=new Set(features(b)); if(!A.size||!B.size) return 0;
    let overlap=0; A.forEach(x=>{if(B.has(x)) overlap++;});
    return overlap/(A.size+B.size-overlap);
  }

  function categoryKey(item){return normalize(item.category).split(' ').slice(0,2).join(' ');}

  function diverseSelect(items,p,limit,quality=()=>0,curated=[]) {
    if(!items.length) return [];
    const rank=new Map(curated.map((id,i)=>[id,Math.max(0,1-i/Math.max(1,curated.length-1))]));
    const scored=items.map(item=>({item,affinity:affinity(item,p),quality:Math.max(quality(item),rank.get(item.id)||0)}));
    if(!p.size){
      const picked=[],counts=new Map();
      [...scored].sort((a,b)=>b.quality-a.quality).forEach(c=>{ if(picked.length>=limit)return; const k=categoryKey(c.item),n=counts.get(k)||0; if(n>=2)return; picked.push(c.item); counts.set(k,n+1); });
      for(const c of scored) if(picked.length<limit&&!picked.includes(c.item)) picked.push(c.item);
      return picked.slice(0,limit);
    }
    const picked=[],counts=new Map(),remaining=[...scored];
    while(picked.length<Math.max(0,limit-1)&&remaining.length){
      let best=-1,bestScore=-Infinity;
      remaining.forEach((c,i)=>{ const k=categoryKey(c.item); if((counts.get(k)||0)>=2)return; const redundancy=picked.length?Math.max(...picked.map(x=>jaccard(c.item,x))):0; const score=c.affinity*.64+c.quality*.14+(1-redundancy)*.22; if(score>bestScore){best=i;bestScore=score;} });
      if(best<0) break;
      const [c]=remaining.splice(best,1); picked.push(c.item); const k=categoryKey(c.item); counts.set(k,(counts.get(k)||0)+1);
    }
    if(picked.length<limit&&remaining.length){
      const seen=new Set([...p.entries()].filter(([,w])=>w>0).map(([t])=>t));
      const candidate=remaining.map(c=>{ const f=features(c.item); const familiar=f.filter(t=>seen.has(t)).length/Math.max(1,f.length); const redundancy=picked.length?Math.max(...picked.map(x=>jaccard(c.item,x))):0; return {c,score:(1-familiar)*.48+(1-redundancy)*.32+c.quality*.20}; }).sort((a,b)=>b.score-a.score).find(x=>(counts.get(categoryKey(x.c.item))||0)<2)?.c || remaining[0];
      if(candidate) picked.push(candidate.item);
    }
    for(const c of remaining) if(picked.length<limit&&!picked.includes(c.item)) picked.push(c.item);
    return picked.slice(0,limit);
  }

  function recommendWork(limit=4){
    const liked=new Set(savedWork()); let pool=work().filter(x=>!liked.has(x.id)); if(pool.length<limit) pool=work().slice();
    const max=Math.max(1,...pool.map(x=>Number(x.likes||0)));
    return diverseSelect(pool,profile(),limit,x=>Number(x.likes||0)/max);
  }
  function recommendInspo(limit=4){
    const saved=new Set(savedInspo().map(x=>x.id)); let pool=inspo().filter(x=>!saved.has(x.id)); if(pool.length<limit) pool=inspo().slice();
    return diverseSelect(pool,profile(),limit,()=>.35,['inspo_3','inspo_9','inspo_6','inspo_5','inspo_1','inspo_7','inspo_10','inspo_2','inspo_8','inspo_4']);
  }

  function dispatch(){ window.dispatchEvent(new CustomEvent('lune:taste-changed')); }
  function toast(message){
    let el=document.querySelector('.experience-toast'); if(!el){el=document.createElement('div');el.className='experience-toast';el.setAttribute('role','status');document.body.appendChild(el);} el.textContent=message; requestAnimationFrame(()=>el.classList.add('show')); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('show'),2200);
  }

  function syncWorkButtons(){
    const saved=new Set(savedWork());
    document.querySelectorAll('[data-save-set]').forEach(btn=>{ const on=saved.has(btn.dataset.saveSet); btn.classList.toggle('is-saved',on); btn.textContent=on?'♥':'♡'; btn.title=on?'Saved':'Save'; btn.setAttribute('aria-label',on?'Remove from saved':'Save this set'); });
  }

  function toggleWork(id){
    let ids=savedWork(); const adding=!ids.includes(id); ids=adding?[...ids,id]:ids.filter(x=>x!==id); write(STORAGE.work,ids); const item=work().find(x=>x.id===id); record('work',item,adding?'save':'unsave'); syncWorkButtons(); dispatch(); toast(adding?'Saved.':'Removed from saved.'); renderFavorites(); renderPersonalInspo();
  }

  function shareUrl(path,params={}){ const url=new URL(path,window.location.href); Object.entries(params).forEach(([k,v])=>v&&url.searchParams.set(k,v)); url.searchParams.set('ref','share'); return url.toString(); }
  async function share(title,url){ try{ if(navigator.share) await navigator.share({title,url}); else {await navigator.clipboard.writeText(url);toast('Link copied.');} }catch(e){ if(e?.name!=='AbortError'){try{await navigator.clipboard.writeText(url);toast('Link copied.');}catch(_){}} } }

  function toggleInspo(item){
    let list=savedInspo(); const exists=list.some(x=>x.id===item.id); list=exists?list.filter(x=>x.id!==item.id):[...list,{...item,slug:inspoSlug(item)}]; write(STORAGE.inspo,list); record('inspo',item,exists?'unsave':'save'); dispatch(); toast(exists?'Removed from saved.':'Saved.'); renderPersonalInspo(); renderFavorites(); syncInspoCards();
  }

  function syncInspoCards(){
    const saved=new Set(savedInspo().map(x=>x.id));
    document.querySelectorAll('.inspo-card').forEach(card=>{
      const id=card.dataset.inspoId; let actions=card.querySelector('.inspo-actions'); if(!actions){actions=document.createElement('div');actions.className='inspo-actions';actions.innerHTML=`<button class="inspo-action" type="button" data-save-inspo="${id}" aria-label="Save inspiration">♡</button><button class="inspo-action" type="button" data-share-inspo="${id}" aria-label="Share link">↗</button>`;card.querySelector('.inspo-img-wrap')?.appendChild(actions);} const save=actions.querySelector('[data-save-inspo]'); const on=saved.has(id); if(save){save.classList.toggle('is-saved',on);save.textContent=on?'♥':'♡';}
    });
  }

  function findInspo(ref){ return inspo().find(x=>x.id===ref||inspoSlug(x)===ref||slugify(x.style)===ref) || savedInspo().find(x=>x.id===ref||x.slug===ref) || null; }

  function openInspo(item,updateUrl=true){
    const d=document.getElementById('inspo-dialog'); if(!d||!item)return; record('inspo',item,'open'); d.dataset.inspoId=item.id; const img=d.querySelector('img'); if(img){img.src=item.img;img.alt=item.style;} d.querySelector('[data-dialog-category]').textContent=item.category; d.querySelector('[data-dialog-title]').textContent=item.style; const saveBtn=d.querySelector('[data-dialog-save]'); if(saveBtn) saveBtn.textContent=savedInspo().some(x=>x.id===item.id)?'Saved':'Save this inspo'; const book=d.querySelector('[data-dialog-book]'); if(book){book.href=`work.html?focus=${encodeURIComponent(item.style)}`;book.textContent='See related work →';}
    if(updateUrl){const url=new URL(location.href);url.searchParams.set('look',inspoSlug(item));url.searchParams.delete('ref');history.pushState({luneInspo:item.id},'',url);} d.showModal();
  }

  function inspoCard(item,saved=false){ const key=item.slug||inspoSlug(item); return `<article class="personal-inspo-card" data-inspo-id="${item.id}"><figure><a href="inspo.html?look=${encodeURIComponent(key)}"><img src="${item.img}" alt="${item.style}" loading="lazy"></a></figure><div class="personal-inspo-copy"><small>${item.category}</small><h3>${item.style}</h3><div class="card-actions"><button class="quiet-action ${saved?'is-saved':''}" type="button" data-save-inspo="${item.id}">${saved?'Saved':'Save'}</button><button class="quiet-action" type="button" data-share-inspo="${item.id}">Share link</button><a class="quiet-action" href="inspo.html?look=${encodeURIComponent(key)}">Open</a></div></div></article>`; }
  function workCard(item,saved=false){ return `<article class="taste-card" data-set-id="${item.id}"><figure><a href="work.html?set=${encodeURIComponent(item.id)}"><img src="${item.imageUrl}" alt="${item.title}" loading="lazy"></a></figure><div class="taste-copy"><small>${item.category} · ${window.LuneCatalog.money(item.price)}</small><h3>${item.title}</h3><p>${item.style}</p><div class="card-actions"><button class="quiet-action ${saved?'is-saved':''}" type="button" data-save-set="${item.id}">${saved?'Saved':'Save'}</button><button class="quiet-action" type="button" data-share-set="${item.id}">Share link</button><a class="quiet-action" href="work.html?set=${encodeURIComponent(item.id)}">Open</a></div></div></article>`; }

  function renderPersonalInspo(){
    const grid=document.getElementById('personal-inspo-grid'); if(!grid)return; const saved=new Set(savedInspo().map(x=>x.id)); const picked=recommendInspo(4); grid.innerHTML=picked.map(x=>inspoCard(x,saved.has(x.id))).join(''); const hasTaste=savedWork().length+savedInspo().length+read(STORAGE.events,[]).length>1; const h=document.querySelector('[data-personal-inspo-heading]'),p=document.querySelector('[data-personal-inspo-copy]'); if(h)h.textContent=hasTaste?'More in your direction.':'A strong place to start.'; if(p)p.textContent=hasTaste?'Familiar enough to feel right. Different enough to keep discovering.':'Four distinct directions to get the first choice moving.';
  }

  function renderFavorites(){
    if(!document.body.classList.contains('lune-favorites-page'))return; const liked=new Set(savedWork()), savedI=savedInspo(), savedW=work().filter(x=>liked.has(x.id)); const wg=document.getElementById('saved-work-grid'),ig=document.getElementById('saved-inspo-grid'),rg=document.getElementById('taste-recommendations'),empty=document.getElementById('saved-empty'); if(wg)wg.innerHTML=savedW.map(x=>workCard(x,true)).join(''); if(ig)ig.innerHTML=savedI.map(x=>inspoCard(x,true)).join(''); document.querySelectorAll('[data-saved-work-section]').forEach(x=>x.hidden=!savedW.length); document.querySelectorAll('[data-saved-inspo-section]').forEach(x=>x.hidden=!savedI.length); const count=savedW.length+savedI.length; if(empty){empty.hidden=count>0;empty.innerHTML='<strong>A few worth keeping are already waiting below.</strong>';}
    const recs=recommendWork(4); if(rg)rg.innerHTML=recs.map(x=>workCard(x,liked.has(x.id))).join(''); const h=document.querySelector('[data-recommendation-title]'),p=document.querySelector('[data-recommendation-copy]'); if(h)h.textContent=count?'More in your direction.':'A few worth keeping.'; if(p)p.textContent=count?'Familiar signals, with enough distance to keep discovery alive.':'A varied starting point across finish, structure and mood.';
  }

  function scheduleNudge(){
    if(document.body.classList.contains('lune-favorites-page')||sessionStorage.getItem(STORAGE.nudge))return;
    const fire=()=>{if(sessionStorage.getItem(STORAGE.nudge)||document.querySelector('.experience-nudge'))return;sessionStorage.setItem(STORAGE.nudge,'1');const count=savedWork().length+savedInspo().length;const n=document.createElement('aside');n.className='experience-nudge';n.innerHTML=count?`<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>SAVED</small><h3>${count===1?'One look stayed with you.':`${count} looks made the cut.`}</h3><p>Your shortlist is still here.</p><a class="text-link" href="favorites.html">Open saved →</a>`:`<button class="experience-nudge-close" aria-label="Dismiss">×</button><small>NEED A STARTING POINT?</small><h3>Start with what catches your eye.</h3><p>Inspo makes the first decision lighter.</p><a class="text-link" href="inspo.html">Find your direction →</a>`;document.body.appendChild(n);n.querySelector('.experience-nudge-close')?.addEventListener('click',()=>n.remove());requestAnimationFrame(()=>n.classList.add('show'));}; let fired=false; const onScroll=()=>{if(fired)return;const progress=window.scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);if(progress>.45){fired=true;window.removeEventListener('scroll',onScroll);setTimeout(fire,700);}};window.addEventListener('scroll',onScroll,{passive:true});setTimeout(()=>{if(!fired){fired=true;window.removeEventListener('scroll',onScroll);fire();}},18000);
  }

  function wire(){
    document.addEventListener('click',e=>{
      const sw=e.target.closest('[data-save-set]'); if(sw){e.preventDefault();e.stopPropagation();toggleWork(sw.dataset.saveSet);return;}
      const sh=e.target.closest('[data-share-set]'); if(sh){e.preventDefault();e.stopPropagation();const item=work().find(x=>x.id===sh.dataset.shareSet);if(item){record('work',item,'share');share(`${item.title} — Lune`,shareUrl('work.html',{set:item.id}));}return;}
      const si=e.target.closest('[data-save-inspo]'); if(si){e.preventDefault();e.stopPropagation();const item=findInspo(si.dataset.saveInspo);if(item)toggleInspo(item);return;}
      const shi=e.target.closest('[data-share-inspo]'); if(shi){e.preventDefault();e.stopPropagation();const item=findInspo(shi.dataset.shareInspo);if(item){record('inspo',item,'share');share(`${item.style} — Lune`,shareUrl('inspo.html',{look:inspoSlug(item)}));}return;}
      const card=e.target.closest('.lune-inspo-page .inspo-card'); if(card){e.preventDefault();const item=findInspo(card.dataset.inspoId);if(item)openInspo(item,true);return;}
      const ds=e.target.closest('[data-dialog-save]'); if(ds){e.preventDefault();const d=ds.closest('#inspo-dialog');const item=findInspo(d?.dataset.inspoId);if(item){toggleInspo(item);ds.textContent=savedInspo().some(x=>x.id===item.id)?'Saved':'Save this inspo';}}
    },true);
    document.querySelectorAll('.v3-dialog').forEach(d=>{d.querySelector('.v3-dialog-close')?.addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d)d.close();});});
    window.addEventListener('popstate',()=>{const ref=new URLSearchParams(location.search).get('look');const d=document.getElementById('inspo-dialog');if(!ref){if(d?.open)d.close();return;}const item=findInspo(ref);if(item)openInspo(item,false);});
  }

  function init(){
    syncWorkButtons(); syncInspoCards(); renderPersonalInspo(); renderFavorites(); wire(); scheduleNudge();
    window.addEventListener('lune:catalog-rendered',()=>{syncWorkButtons();syncInspoCards();renderPersonalInspo();renderFavorites();});
    window.addEventListener('lune:taste-changed',()=>{syncWorkButtons();renderPersonalInspo();renderFavorites();});
    const requested=new URLSearchParams(location.search).get('look'); if(requested&&document.body.classList.contains('lune-inspo-page')) setTimeout(()=>{const item=findInspo(requested);if(item)openInspo(item,false);},180);
  }

  window.LuneExperience={recommendWork,recommendInspo,record};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();