(() => {
  'use strict';
  const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function req(path,options={}){if(window.LuneData?.request)return window.LuneData.request(path,options);const r=await fetch(`/api${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||`request_failed_${r.status}`);return d}
  const status=(node,msg,error=false)=>{if(!node)return;node.textContent=msg||'';node.classList.toggle('is-error',error);node.classList.toggle('is-good',Boolean(msg)&&!error)};
  let partners=[],locations=[],services=[],catalogKind='work';

  function mount(){
    const root=$('[data-admin-content]');if(!root||$('#launch-config'))return;
    root.insertAdjacentHTML('beforeend',`
      <section class="dashboard-section" id="launch-config">
        <div class="dashboard-section-header"><div><div class="eyebrow">CONFIGURATION</div><h2>Make the network operable.</h2></div><button class="ops-button quiet" type="button" data-launch-refresh>Refresh</button></div>
        <div class="ops-grid" style="padding-top:0">
          <div>
            <form class="ops-card" data-partner-settings><h3>Partner settings</h3>
              <div class="ops-field"><label class="ops-label">Partner<select name="partnerId" required></select></label></div>
              <div class="admin-form-grid"><div class="ops-field"><label class="ops-label">Status<select name="status"><option value="active">Active</option><option value="pending">Pending</option><option value="paused">Paused</option><option value="suspended">Suspended</option></select></label></div><div class="ops-field"><label class="ops-label">Commission %<input name="commission" type="number" min="0" max="100" step="0.1"></label></div></div>
              <div class="ops-field"><label class="ops-label">Paystack recipient code<input name="recipient" placeholder="RCP_..."></label></div>
              <div class="ops-field"><label class="ops-label">Settlement<select name="settlement"><option value="manual">Manual</option><option value="paystack">Paystack</option></select></label></div>
              <button class="ops-button" type="submit">Save partner</button><p class="ops-status" data-partner-settings-status></p>
            </form>
            <form class="ops-card" data-location-settings><h3>Station settings</h3>
              <div class="ops-field"><label class="ops-label">Station<select name="locationId" required></select></label></div>
              <div class="admin-form-grid"><div class="ops-field"><label class="ops-label">Experience<select name="experienceTier"><option value="standard">Standard</option><option value="select">Lune Select</option></select></label></div><div class="ops-field"><label class="ops-label">Acceptance<select name="acceptanceMode"><option value="manual">Manual</option><option value="auto">Auto</option></select></label></div></div>
              <div class="admin-form-grid"><div class="ops-field"><label class="ops-label">Quality score<input name="qualityScore" type="number" min="0" max="100" step="0.1"></label></div><div class="ops-field"><label class="ops-label">Experience tags<input name="tags" placeholder="calm, quiet, premium"></label></div></div>
              <label style="display:flex;gap:8px;margin-bottom:14px"><input name="active" type="checkbox"><span class="ops-muted">Station active</span></label>
              <button class="ops-button" type="submit">Save station</button><p class="ops-status" data-location-settings-status></p>
            </form>
          </div>
          <div>
            <form class="ops-card" data-technician-form><h3>Add technician</h3>
              <div class="ops-field"><label class="ops-label">Partner<select name="partnerId" required></select></label></div>
              <div class="ops-field"><label class="ops-label">Station<select name="locationId" required></select></label></div>
              <div class="ops-field"><label class="ops-label">Name<input name="name" required></label></div>
              <div class="admin-form-grid"><div class="ops-field"><label class="ops-label">Capabilities<input name="capabilities" placeholder="natural_gel, chrome, 3d"></label></div><div class="ops-field"><label class="ops-label">Quality score<input name="qualityScore" type="number" min="0" max="100" step="0.1"></label></div></div>
              <button class="ops-button" type="submit">Add technician</button><p class="ops-status" data-technician-status></p>
            </form>
            <form class="ops-card" data-member-form><h3>Give partner access</h3>
              <div class="ops-field"><label class="ops-label">Partner<select name="partnerId" required></select></label></div>
              <div class="ops-field"><label class="ops-label">Station<select name="locationId"><option value="">All partner stations</option></select></label></div>
              <div class="ops-field"><label class="ops-label">Existing Lune account email<input name="email" type="email" required></label></div>
              <div class="ops-field"><label class="ops-label">Role<select name="role"><option value="manager">Manager</option><option value="technician">Technician</option></select></label></div>
              <button class="ops-button" type="submit">Grant access</button><p class="ops-status" data-member-status></p>
            </form>
          </div>
        </div>
      </section>
      <section class="dashboard-section" id="catalog-control"><div class="dashboard-section-header"><div><div class="eyebrow">CURATION</div><h2>What customers can discover.</h2></div><select data-catalog-kind><option value="work">Work</option><option value="inspo">Inspo</option></select></div><div class="dashboard-list" data-catalog-list></div></section>
      <section class="dashboard-section" id="audit"><div class="dashboard-section-header"><div><div class="eyebrow">AUDIT</div><h2>Recent operational changes.</h2></div></div><div class="dashboard-list" data-audit-list></div></section>`);
  }

  const partnerOptions=()=>partners.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const locationOptions=(partnerId,includeAll=false)=>`${includeAll?'<option value="">All partner stations</option>':''}${locations.filter(l=>!partnerId||l.partner_id===partnerId).map(l=>`<option value="${esc(l.id)}">${esc(l.name)} · ${esc(l.area||'')}</option>`).join('')}`;
  function fillSelects(){
    document.querySelectorAll('[data-partner-settings] select[name="partnerId"], [data-technician-form] select[name="partnerId"], [data-member-form] select[name="partnerId"]').forEach(s=>{const prev=s.value;s.innerHTML=partnerOptions();if(prev&&partners.some(p=>p.id===prev))s.value=prev;});
    const station=$('[data-location-settings] select[name="locationId"]');if(station){const prev=station.value;station.innerHTML=locationOptions('');if(prev&&locations.some(l=>l.id===prev))station.value=prev;}
    syncDependentLocations();syncPartnerSettings();syncLocationSettings();
  }
  function syncDependentLocations(){
    for(const selector of ['[data-technician-form]','[data-member-form]']){const f=$(selector);if(!f)continue;const pid=f.elements.partnerId.value;const prev=f.elements.locationId.value;f.elements.locationId.innerHTML=locationOptions(pid,selector.includes('member'));if(prev&&[...f.elements.locationId.options].some(o=>o.value===prev))f.elements.locationId.value=prev;}
  }
  function syncPartnerSettings(){const f=$('[data-partner-settings]');if(!f)return;const p=partners.find(x=>x.id===f.elements.partnerId.value);if(!p)return;f.elements.status.value=p.status||'pending';f.elements.commission.value=(Number(p.commission_bps||0)/100).toFixed(1);f.elements.recipient.value=p.paystack_recipient_code||'';f.elements.settlement.value=p.settlement_status||'manual';}
  function syncLocationSettings(){const f=$('[data-location-settings]');if(!f)return;const l=locations.find(x=>x.id===f.elements.locationId.value);if(!l)return;f.elements.experienceTier.value=l.experience_tier||'standard';f.elements.acceptanceMode.value=l.acceptance_mode||'manual';f.elements.qualityScore.value=l.quality_score==null?'':l.quality_score;f.elements.tags.value=(l.experience_tags||[]).join(', ');f.elements.active.checked=l.active!==false;}

  async function loadBase(){const [p,l,s]=await Promise.all([req('/admin/partners').then(x=>x.partners||[]),req('/admin/partner-locations').then(x=>x.locations||[]),req('/services').then(x=>x.services||[])]);partners=p;locations=l;services=s;fillSelects();await Promise.all([loadCatalog(),loadAudit()]);}
  async function loadCatalog(){const target=$('[data-catalog-list]');if(!target)return;const data=await req(`/admin/catalog?kind=${encodeURIComponent(catalogKind)}`);const items=data.items||[];target.innerHTML=items.length?items.map(item=>`<article class="dashboard-row" data-catalog-item="${esc(item.id)}"><div><div class="eyebrow">${item.active?'LIVE':'HIDDEN'} · ${esc(item.service_code||'unmapped')}</div><h3>${esc(item.title)}</h3><p>${esc(item.category||item.style||'')}</p></div><div class="ops-actions"><select data-service-code>${services.map(s=>`<option value="${esc(s.code)}" ${s.code===item.service_code?'selected':''}>${esc(s.title)}</option>`).join('')}</select><button class="ops-button quiet" type="button" data-catalog-toggle>${item.active?'Hide':'Publish'}</button></div></article>`).join(''):'<div class="ops-empty">Nothing in this catalog.</div>';}
  async function loadAudit(){const target=$('[data-audit-list]');if(!target)return;const data=await req('/admin/audit');const rows=data.audit||[];target.innerHTML=rows.length?rows.map(a=>`<article class="dashboard-row"><div><div class="eyebrow">${esc(a.action)}</div><h3>${esc(a.object_type||'operation')}${a.object_id?` · ${esc(a.object_id)}`:''}</h3><p>${esc(a.actor_email||'system')} · ${new Date(a.created_at).toLocaleString('en-KE')}</p></div></article>`).join(''):'<div class="ops-empty">No admin changes recorded yet.</div>';}

  function bind(){
    document.addEventListener('change',e=>{if(e.target.matches('[data-partner-settings] select[name="partnerId"]'))syncPartnerSettings();if(e.target.matches('[data-location-settings] select[name="locationId"]'))syncLocationSettings();if(e.target.matches('[data-technician-form] select[name="partnerId"], [data-member-form] select[name="partnerId"]'))syncDependentLocations();if(e.target.matches('[data-catalog-kind]')){catalogKind=e.target.value==='inspo'?'inspo':'work';loadCatalog().catch(()=>{})}});
    $('[data-partner-settings]')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,n=$('[data-partner-settings-status]');status(n,'');try{await req(`/admin/partners/${encodeURIComponent(f.elements.partnerId.value)}`,{method:'PATCH',body:{status:f.elements.status.value,commissionBps:Math.round(Number(f.elements.commission.value||0)*100),paystackRecipientCode:f.elements.recipient.value||null,settlementStatus:f.elements.settlement.value}});status(n,'Partner saved.');await loadBase()}catch(err){status(n,err.message,true)}});
    $('[data-location-settings]')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,n=$('[data-location-settings-status]');status(n,'');try{await req(`/admin/locations/${encodeURIComponent(f.elements.locationId.value)}`,{method:'PATCH',body:{active:f.elements.active.checked,experienceTier:f.elements.experienceTier.value,acceptanceMode:f.elements.acceptanceMode.value,qualityScore:f.elements.qualityScore.value===''?null:Number(f.elements.qualityScore.value),experienceTags:f.elements.tags.value.split(',').map(x=>x.trim()).filter(Boolean)}});status(n,'Station saved.');await loadBase()}catch(err){status(n,err.message,true)}});
    $('[data-technician-form]')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,n=$('[data-technician-status]');status(n,'');try{const caps=f.elements.capabilities.value.split(',').map(x=>x.trim()).filter(Boolean);await req(`/admin/partners/${encodeURIComponent(f.elements.partnerId.value)}/technicians`,{method:'POST',body:{locationId:f.elements.locationId.value,name:f.elements.name.value,qualityScore:f.elements.qualityScore.value===''?null:Number(f.elements.qualityScore.value),capabilities:caps}});status(n,'Technician added.');f.elements.name.value='';f.elements.capabilities.value=''}catch(err){status(n,err.message,true)}});
    $('[data-member-form]')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,n=$('[data-member-status]');status(n,'');try{await req(`/admin/partners/${encodeURIComponent(f.elements.partnerId.value)}/members`,{method:'POST',body:{email:f.elements.email.value,locationId:f.elements.locationId.value||null,role:f.elements.role.value}});status(n,'Partner access granted.');f.elements.email.value=''}catch(err){status(n,err.message==='partner_member_account_required'?'That person needs a Lune account first.':err.message,true)}});
    document.addEventListener('click',async e=>{if(e.target.closest('[data-launch-refresh]'))return loadBase();const row=e.target.closest('[data-catalog-item]');if(row&&e.target.closest('[data-catalog-toggle]')){const button=e.target.closest('[data-catalog-toggle]');const makeActive=button.textContent.trim()==='Publish';try{await req(`/admin/catalog/${catalogKind}/${encodeURIComponent(row.dataset.catalogItem)}`,{method:'PATCH',body:{active:makeActive,serviceCode:row.querySelector('[data-service-code]')?.value||null}});await loadCatalog()}catch(err){alert(err.message)}}});
  }

  async function boot(){let i=0;while(!window.LuneData&&i++<30)await new Promise(r=>setTimeout(r,100));if(window.LuneData?.ready)await window.LuneData.ready.catch(()=>{});const access=await req('/access').catch(()=>null);if(!access?.isAdmin)return;mount();bind();await loadBase();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
