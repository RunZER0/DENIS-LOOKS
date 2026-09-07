(() => {
  const WORK = [
    {id:'set_01',title:'Gloss Natural Glaze',category:'Gel Polish',style:'Plain on Natural Nails',description:'Ultra-clean cuticles and prep with a high-gloss glass finish.',price:400,imageUrl:'nails1.png.png',tags:['Natural','Minimal','Gloss'],likes:24},
    {id:'set_02',title:'Classic Parisian French',category:'Tips + Gel',style:'Classic French Tips Extension',description:'Crisp curved smile lines over a soft nude base.',price:800,imageUrl:'nails2.png.png',tags:['French','Clean','Timeless'],likes:38},
    {id:'set_03',title:'Liquid Chrome & 3D Drops',category:'3D & Chrome Art',style:'3D Sculpted & Chrome Accents',description:'Molten silver chrome with raised glass-like detail.',price:1200,imageUrl:'nails3.png.png',tags:['Chrome','3D','Editorial'],likes:52},
    {id:'set_04',title:'Complex 3D Nebula Art',category:'3D & Chrome Art',style:'Complex Arts + Multi-layer 3D',description:'Textured gel swirls with layered chrome accents.',price:1500,imageUrl:'nails4.png.png',tags:['3D','Sculpted','Statement'],likes:45},
    {id:'set_05',title:'Blush Centered Ombré',category:'Gel Polish',style:'Centered Ombré Design',description:'A blush centre fading softly into milky quartz.',price:400,imageUrl:'nails5.png.png',tags:['Ombre','Blush','Soft'],likes:41},
    {id:'set_06',title:'Soft Nude French Curve',category:'Tips + Gel',style:'Nude French Tips Extension',description:'Almond extensions with a restrained micro-French edge.',price:1000,imageUrl:'nails6.png.png',tags:['French','Almond','Nude'],likes:29},
    {id:'set_07',title:'Platinum Mirror Chrome',category:'3D & Chrome Art',style:'3D Chrome Accents',description:'A silver mirror finish with controlled textured accents.',price:1100,imageUrl:'nails7.png.png',tags:['Chrome','Mirror','Shine'],likes:33},
    {id:'set_08',title:'Sculpted 3D Moulding',category:'Gumgel Overlays',style:'Chrome 3D & Sculpted Moulding',description:'Structured overlays with dimensional moulding.',price:1500,imageUrl:'nails8.png.png',tags:['Structured','3D','Sculpted'],likes:49},
    {id:'set_09',title:'Milky Quartz Natural Ombré',category:'Gel Polish',style:'Ombré on Natural Nails',description:'A seamless milky gradient over natural nails.',price:400,imageUrl:'nails9.png.png',tags:['Natural','Ombre','Milky'],likes:27},
    {id:'set_10',title:'Clean Minimalist Chrome',category:'3D & Chrome Art',style:'Simple Chrome Minimal Line Art',description:'Fine chrome ribbons over a translucent nude base.',price:950,imageUrl:'nails10.png.png',tags:['Chrome','Minimal','Jelly'],likes:31},
    {id:'set_11',title:'Chrome Stiletto',category:'3D & Chrome Art',style:'Chrome 3D Long Stiletto',description:'Extra-long stiletto extensions with sharp chrome detail.',price:1800,imageUrl:'nails11.png.png',tags:['Stiletto','Long','Chrome'],likes:64},
    {id:'set_12',title:'Obsidian Marble & 3D Veins',category:'3D & Chrome Art',style:'Marble Design + 3D Textures',description:'Smoky stone veining layered under dimensional gloss.',price:1400,imageUrl:'nails12.png.png',tags:['Marble','3D','Stone'],likes:39},
    {id:'set_13',title:'Sunset Ombré Stiletto',category:'Tips + Gel',style:'Ombré Long Stiletto Extension',description:'A warm gradient on long, sharp stiletto extensions.',price:1100,imageUrl:'nails13.png.png',tags:['Ombre','Stiletto','Warm'],likes:42},
    {id:'set_14',title:'Gloss Gel Pedicure',category:'Pedicure',style:'Plain Gel on Toes & Deep Prep',description:'Clean prep finished with a high-gloss gel colour.',price:400,imageUrl:'nails14.png.png',tags:['Pedicure','Clean','Gloss'],likes:21}
  ];

  const INSPO = [
    {id:'inspo_1',img:'inspo1.png.png',category:'Natural',style:'Minimalist Chic',tags:['minimal','natural','short']},
    {id:'inspo_2',img:'inspo2.png.png',category:'Natural',style:'Nude Elegance',tags:['nude','soft','natural']},
    {id:'inspo_3',img:'inspo3.png.png',category:'Chrome',style:'Chrome Artistry',tags:['chrome','metallic','statement']},
    {id:'inspo_4',img:'inspo4.png.png',category:'Gloss',style:'Plain High-Gloss',tags:['gloss','clean','simple']},
    {id:'inspo_5',img:'inspo5.png.png',category:'French',style:'Classic French Tips',tags:['french','clean','timeless']},
    {id:'inspo_6',img:'inspo6.png.png',category:'3D',style:'3D Design Art',tags:['3d','sculpted','statement']},
    {id:'inspo_7',img:'inspo7.png.png',category:'Chrome',style:'Chrome Effects',tags:['chrome','structured','metallic']},
    {id:'inspo_8',img:'inspo8.png.png',category:'Structure',style:'Plain Structure',tags:['structured','clean','neutral']},
    {id:'inspo_9',img:'inspo9.png.png',category:'French',style:'Modern French',tags:['french','modern','soft']},
    {id:'inspo_10',img:'inspo10.png.png',category:'3D',style:'3D Sculpted Art',tags:['3d','sculpted','editorial']}
  ];

  const money = n => `Ksh ${Number(n || 0).toLocaleString()}`;
  const matchesCategory = (set, category) => category === 'all' || set.category.toLowerCase().includes(category.toLowerCase()) || (category === '3d' && /3d|chrome/i.test(set.category));
  const matchesSearch = (set, q) => !q || [set.title,set.style,set.description,...(set.tags||[])].join(' ').toLowerCase().includes(q.toLowerCase());

  function renderWork() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    let category = 'all';
    let search = '';

    const draw = () => {
      const visible = WORK.filter(set => matchesCategory(set, category) && matchesSearch(set, search));
      if (!visible.length) {
        const fallback = [...WORK].sort((a,b)=>b.likes-a.likes).slice(0,4);
        grid.innerHTML = `<div class="work-empty" style="grid-column:1/-1"><div class="eyebrow">CLOSEST DIRECTIONS</div><h3>No exact match.</h3><p>Try one of these, or clear the search.</p></div>` + fallback.map(card).join('');
      } else grid.innerHTML = visible.map(card).join('');
      window.dispatchEvent(new CustomEvent('lune:catalog-rendered'));
    };

    function card(set) {
      return `<article class="gallery-card" data-id="${set.id}">
        <div class="card-image-wrap"><img src="${set.imageUrl}" alt="${set.title}" loading="lazy"><span class="card-badge-category">${set.category}</span><span class="card-badge-price">${money(set.price)}</span><div class="card-quick-actions"><button class="action-circle-btn" type="button" data-save-set="${set.id}" title="Save" aria-label="Save this set">♡</button><button class="action-circle-btn" type="button" data-share-set="${set.id}" title="Share link" aria-label="Share this set">↗</button></div></div>
        <div class="card-content"><h3 class="card-title">${set.title}</h3><p class="card-style-sub">${set.style}</p><div class="card-tags-list">${(set.tags||[]).map(t=>`<span class="tag-pill">#${t}</span>`).join('')}</div><div class="card-footer-btns"><a class="btn-book-look" href="work.html?set=${encodeURIComponent(set.id)}">View set <span aria-hidden="true">→</span></a></div></div>
      </article>`;
    }

    document.querySelectorAll('.service-list-item[data-category]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.service-list-item[data-category]').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      category = btn.dataset.category || 'all';
      draw();
    }));
    const input = document.getElementById('gallery-search');
    input?.addEventListener('input', e => { search = e.target.value.trim(); draw(); });
    draw();

    const requested = new URLSearchParams(location.search).get('set');
    if (requested) setTimeout(() => {
      const target = document.querySelector(`.gallery-card[data-id="${CSS.escape(requested)}"]`);
      target?.scrollIntoView({behavior:'smooth',block:'center'});
      target?.querySelector('.card-image-wrap')?.click();
    }, 240);
  }

  function renderInspo() {
    const container = document.getElementById('inspo-scroll');
    if (!container) return;
    container.innerHTML = INSPO.map(item => `<article class="inspo-card" data-inspo-id="${item.id}"><div class="inspo-img-wrap"><img src="${item.img}" alt="${item.style}" loading="lazy"></div><div class="inspo-meta"><div class="inspo-category">${item.category}</div><div class="inspo-style">${item.style}</div></div></article>`).join('');
    window.dispatchEvent(new CustomEvent('lune:catalog-rendered'));
  }

  window.LuneCatalog = { work: WORK, inspo: INSPO, money };
  Object.defineProperty(window, '__allSetsRef', { get: () => WORK, configurable: true });

  const init = () => { renderWork(); renderInspo(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();