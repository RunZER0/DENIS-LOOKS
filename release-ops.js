'use strict';

module.exports = function installReleaseOps(app,{pool,requireDb,sessionUser,id}) {
  const adminEmails=new Set(String(process.env.LUNE_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
  const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
  const safe=(v,n=240)=>String(v??'').trim().slice(0,n);

  async function fullUser(req){
    const base=await sessionUser(req);if(!base)return null;
    const {rows}=await pool.query('SELECT id,email,role FROM lune_users WHERE id=$1 LIMIT 1',[base.id]);
    return rows[0]||null;
  }
  async function requireAdmin(req){
    const user=await fullUser(req);if(!user)throw Object.assign(new Error('authentication_required'),{status:401});
    if(user.role!=='admin'&&!adminEmails.has(String(user.email).toLowerCase()))throw Object.assign(new Error('admin_required'),{status:403});
    return user;
  }
  async function memberships(req){
    const user=await fullUser(req);if(!user)throw Object.assign(new Error('authentication_required'),{status:401});
    const isAdmin=user.role==='admin'||adminEmails.has(String(user.email).toLowerCase());
    const {rows}=await pool.query(`SELECT m.partner_id,m.location_id,m.role,p.name AS partner_name FROM lune_partner_members m JOIN lune_partners p ON p.id=m.partner_id WHERE m.user_id=$1 AND m.status='active'`,[user.id]);
    if(!rows.length&&!isAdmin)throw Object.assign(new Error('partner_access_required'),{status:403});
    return {user,isAdmin,rows};
  }

  app.get('/api/partner/locations',requireDb,asyncRoute(async(req,res)=>{
    const ctx=await memberships(req);const ids=ctx.rows.map(x=>x.partner_id);
    if(!ids.length)return res.json({locations:[]});
    const {rows}=await pool.query(`SELECT l.id,l.partner_id,l.name,l.address,l.area,l.experience_tier,l.experience_tags,l.quality_score,l.email,l.phone,l.google_maps_url,l.acceptance_mode,l.active FROM lune_partner_locations l WHERE l.partner_id=ANY($1::text[]) ORDER BY l.active DESC,l.name`,[ids]);
    res.json({locations:rows});
  }));

  app.get('/api/admin/partner-locations',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);const partnerId=safe(req.query.partnerId,180);
    const {rows}=partnerId?await pool.query('SELECT * FROM lune_partner_locations WHERE partner_id=$1 ORDER BY active DESC,name',[partnerId]):await pool.query('SELECT * FROM lune_partner_locations ORDER BY active DESC,name');
    res.json({locations:rows});
  }));

  app.get('/api/admin/partner-technicians',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);const partnerId=safe(req.query.partnerId,180);
    const {rows}=partnerId?await pool.query(`SELECT t.*,l.name AS location_name,COALESCE(array_agg(c.capability) FILTER(WHERE c.capability IS NOT NULL),ARRAY[]::text[]) AS capabilities FROM lune_technicians t JOIN lune_partner_locations l ON l.id=t.location_id LEFT JOIN lune_technician_capabilities c ON c.technician_id=t.id WHERE t.partner_id=$1 GROUP BY t.id,l.name ORDER BY t.status,t.name`,[partnerId]):await pool.query(`SELECT t.*,l.name AS location_name,COALESCE(array_agg(c.capability) FILTER(WHERE c.capability IS NOT NULL),ARRAY[]::text[]) AS capabilities FROM lune_technicians t JOIN lune_partner_locations l ON l.id=t.location_id LEFT JOIN lune_technician_capabilities c ON c.technician_id=t.id GROUP BY t.id,l.name ORDER BY t.status,t.name`);
    res.json({technicians:rows});
  }));

  app.patch('/api/admin/partners/:id',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);const fields=[],values=[];const add=(c,v)=>{values.push(v);fields.push(`${c}=$${values.length}`)};
    if(req.body?.status!=null)add('status',safe(req.body.status,30));
    if(req.body?.commissionBps!=null)add('commission_bps',Math.max(0,Math.min(10000,Number(req.body.commissionBps))));
    if(req.body?.paystackRecipientCode!=null)add('paystack_recipient_code',safe(req.body.paystackRecipientCode,180)||null);
    if(req.body?.settlementStatus!=null)add('settlement_status',safe(req.body.settlementStatus,30));
    if(!fields.length)return res.json({ok:true});values.push(req.params.id);
    await pool.query(`UPDATE lune_partners SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length}`,values);res.json({ok:true});
  }));

  app.patch('/api/admin/locations/:id',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);const fields=[],values=[];const add=(c,v)=>{values.push(v);fields.push(`${c}=$${values.length}`)};
    if(req.body?.active!=null)add('active',Boolean(req.body.active));
    if(req.body?.experienceTier!=null)add('experience_tier',safe(req.body.experienceTier,40));
    if(req.body?.qualityScore!=null)add('quality_score',Number(req.body.qualityScore));
    if(req.body?.acceptanceMode!=null)add('acceptance_mode',req.body.acceptanceMode==='auto'?'auto':'manual');
    if(req.body?.experienceTags!=null){values.push(Array.isArray(req.body.experienceTags)?req.body.experienceTags.map(x=>safe(x,40)).filter(Boolean):[]);fields.push(`experience_tags=$${values.length}::text[]`)}
    if(!fields.length)return res.json({ok:true});values.push(req.params.id);
    await pool.query(`UPDATE lune_partner_locations SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length}`,values);res.json({ok:true});
  }));

  app.get('/api/admin/catalog',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);const kind=req.query.kind==='inspo'?'inspo':'work';
    const table=kind==='inspo'?'lune_inspo_items':'lune_work_items';
    const {rows}=await pool.query(`SELECT * FROM ${table} ORDER BY active DESC,title`);res.json({kind,items:rows});
  }));

  app.patch('/api/admin/catalog/:kind/:id',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);const kind=req.params.kind==='inspo'?'inspo':req.params.kind==='work'?'work':null;if(!kind)return res.status(400).json({error:'invalid_catalog_kind'});
    const table=kind==='inspo'?'lune_inspo_items':'lune_work_items';const fields=[],values=[];const add=(c,v)=>{values.push(v);fields.push(`${c}=$${values.length}`)};
    if(req.body?.active!=null)add('active',Boolean(req.body.active));
    if(req.body?.title!=null)add('title',safe(req.body.title,180));
    if(req.body?.serviceCode!=null)add('service_code',safe(req.body.serviceCode,80)||null);
    if(kind==='inspo'&&req.body?.editorialScore!=null)add('editorial_score',Number(req.body.editorialScore));
    if(kind==='work'&&req.body?.popularityScore!=null)add('popularity_score',Number(req.body.popularityScore));
    if(!fields.length)return res.json({ok:true});values.push(req.params.id);
    await pool.query(`UPDATE ${table} SET ${fields.join(',')} WHERE id=$${values.length}`,values);res.json({ok:true});
  }));

  async function expireUnpaidHolds(){
    const {rows}=await pool.query(`UPDATE lune_orders SET status='cancelled',cancellation_reason='payment_window_expired',cancelled_at=now(),updated_at=now()
      WHERE payment_status<>'paid' AND ((status='partner_accepted' AND updated_at<now()-interval '20 minutes') OR (status='payment_pending' AND updated_at<now()-interval '2 hours'))
      RETURNING id,status`);
    for(const row of rows){
      await pool.query(`UPDATE lune_order_allocations SET status='released',responded_at=COALESCE(responded_at,now()),response_note=COALESCE(response_note,'Payment window expired') WHERE order_id=$1 AND status='accepted'`,[row.id]);
      await pool.query(`INSERT INTO lune_order_events(id,order_id,actor_kind,actor_id,event_type,from_status,to_status,metadata) VALUES($1,$2,'system','release-ops','payment_window_expired',NULL,'cancelled','{}'::jsonb)`,[id('evt'),row.id]).catch(()=>{});
    }
    return rows.length;
  }

  const timer=setInterval(()=>expireUnpaidHolds().catch(err=>console.error('[lune-hold-expiry]',err.message)),60000);timer.unref?.();
  return {expireUnpaidHolds};
};
