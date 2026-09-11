'use strict';

const crypto = require('crypto');
const createPaystack = require('./lib/paystack');
const createNotifier = require('./lib/notify');
const createAllocator = require('./lib/allocation');

module.exports = function installLuneOps(app, { pool, requireDb, sessionUser, ensureVisitor, id }) {
  const paystack = createPaystack();
  const notifier = createNotifier({ pool, id });
  const allocator = createAllocator({ pool, id, notifier });
  const adminEmails = new Set(['www.valdaceai@gmail.com', ...String(process.env.LUNE_ADMIN_EMAILS || '').split(',')].map(x => x.trim().toLowerCase()).filter(Boolean));
  const publicBase = () => String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const safe = (value, max = 240) => String(value || '').trim().slice(0, max);
  const slugify = value => safe(value,160).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'lune-set';
  const imageDataUrl = value => {
    const image = String(value || '');
    return /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(image) && Buffer.byteLength(image, 'utf8') <= 3 * 1024 * 1024 ? image : null;
  };
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim().toLowerCase());
  const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
  const token = () => crypto.randomBytes(32).toString('base64url');
  const json = value => JSON.stringify(value || {});
  const nowIso = () => new Date().toISOString();
  const emailEscape = value => String(value || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  const appointmentTime = value => {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('en-KE', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Nairobi' }).format(new Date(value)); }
    catch (_) { return ''; }
  };
  const confirmationEmail = order => {
    const name = emailEscape(order.customer_name || 'there');
    const details = [appointmentTime(order.scheduled_for), order.location_name, order.location_address].filter(Boolean).map(emailEscape);
    const directions = order.google_maps_url ? `<p><a href="${emailEscape(order.google_maps_url)}">Directions</a></p>` : '';
    return `<p>Hi ${name}, you’re confirmed.</p>${details.length ? `<p>${details.join('<br>')}</p>` : ''}${directions}<p>Your set is saved for you. See you soon.</p>`;
  };

  function asyncRoute(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  }

  function requestBase(req) {
    const configured = publicBase();
    if (configured) return configured;
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    return `${proto}://${req.get('host')}`;
  }

  async function fullUser(req) {
    const base = await sessionUser(req);
    if (!base) return null;
    const { rows } = await pool.query('SELECT id,email,display_name,phone,role,marketing_opt_in FROM lune_users WHERE id=$1 LIMIT 1', [base.id]);
    return rows[0] || null;
  }

  function publicAccessUser(user) {
    if (!user) return null;
    return {
      id:user.id,
      email:user.email,
      displayName:user.display_name || '',
      phone:user.phone || '',
      role:user.role || 'customer',
      marketingOptIn:Boolean(user.marketing_opt_in)
    };
  }

  async function accessContext(req) {
    const user = await fullUser(req);
    if (!user) return { user:null, isAdmin:false, memberships:[] };
    const isAdmin = user.role === 'admin' || adminEmails.has(String(user.email).toLowerCase());
    const { rows } = await pool.query(`SELECT m.id,m.partner_id,m.location_id,m.role,m.status,p.name AS partner_name
      FROM lune_partner_members m JOIN lune_partners p ON p.id=m.partner_id
      WHERE m.user_id=$1 AND m.status='active'`, [user.id]);
    return { user, isAdmin, memberships:rows };
  }

  async function requireAdmin(req) {
    const ctx = await accessContext(req);
    if (!ctx.user) throw Object.assign(new Error('authentication_required'), { status:401 });
    if (!ctx.isAdmin) throw Object.assign(new Error('admin_required'), { status:403 });
    return ctx;
  }

  async function requirePartner(req, partnerId = null) {
    const ctx = await accessContext(req);
    if (!ctx.user) throw Object.assign(new Error('authentication_required'), { status:401 });
    const memberships = partnerId ? ctx.memberships.filter(m => m.partner_id === partnerId) : ctx.memberships;
    if (!memberships.length && !ctx.isAdmin) throw Object.assign(new Error('partner_access_required'), { status:403 });
    return { ...ctx, memberships:ctx.isAdmin && !memberships.length ? ctx.memberships : memberships };
  }

  async function visitorForRequest(req, user = null) {
    const visitorId = req.body?.visitorId || req.query?.visitorId || req.headers['x-lune-visitor'];
    if (!visitorId) return null;
    return ensureVisitor(String(visitorId), user?.id || null);
  }

  async function canAccessOrder(req, order) {
    const ctx = await accessContext(req);
    if (ctx.isAdmin) return { allowed:true, ctx };
    if (ctx.user && order.user_id && ctx.user.id === order.user_id) return { allowed:true, ctx };
    if (ctx.memberships.some(m => m.partner_id === order.partner_id || m.location_id === order.allocated_location_id)) return { allowed:true, ctx };
    const suppliedToken = req.query?.token || req.body?.token || req.headers['x-lune-order-token'];
    if (suppliedToken && order.access_token_hash && hash(suppliedToken) === order.access_token_hash) return { allowed:true, ctx };
    const visitorKey = req.query?.visitorId || req.body?.visitorId || req.headers['x-lune-visitor'];
    if (visitorKey && order.visitor_id) {
      const { rows } = await pool.query('SELECT id FROM lune_visitors WHERE anonymous_key=$1 LIMIT 1', [String(visitorKey)]);
      if (rows[0]?.id === order.visitor_id) return { allowed:true, ctx };
    }
    return { allowed:false, ctx };
  }

  async function orderRow(orderId) {
    const { rows } = await pool.query(`SELECT o.*,l.name AS location_name,l.address AS location_address,l.area AS location_area,
      l.latitude AS location_latitude,l.longitude AS location_longitude,l.google_maps_url,l.experience_tier,
      p.id AS partner_id,p.name AS partner_name,p.email AS partner_email,l.email AS location_email,p.commission_bps,
      t.name AS technician_name,s.title AS service_title,s.capabilities AS service_capabilities
      FROM lune_orders o
      LEFT JOIN lune_partner_locations l ON l.id=o.allocated_location_id
      LEFT JOIN lune_partners p ON p.id=l.partner_id
      LEFT JOIN lune_technicians t ON t.id=o.allocated_technician_id
      LEFT JOIN lune_services s ON s.code=o.service_code
      WHERE o.id=$1 LIMIT 1`, [orderId]);
    return rows[0] || null;
  }

  async function orderPayload(order) {
    const [payment, allocation, events, review] = await Promise.all([
      pool.query(`SELECT id,reference,amount_kes,currency,status,paid_at,initialized_at FROM lune_payments WHERE order_id=$1 ORDER BY initialized_at DESC LIMIT 1`, [order.id]),
      pool.query(`SELECT id,status,offered_at,expires_at,responded_at,location_id FROM lune_order_allocations WHERE order_id=$1 ORDER BY offered_at DESC LIMIT 1`, [order.id]),
      pool.query(`SELECT event_type,from_status,to_status,metadata,created_at FROM lune_order_events WHERE order_id=$1 ORDER BY created_at ASC`, [order.id]),
      pool.query(`SELECT rating,comment,photo_data_url,photo_caption,created_at FROM lune_reviews WHERE order_id=$1 LIMIT 1`, [order.id])
    ]);
    const directions = order.google_maps_url || (order.location_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.location_address)}` : null);
    return {
      id:order.id,
      itemKind:order.item_kind,
      itemId:order.item_id,
      item:order.item_snapshot || {},
      service:{ code:order.service_code,title:order.service_title || order.service_code,durationMinutes:Number(order.duration_minutes || 90) },
      customer:{ name:order.customer_name || '',email:order.customer_email || '',phone:order.customer_phone || '' },
      experiencePreference:order.experience_preference,
      scheduledFor:order.scheduled_for,
      status:order.status,
      paymentStatus:order.payment_status,
      subtotalKes:Number(order.subtotal_kes ?? order.amount_kes ?? 0),
      discountKes:Number(order.discount_kes || 0),
      amountKes:Number(order.amount_kes || 0),
      partySize:Number(order.party_size || 1),
      currency:order.currency || 'KES',
      requestedArea:order.requested_area,
      location:order.allocated_location_id ? {
        id:order.allocated_location_id,
        name:order.location_name,
        address:order.location_address,
        area:order.location_area,
        latitude:order.location_latitude == null ? null : Number(order.location_latitude),
        longitude:order.location_longitude == null ? null : Number(order.location_longitude),
        experienceTier:order.experience_tier,
        partnerName:order.partner_name,
        technicianName:order.technician_name,
        directionsUrl:directions
      } : null,
      allocation:allocation.rows[0] || null,
      payment:payment.rows[0] || null,
      events:events.rows,
      review:review.rows[0] || null,
      createdAt:order.created_at,
      confirmedAt:order.confirmed_at,
      completedAt:order.completed_at,
      sourceOrderId:order.source_order_id
    };
  }

  async function resolveItem(itemKind, itemId) {
    if (itemKind === 'work') {
      const { rows } = await pool.query(`SELECT id,slug,title,category,style,description,image_url,price_kes,tags,service_code FROM lune_work_items WHERE id=$1 AND active=true LIMIT 1`, [itemId]);
      const item = rows[0];
      return item ? { ...item, imageUrl:item.image_url, priceKes:Number(item.price_kes || 0) } : null;
    }
    if (itemKind === 'inspo') {
      const { rows } = await pool.query(`SELECT id,slug,title,category,image_url,shape,length,finish,palette,structure,tags,service_code FROM lune_inspo_items WHERE id=$1 AND active=true LIMIT 1`, [itemId]);
      const item = rows[0];
      return item ? { ...item, style:item.title, imageUrl:item.image_url } : null;
    }
    return null;
  }

  async function serviceByCode(code) {
    const { rows } = await pool.query('SELECT * FROM lune_services WHERE code=$1 AND active=true LIMIT 1', [code]);
    return rows[0] || null;
  }

  async function activeOfferFor({ code, user, visitor, subtotalKes }) {
    if (!code) return { offer:null, discountKes:0 };
    const { rows } = await pool.query(`SELECT * FROM lune_offers WHERE upper(code)=upper($1) AND active=true
      AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) LIMIT 1`, [String(code)]);
    const offer = rows[0];
    if (!offer) return { offer:null, discountKes:0 };
    const reward = offer.reward || {};
    let discount = 0;
    if (reward.type === 'fixed_kes') discount = Math.max(0, Number(reward.amount || 0));
    if (reward.type === 'percent') discount = Math.round(Number(subtotalKes) * Math.max(0, Math.min(100, Number(reward.percent || 0))) / 100);
    discount = Math.min(Number(subtotalKes), Math.round(discount));
    const ownerFilter = user ? ['user_id',$2 = undefined] : null;
    void ownerFilter;
    return { offer, discountKes:discount };
  }

  async function logAdmin(userId, action, objectType, objectId, metadata = {}) {
    await pool.query(`INSERT INTO lune_admin_audit (id,user_id,action,object_type,object_id,metadata)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [id('aud'),userId,action,objectType || null,objectId || null,json(metadata)]);
  }

  async function finalizeSuccessfulPayment(reference, providerData = null) {
    const client = await pool.connect();
    let order;
    try {
      await client.query('BEGIN');
      const pr = await client.query(`SELECT p.*,o.status AS order_status,o.customer_email,o.customer_name,o.allocated_location_id,
        l.partner_id,pt.commission_bps
        FROM lune_payments p JOIN lune_orders o ON o.id=p.order_id
        LEFT JOIN lune_partner_locations l ON l.id=o.allocated_location_id
        LEFT JOIN lune_partners pt ON pt.id=l.partner_id
        WHERE p.reference=$1 FOR UPDATE OF p`, [reference]);
      const payment = pr.rows[0];
      if (!payment) throw Object.assign(new Error('payment_not_found'), { status:404 });
      if (payment.status === 'paid') {
        const or = await client.query('SELECT * FROM lune_orders WHERE id=$1',[payment.order_id]);
        await client.query('COMMIT');
        return or.rows[0];
      }
      const data = providerData || (await paystack.verify(reference)).data;
      const expectedSubunit = Number(payment.amount_kes) * 100;
      if (data?.status !== 'success') throw Object.assign(new Error('payment_not_successful'), { status:409 });
      if (Number(data.amount) !== expectedSubunit) throw Object.assign(new Error('payment_amount_mismatch'), { status:409 });
      if (String(data.currency || '').toUpperCase() !== String(payment.currency || 'KES').toUpperCase()) throw Object.assign(new Error('payment_currency_mismatch'), { status:409 });
      await client.query(`UPDATE lune_payments SET status='paid',provider_transaction_id=$2,provider_payload=$3::jsonb,paid_at=COALESCE($4::timestamptz,now()),updated_at=now() WHERE id=$1`,
        [payment.id,String(data.id || ''),json(data),data.paid_at || data.paidAt || null]);
      const or = await client.query(`UPDATE lune_orders SET payment_status='paid',status='confirmed',confirmed_at=COALESCE(confirmed_at,now()),updated_at=now() WHERE id=$1 RETURNING *`, [payment.order_id]);
      order = or.rows[0];
      if (payment.partner_id) {
        const commissionBps = Math.max(0, Math.min(10000, Number(payment.commission_bps || 0)));
        const gross = Number(payment.amount_kes);
        const commission = Math.round(gross * commissionBps / 10000);
        const net = Math.max(0, gross - commission);
        await client.query(`INSERT INTO lune_partner_payouts (id,order_id,partner_id,gross_kes,commission_kes,net_kes,status)
          VALUES ($1,$2,$3,$4,$5,$6,'held') ON CONFLICT (order_id) DO NOTHING`, [id('pay'),order.id,payment.partner_id,gross,commission,net]);
      }
      await client.query('COMMIT');
      await allocator.recordEvent(order.id,'payment_confirmed',payment.order_status,'confirmed',{reference},'system','paystack');
      const emailOrder = await orderRow(order.id).catch(() => order);
      notifier.customer({
        to:emailOrder.customer_email,
        subject:'You’re confirmed with Lune',
        html:confirmationEmail(emailOrder)
      }).catch(() => {});
      if (emailOrder.partner_id) {
        notifier.partner({
          partnerId:emailOrder.partner_id,locationId:emailOrder.allocated_location_id,orderId:emailOrder.id,allocationId:null,
          to:emailOrder.location_email || emailOrder.partner_email,type:'booking_confirmed',subject:'Confirmed Lune booking',
          html:`<p>Your Lune booking is confirmed.</p><p><strong>${emailEscape(emailOrder.item_snapshot?.title || 'Lune appointment')}</strong><br>${emailEscape(appointmentTime(emailOrder.scheduled_for))}<br>${emailEscape(emailOrder.customer_name || 'Client')}</p><p>Everything you need is in Partner space.</p>`
        }).catch(() => {});
      }
      return order;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  }

  app.get('/api/access', requireDb, asyncRoute(async (req,res) => {
    const ctx = await accessContext(req);
    res.json({ user:publicAccessUser(ctx.user), isAdmin:ctx.isAdmin, memberships:ctx.memberships });
  }));

  app.post('/api/partner-applications', requireDb, asyncRoute(async (req,res) => {
    const studioName = safe(req.body?.studioName,160), contactName = safe(req.body?.contactName,120);
    const email = safe(req.body?.email,200).toLowerCase();
    if (!studioName || !contactName || !validEmail(email)) return res.status(400).json({ error:'studio_contact_and_email_required' });
    const services = Array.isArray(req.body?.services) ? req.body.services.map(x => safe(x,60)).filter(Boolean).slice(0,12) : [];
    const applicationId = id('app');
    await pool.query(`INSERT INTO lune_partner_applications
      (id,studio_name,contact_name,email,phone,area,address,team_size,portfolio_url,instagram_url,services,client_experience,select_interest)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [applicationId,studioName,contactName,email,safe(req.body?.phone,50)||null,safe(req.body?.area,120)||null,safe(req.body?.address,300)||null,
       Math.max(1,Math.min(100,Number(req.body?.teamSize || 1))),safe(req.body?.portfolioUrl,600)||null,safe(req.body?.instagramUrl,600)||null,services,safe(req.body?.clientExperience,1000)||null,Boolean(req.body?.selectInterest)]);
    notifier.customer({ to:email,subject:'We have your Lune application',html:`<p>Hi ${emailEscape(contactName)}, we have your application for ${emailEscape(studioName)}.</p><p>We will review the work, the client experience and the fit before we come back to you.</p>` }).catch(() => {});
    res.status(201).json({ ok:true,id:applicationId });
  }));

  app.get('/api/services', requireDb, asyncRoute(async (_req,res) => {
    const { rows } = await pool.query('SELECT code,title,description,base_price_kes,duration_minutes,capabilities FROM lune_services WHERE active=true ORDER BY base_price_kes,title');
    res.json({ services:rows.map(r => ({...r,basePriceKes:Number(r.base_price_kes),durationMinutes:Number(r.duration_minutes)})) });
  }));

  app.get('/api/booking/item', requireDb, asyncRoute(async (req,res) => {
    const kind = safe(req.query.kind,20);
    const itemId = safe(req.query.id,160);
    const item = await resolveItem(kind,itemId);
    if (!item) return res.status(404).json({ error:'item_not_found' });
    const service = await serviceByCode(item.service_code || 'natural_gel');
    res.json({ item, service:service ? {code:service.code,title:service.title,basePriceKes:Number(service.base_price_kes),durationMinutes:Number(service.duration_minutes)} : null });
  }));

  app.get('/api/booking/matches', requireDb, asyncRoute(async (req,res) => {
    const kind = safe(req.query.kind,20);
    const itemId = safe(req.query.id,160);
    if (!['work','inspo'].includes(kind) || !itemId) return res.status(400).json({ error:'item_required' });
    const scheduledFor = req.query.scheduledFor;
    const when = new Date(scheduledFor);
    if (!scheduledFor || Number.isNaN(when.getTime())) return res.status(400).json({ error:'valid_schedule_required' });
    const result = await allocator.publicMatches({
      itemKind:kind,itemId,scheduledFor:when.toISOString(),
      durationMinutes:Number(req.query.durationMinutes || 0) || undefined,
      experiencePreference:safe(req.query.experience,20) || 'closest',
      preferredLocationId:safe(req.query.preferredLocationId,160) || null,
      forcePreferredLocation:req.query.forcePreferred === 'true',
      latitude:req.query.lat == null ? null : Number(req.query.lat),
      longitude:req.query.lng == null ? null : Number(req.query.lng),
      area:safe(req.query.area,120) || null
    });
    res.json(result);
  }));

  app.post('/api/orders', requireDb, asyncRoute(async (req,res) => {
    const user = await fullUser(req);
    const visitor = await visitorForRequest(req,user);
    if (!visitor) return res.status(400).json({ error:'visitor_id_required' });
    const itemKind = safe(req.body?.itemKind,20);
    const itemId = safe(req.body?.itemId,160);
    if (!['work','inspo'].includes(itemKind) || !itemId) return res.status(400).json({ error:'item_required' });
    const item = await resolveItem(itemKind,itemId);
    if (!item) return res.status(404).json({ error:'item_not_found' });
    const service = await serviceByCode(item.service_code || 'natural_gel');
    if (!service) return res.status(409).json({ error:'service_unavailable' });
    const when = new Date(req.body?.scheduledFor);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 15*60000) return res.status(400).json({ error:'valid_future_schedule_required' });
    const customerName = safe(req.body?.customerName || user?.display_name,120);
    const customerEmail = safe(req.body?.customerEmail || user?.email,200).toLowerCase();
    const customerPhone = safe(req.body?.customerPhone || user?.phone,50);
    if (!validEmail(customerEmail)) return res.status(400).json({ error:'valid_email_required' });
    if (!customerPhone) return res.status(400).json({ error:'phone_required' });
    const experience = ['closest','select','calm','same'].includes(req.body?.experiencePreference) ? req.body.experiencePreference : 'closest';
    const preferredLocationId = safe(req.body?.preferredLocationId,160) || null;
    const forcePreferred = Boolean(req.body?.forcePreferredLocation && preferredLocationId);
    const servicePrice = itemKind === 'work' && Number(item.price_kes || item.priceKes) > 0 ? Number(item.price_kes || item.priceKes) : Number(service.base_price_kes);
    const experienceFee = experience === 'select' ? 500 : 0;
    const subtotal = servicePrice + experienceFee;
    const offerResult = await activeOfferFor({ code:safe(req.body?.offerCode,80),user,visitor,subtotalKes:subtotal });
    const discount = offerResult.discountKes;
    const amount = Math.max(0,subtotal-discount);
    const orderId = id('ord');
    const accessToken = token();
    const source = safe(req.body?.source,80) || 'booking';
    const snapshot = {
      id:item.id,
      title:item.title || item.style,
      style:item.style || item.title,
      category:item.category,
      imageUrl:item.imageUrl || item.image_url,
      serviceCode:service.code
    };
    await pool.query(`INSERT INTO lune_orders
      (id,user_id,visitor_id,item_kind,item_id,item_snapshot,preferred_location_id,experience_preference,scheduled_for,status,
       amount_kes,payment_status,customer_name,customer_email,customer_phone,requested_area,requested_latitude,requested_longitude,
       duration_minutes,service_code,force_preferred_location,subtotal_kes,discount_kes,experience_fee_kes,currency,access_token_hash,source,referral_code,party_size)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,'matching',$10,'unpaid',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'KES',$23,$24,$25,$26)`,
      [orderId,user?.id || null,visitor.id,itemKind,itemId,json(snapshot),preferredLocationId,experience,when.toISOString(),amount,
       customerName || null,customerEmail,customerPhone,safe(req.body?.area,120) || null,
       req.body?.latitude == null ? null : Number(req.body.latitude),req.body?.longitude == null ? null : Number(req.body.longitude),
       Number(service.duration_minutes),service.code,forcePreferred,subtotal,discount,experienceFee,hash(accessToken),source,safe(req.body?.referralCode,80) || null,Math.max(1,Math.min(6,Number(req.body?.partySize || 1)))]);
    await allocator.recordEvent(orderId,'order_created',null,'matching',{experience,serviceCode:service.code,offerCode:offerResult.offer?.code || null},user ? 'user':'visitor',user?.id || visitor.id);
    const allocation = await allocator.allocateOrder(orderId);
    if (offerResult.offer) {
      await pool.query(`INSERT INTO lune_offer_assignments (id,offer_id,user_id,visitor_id,reason,status,redeemed_at)
        VALUES ($1,$2,$3,$4,'booking','redeemed',now())`, [id('ofa'),offerResult.offer.id,user?.id || null,user ? null : visitor.id]);
    }
    res.status(201).json({ id:orderId,token:accessToken,status:allocation.status,amountKes:amount,subtotalKes:subtotal,discountKes:discount });
  }));

  app.get('/api/orders/:id', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    const access = await canAccessOrder(req,order);
    if (!access.allowed) return res.status(403).json({ error:'order_access_denied' });
    res.json({ order:await orderPayload(order) });
  }));

  app.get('/api/orders/:id/reorder', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    const access = await canAccessOrder(req,order);
    if (!access.allowed) return res.status(403).json({ error:'order_access_denied' });
    if (!['completed','reviewed','confirmed','upcoming'].includes(order.status)) return res.status(409).json({ error:'order_not_reorderable' });
    res.json({ seed:{
      itemKind:order.item_kind,itemId:order.item_id,item:order.item_snapshot,
      preferredLocationId:order.allocated_location_id || null,preferredLocationName:order.location_name || null,
      experiencePreference:order.allocated_location_id ? 'same' : (order.experience_preference || 'closest'),
      sourceOrderId:order.id
    }});
  }));

  app.get('/api/orders/:id/evolve', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    const access = await canAccessOrder(req,order);
    if (!access.allowed) return res.status(403).json({ error:'order_access_denied' });
    const kind = order.item_kind === 'work' ? 'work' : 'inspo';
    const table = kind === 'work' ? 'lune_work_items' : 'lune_inspo_items';
    const tags = Array.isArray(order.item_snapshot?.tags) ? order.item_snapshot.tags.slice(0,12) : [];
    const { rows } = await pool.query(`SELECT id,title,category,image_url,tags FROM ${table} WHERE active=true AND id<>$1 ORDER BY CASE WHEN tags && $2::text[] THEN 0 ELSE 1 END,random() LIMIT 4`,[order.item_id,tags]);
    res.json({ origin:order.item_snapshot,kind,items:rows });
  }));

  app.post('/api/orders/:id/payment', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    const access = await canAccessOrder(req,order);
    if (!access.allowed) return res.status(403).json({ error:'order_access_denied' });
    if (!['partner_accepted','payment_pending'].includes(order.status)) return res.status(409).json({ error:'order_not_ready_for_payment' });
    if (order.payment_status === 'paid') return res.status(409).json({ error:'order_already_paid' });
    if (!validEmail(order.customer_email)) return res.status(409).json({ error:'customer_email_missing' });
    const reference = `LUNE-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const paymentId = id('txn');
    await pool.query(`INSERT INTO lune_payments (id,order_id,reference,amount_kes,currency,status) VALUES ($1,$2,$3,$4,'KES','initializing')`,
      [paymentId,order.id,reference,Number(order.amount_kes)]);
    const suppliedToken = req.body?.token || req.query?.token || '';
    const callback = new URL('/payment/callback',requestBase(req));
    callback.searchParams.set('order',order.id);
    if (suppliedToken) callback.searchParams.set('token',suppliedToken);
    try {
      const result = await paystack.initialize({
        email:order.customer_email,
        amountKes:Number(order.amount_kes),
        reference,
        callbackUrl:callback.toString(),
        metadata:{ order_id:order.id,item_kind:order.item_kind,item_id:order.item_id,location_id:order.allocated_location_id }
      });
      await pool.query(`UPDATE lune_payments SET status='initialized',access_code=$2,provider_payload=$3::jsonb,updated_at=now() WHERE id=$1`,
        [paymentId,result.data?.access_code || null,json(result.data || {})]);
      await pool.query(`UPDATE lune_orders SET status='payment_pending',payment_status='pending',updated_at=now() WHERE id=$1`,[order.id]);
      await allocator.recordEvent(order.id,'payment_initialized',order.status,'payment_pending',{reference});
      res.json({ authorizationUrl:result.data?.authorization_url,accessCode:result.data?.access_code,reference });
    } catch (err) {
      await pool.query(`UPDATE lune_payments SET status='failed',provider_payload=$2::jsonb,updated_at=now() WHERE id=$1`,[paymentId,json(err.provider || {message:err.message})]);
      await pool.query(`UPDATE lune_orders SET status='partner_accepted',payment_status='unpaid',updated_at=now() WHERE id=$1`,[order.id]);
      throw err;
    }
  }));

  app.get('/payment/callback', requireDb, asyncRoute(async (req,res) => {
    const reference = safe(req.query.reference,180);
    const orderId = safe(req.query.order,180);
    const suppliedToken = safe(req.query.token,300);
    let outcome = 'pending';
    if (reference) {
      try { await finalizeSuccessfulPayment(reference); outcome = 'success'; }
      catch (err) { outcome = err.message === 'payment_not_successful' ? 'pending' : 'failed'; }
    }
    const target = new URL('/order.html',requestBase(req));
    if (orderId) target.searchParams.set('id',orderId);
    if (suppliedToken) target.searchParams.set('token',suppliedToken);
    target.searchParams.set('payment',outcome);
    res.redirect(303,target.toString());
  }));

  app.post('/api/paystack/webhook', requireDb, asyncRoute(async (req,res) => {
    const signature = req.headers['x-paystack-signature'];
    if (!paystack.verifyWebhook(req.body,signature)) return res.status(401).json({ error:'invalid_signature' });
    const event = req.body || {};
    if (event.event === 'charge.success' && event.data?.reference) {
      try { await finalizeSuccessfulPayment(String(event.data.reference),event.data); }
      catch (err) { console.error('[lune-paystack-webhook]',err.message); }
    }
    if (String(event.event || '').startsWith('transfer.')) {
      const status = event.event === 'transfer.success' ? 'paid' : event.event === 'transfer.reversed' ? 'reversed' : 'failed';
      const reference = event.data?.reference;
      if (reference) await pool.query(`UPDATE lune_partner_payouts SET status=$2,provider_payload=$3::jsonb,paid_at=CASE WHEN $2='paid' THEN now() ELSE paid_at END,updated_at=now() WHERE provider_reference=$1`,[String(reference),status,json(event.data || {})]);
    }
    if (String(event.event || '').startsWith('refund.')) {
      const providerId = event.data?.id == null ? null : String(event.data.id);
      if (providerId) await pool.query(`UPDATE lune_refunds SET status=$2,provider_payload=$3::jsonb,updated_at=now() WHERE provider_refund_id=$1`,[providerId,String(event.data?.status || 'pending'),json(event.data || {})]);
    }
    res.sendStatus(200);
  }));

  app.post('/api/orders/:id/review', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    const access = await canAccessOrder(req,order);
    if (!access.allowed) return res.status(403).json({ error:'order_access_denied' });
    if (!['completed','reviewed'].includes(order.status)) return res.status(409).json({ error:'review_not_available' });
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error:'rating_required' });
    const user = await fullUser(req);
    const visitor = await visitorForRequest(req,user);
    const photo = imageDataUrl(req.body?.photoDataUrl);
    if (req.body?.photoDataUrl && !photo) return res.status(400).json({ error:'photo_too_large_or_invalid' });
    await pool.query(`INSERT INTO lune_reviews (id,order_id,user_id,visitor_id,rating,comment,photo_data_url,photo_caption)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (order_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,photo_data_url=COALESCE(EXCLUDED.photo_data_url,lune_reviews.photo_data_url),photo_caption=COALESCE(EXCLUDED.photo_caption,lune_reviews.photo_caption)`,
      [id('rev'),order.id,user?.id || null,user ? null : visitor?.id || null,rating,safe(req.body?.comment,1200) || null,photo,safe(req.body?.photoCaption,240) || null]);
    await pool.query(`UPDATE lune_orders SET status='reviewed',updated_at=now() WHERE id=$1`,[order.id]);
    if (order.allocated_location_id) {
      await pool.query(`UPDATE lune_partner_locations l SET quality_score=sub.score,updated_at=now() FROM (
        SELECT o.allocated_location_id,round(avg(r.rating)::numeric,2) AS score
        FROM lune_reviews r JOIN lune_orders o ON o.id=r.order_id WHERE o.allocated_location_id=$1 GROUP BY o.allocated_location_id
      ) sub WHERE l.id=sub.allocated_location_id`,[order.allocated_location_id]);
    }
    await allocator.recordEvent(order.id,'reviewed',order.status,'reviewed',{rating},user?'user':'visitor',user?.id || visitor?.id || null);
    res.json({ ok:true });
  }));

  app.post('/api/circle-picks', requireDb, asyncRoute(async (req,res) => {
    const user = await fullUser(req);
    const visitor = await visitorForRequest(req,user);
    if (!user && !visitor) return res.status(400).json({ error:'identity_required' });
    const choices = Array.isArray(req.body?.choices) ? req.body.choices.slice(0,4).map(choice => ({
      id:safe(choice?.id,160), kind:['work','inspo'].includes(choice?.kind) ? choice.kind : 'inspo',
      title:safe(choice?.title,160), imageUrl:safe(choice?.imageUrl,800)
    })).filter(choice => choice.id && choice.title && choice.imageUrl) : [];
    if (choices.length < 2) return res.status(400).json({ error:'choose_two_to_four_sets' });
    const accessToken = token(), pickId = id('pick');
    await pool.query(`INSERT INTO lune_pick_sessions(id,owner_user_id,owner_visitor_id,choices,access_token_hash,expires_at)
      VALUES($1,$2,$3,$4::jsonb,$5,now()+interval '14 days')`,[pickId,user?.id || null,user ? null : visitor.id,json(choices),hash(accessToken)]);
    res.status(201).json({ id:pickId,token:accessToken,url:`${requestBase(req)}/circle-pick.html?pick=${encodeURIComponent(pickId)}&token=${encodeURIComponent(accessToken)}` });
  }));

  app.get('/api/circle-picks/:id', requireDb, asyncRoute(async (req,res) => {
    const accessToken = safe(req.query?.token,200);
    const { rows } = await pool.query(`SELECT p.id,p.choices,p.expires_at,COALESCE(json_object_agg(v.choice_id,v.total) FILTER (WHERE v.choice_id IS NOT NULL),'{}'::json) AS votes
      FROM lune_pick_sessions p LEFT JOIN (SELECT session_id,choice_id,count(*)::int AS total FROM lune_pick_votes GROUP BY session_id,choice_id) v ON v.session_id=p.id
      WHERE p.id=$1 AND p.access_token_hash=$2 AND p.expires_at>now() GROUP BY p.id`,[req.params.id,hash(accessToken)]);
    if (!rows[0]) return res.status(404).json({ error:'pick_not_found' });
    res.json({ pick:{ id:rows[0].id,choices:rows[0].choices,votes:rows[0].votes,expiresAt:rows[0].expires_at } });
  }));

  app.post('/api/circle-picks/:id/vote', requireDb, asyncRoute(async (req,res) => {
    const accessToken = safe(req.body?.token,200), choiceId = safe(req.body?.choiceId,160), voterKey = safe(req.body?.voterKey,200);
    if (!accessToken || !choiceId || !voterKey) return res.status(400).json({ error:'vote_details_required' });
    const { rows } = await pool.query('SELECT choices FROM lune_pick_sessions WHERE id=$1 AND access_token_hash=$2 AND expires_at>now() LIMIT 1',[req.params.id,hash(accessToken)]);
    if (!rows[0] || !Array.isArray(rows[0].choices) || !rows[0].choices.some(choice => choice.id === choiceId)) return res.status(404).json({ error:'pick_not_found' });
    await pool.query(`INSERT INTO lune_pick_votes(id,session_id,voter_key_hash,choice_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(session_id,voter_key_hash) DO UPDATE SET choice_id=EXCLUDED.choice_id,created_at=now()`,[id('vote'),req.params.id,hash(voterKey),choiceId]);
    res.json({ ok:true });
  }));

  app.get('/api/continuity', requireDb, asyncRoute(async (req,res) => {
    const user = await fullUser(req);
    const visitor = await visitorForRequest(req,user);
    if (!visitor && !user) return res.json({ activeOrder:null,lastCompleted:null,offer:null });
    const orderFilter = user ? ['user_id',user.id] : ['visitor_id',visitor.id];
    const active = await pool.query(`SELECT id,item_kind,item_id,item_snapshot,status,scheduled_for,allocated_location_id,created_at FROM lune_orders
      WHERE ${orderFilter[0]}=$1 AND status NOT IN ('completed','reviewed','cancelled','refunded','no_show') ORDER BY created_at DESC LIMIT 1`,[orderFilter[1]]);
    const completed = await pool.query(`SELECT id,item_kind,item_id,item_snapshot,status,scheduled_for,allocated_location_id,completed_at,created_at FROM lune_orders
      WHERE ${orderFilter[0]}=$1 AND status IN ('completed','reviewed') ORDER BY COALESCE(completed_at,created_at) DESC LIMIT 1`,[orderFilter[1]]);
    const saved = await pool.query(`SELECT count(*)::int AS n FROM lune_saved_items WHERE owner_kind=$1 AND owner_id=$2 AND is_saved=true`,[user?'user':'visitor',user?.id || visitor.id]);
    const completedCount = await pool.query(`SELECT count(*)::int AS n FROM lune_orders WHERE ${orderFilter[0]}=$1 AND status IN ('completed','reviewed')`,[orderFilter[1]]);
    const offers = await pool.query(`SELECT * FROM lune_offers WHERE active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) ORDER BY priority DESC,created_at DESC`);
    const state = { saved:Number(saved.rows[0]?.n || 0),completed:Number(completedCount.rows[0]?.n || 0),hasActive:Boolean(active.rows[0]) };
    const matchesRule = rule => {
      if (!rule || typeof rule !== 'object') return true;
      if (rule.saved_min != null && state.saved < Number(rule.saved_min)) return false;
      if (rule.completed_min != null && state.completed < Number(rule.completed_min)) return false;
      if (rule.completed_max != null && state.completed > Number(rule.completed_max)) return false;
      if (rule.no_active_order === true && state.hasActive) return false;
      return true;
    };
    const offer = offers.rows.find(o => matchesRule(o.rule)) || null;
    res.json({
      activeOrder:active.rows[0] || null,
      lastCompleted:completed.rows[0] || null,
      offer:offer ? { id:offer.id,code:offer.code,title:offer.title,copy:offer.copy,reward:offer.reward } : null,
      state
    });
  }));

  app.post('/api/offers/:id/dismiss', requireDb, asyncRoute(async (req,res) => {
    const user = await fullUser(req);
    const visitor = await visitorForRequest(req,user);
    if (!user && !visitor) return res.status(400).json({ error:'identity_required' });
    await pool.query(`INSERT INTO lune_offer_assignments (id,offer_id,user_id,visitor_id,reason,status,dismissed_at)
      VALUES ($1,$2,$3,$4,'context','dismissed',now())`,[id('ofa'),req.params.id,user?.id || null,user ? null : visitor.id]);
    res.json({ ok:true });
  }));

  app.get('/api/partner/me', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requirePartner(req);
    res.json({ user:publicAccessUser(ctx.user),memberships:ctx.memberships });
  }));

  app.get('/api/partner/requests', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requirePartner(req);
    const partnerIds = ctx.memberships.map(m => m.partner_id);
    if (!partnerIds.length) return res.json({ requests:[] });
    const { rows } = await pool.query(`SELECT a.id,a.order_id,a.partner_id,a.location_id,a.score,a.distance_km,a.offered_at,a.expires_at,a.status,
      o.item_kind,o.item_id,o.item_snapshot,o.scheduled_for,o.duration_minutes,o.experience_preference,o.amount_kes,o.requested_area,
      l.name AS location_name,l.area AS location_area
      FROM lune_order_allocations a JOIN lune_orders o ON o.id=a.order_id JOIN lune_partner_locations l ON l.id=a.location_id
      WHERE a.partner_id=ANY($1::text[]) AND a.status='pending' AND a.expires_at>now() ORDER BY a.offered_at ASC`,[partnerIds]);
    res.json({ requests:rows });
  }));

  app.post('/api/partner/requests/:id/accept', requireDb, asyncRoute(async (req,res) => {
    const ar = await pool.query('SELECT partner_id FROM lune_order_allocations WHERE id=$1 LIMIT 1',[req.params.id]);
    const allocation = ar.rows[0];
    if (!allocation) return res.status(404).json({ error:'allocation_not_found' });
    const ctx = await requirePartner(req,allocation.partner_id);
    const order = await allocator.acceptAllocation(req.params.id,{kind:'partner',id:ctx.user.id});
    res.json({ ok:true,orderId:order.id,status:order.status });
  }));

  app.post('/api/partner/requests/:id/decline', requireDb, asyncRoute(async (req,res) => {
    const ar = await pool.query('SELECT partner_id FROM lune_order_allocations WHERE id=$1 LIMIT 1',[req.params.id]);
    const allocation = ar.rows[0];
    if (!allocation) return res.status(404).json({ error:'allocation_not_found' });
    const ctx = await requirePartner(req,allocation.partner_id);
    const result = await allocator.declineAllocation(req.params.id,safe(req.body?.note,500),{kind:'partner',id:ctx.user.id});
    res.json({ ok:true,status:result.status });
  }));

  app.get('/api/partner/orders', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requirePartner(req);
    const partnerIds = ctx.memberships.map(m => m.partner_id);
    if (!partnerIds.length) return res.json({ orders:[] });
    const { rows } = await pool.query(`SELECT o.id,o.item_snapshot,o.status,o.payment_status,o.scheduled_for,o.duration_minutes,o.amount_kes,o.party_size,
      o.customer_name,o.customer_email,o.customer_phone,o.allocated_location_id,o.allocated_technician_id,
      l.name AS location_name,p.id AS partner_id,p.commission_bps,
      COALESCE(pp.net_kes,round(o.amount_kes*(10000-p.commission_bps)/10000.0)::int) AS partner_earning_kes
      FROM lune_orders o JOIN lune_partner_locations l ON l.id=o.allocated_location_id JOIN lune_partners p ON p.id=l.partner_id
      LEFT JOIN lune_partner_payouts pp ON pp.order_id=o.id
      WHERE p.id=ANY($1::text[]) AND o.status NOT IN ('draft','matching','needs_attention')
      ORDER BY o.scheduled_for DESC NULLS LAST LIMIT 200`,[partnerIds]);
    res.json({ orders:rows });
  }));

  app.get('/api/partner/work-submissions', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requirePartner(req);
    const partnerIds = ctx.memberships.map(m => m.partner_id);
    if (!partnerIds.length) return res.json({ submissions:[] });
    const { rows } = await pool.query(`SELECT s.*,o.item_snapshot,o.scheduled_for,o.status AS order_status
      FROM lune_partner_work_submissions s JOIN lune_orders o ON o.id=s.order_id
      WHERE s.partner_id=ANY($1::text[]) ORDER BY s.updated_at DESC LIMIT 300`,[partnerIds]);
    res.json({ submissions:rows });
  }));

  app.post('/api/partner/orders/:id/work', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order?.partner_id) return res.status(404).json({ error:'order_not_found' });
    const ctx = await requirePartner(req,order.partner_id);
    if (!['in_service','completed'].includes(order.status)) return res.status(409).json({ error:'work_upload_not_available' });
    const image = imageDataUrl(req.body?.imageDataUrl);
    const title = safe(req.body?.title || order.item_snapshot?.title || order.item_snapshot?.style,160);
    if (!image || !title) return res.status(400).json({ error:'finished_work_image_and_title_required' });
    const existing = await pool.query('SELECT id,status FROM lune_partner_work_submissions WHERE order_id=$1 LIMIT 1',[order.id]);
    if (existing.rows[0]?.status === 'approved') return res.status(409).json({ error:'approved_work_locked' });
    const category = safe(req.body?.category,120) || safe(order.item_snapshot?.category,120) || null;
    const style = safe(req.body?.style,180) || safe(order.item_snapshot?.style,180) || null;
    const description = safe(req.body?.description,1000) || null;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map(tag => safe(tag,60)).filter(Boolean).slice(0,12) : [];
    let submissionId = existing.rows[0]?.id;
    if (submissionId) {
      await pool.query(`UPDATE lune_partner_work_submissions SET title=$2,category=$3,style=$4,description=$5,tags=$6,image_data_url=$7,status='pending',admin_note=NULL,reviewed_by_user_id=NULL,reviewed_at=NULL,updated_at=now() WHERE id=$1`,[submissionId,title,category,style,description,tags,image]);
    } else {
      submissionId = id('wsub');
      await pool.query(`INSERT INTO lune_partner_work_submissions(id,order_id,partner_id,submitted_by_user_id,title,category,style,description,tags,image_data_url,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,[submissionId,order.id,order.partner_id,ctx.user.id,title,category,style,description,tags,image]);
    }
    await allocator.recordEvent(order.id,'partner_work_submitted',null,null,{submissionId},'partner',ctx.user.id);
    res.status(201).json({ id:submissionId,status:'pending' });
  }));

  app.get('/api/partner/availability', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requirePartner(req);
    const partnerIds = ctx.memberships.map(m => m.partner_id);
    const { rows } = await pool.query(`SELECT a.*,l.name AS location_name,t.name AS technician_name FROM lune_availability a
      JOIN lune_partner_locations l ON l.id=a.location_id LEFT JOIN lune_technicians t ON t.id=a.technician_id
      WHERE l.partner_id=ANY($1::text[]) AND a.ends_at>now()-interval '1 day' ORDER BY a.starts_at ASC LIMIT 300`,[partnerIds]);
    res.json({ availability:rows });
  }));

  app.post('/api/partner/availability', requireDb, asyncRoute(async (req,res) => {
    const locationId = safe(req.body?.locationId,180);
    const lr = await pool.query('SELECT partner_id FROM lune_partner_locations WHERE id=$1 AND active=true LIMIT 1',[locationId]);
    if (!lr.rows[0]) return res.status(404).json({ error:'location_not_found' });
    await requirePartner(req,lr.rows[0].partner_id);
    const start = new Date(req.body?.startsAt), end = new Date(req.body?.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ error:'valid_availability_required' });
    const availabilityId = id('avl');
    await pool.query(`INSERT INTO lune_availability (id,technician_id,location_id,starts_at,ends_at,status)
      VALUES ($1,$2,$3,$4,$5,'available')`,[availabilityId,safe(req.body?.technicianId,180) || null,locationId,start.toISOString(),end.toISOString()]);
    res.status(201).json({ id:availabilityId });
  }));

  app.delete('/api/partner/availability/:id', requireDb, asyncRoute(async (req,res) => {
    const ar = await pool.query(`SELECT l.partner_id FROM lune_availability a JOIN lune_partner_locations l ON l.id=a.location_id WHERE a.id=$1 LIMIT 1`,[req.params.id]);
    if (!ar.rows[0]) return res.status(404).json({ error:'availability_not_found' });
    await requirePartner(req,ar.rows[0].partner_id);
    await pool.query('DELETE FROM lune_availability WHERE id=$1',[req.params.id]);
    res.json({ ok:true });
  }));

  app.post('/api/partner/orders/:id/status', requireDb, asyncRoute(async (req,res) => {
    const order = await orderRow(req.params.id);
    if (!order?.partner_id) return res.status(404).json({ error:'order_not_found' });
    const ctx = await requirePartner(req,order.partner_id);
    const next = safe(req.body?.status,40);
    const allowed = {
      confirmed:['upcoming','checked_in','cancelled','no_show'],
      upcoming:['checked_in','cancelled','no_show'],
      checked_in:['in_service','no_show'],
      in_service:['completed']
    };
    if (!(allowed[order.status] || []).includes(next)) return res.status(409).json({ error:'invalid_status_transition' });
    if (next === 'completed') {
      const proof = await pool.query(`SELECT id FROM lune_partner_work_submissions WHERE order_id=$1 AND status IN ('pending','approved') LIMIT 1`,[order.id]);
      if (!proof.rows[0]) return res.status(409).json({ error:'finished_work_required' });
    }
    const reviewToken = next === 'completed' ? token() : null;
    await pool.query(`UPDATE lune_orders SET status=$2,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,cancelled_at=CASE WHEN $2='cancelled' THEN now() ELSE cancelled_at END,access_token_hash=COALESCE($3,access_token_hash),updated_at=now() WHERE id=$1`,[order.id,next,reviewToken ? hash(reviewToken) : null]);
    if (next === 'completed') await pool.query(`UPDATE lune_partner_payouts SET status='payable',payable_at=now(),updated_at=now() WHERE order_id=$1 AND status='held'`,[order.id]);
    if (next === 'completed' && validEmail(order.customer_email)) {
      const reviewLink = `${requestBase(req)}/order.html?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(reviewToken)}`;
      notifier.customer({ to:order.customer_email, subject:'How did your set turn out?', html:`<p>Hi ${emailEscape(order.customer_name || 'there')}, your Lune set is finished.</p><p>We would genuinely love to see how it turned out — a photo, a few words, or simply how it made you feel.</p><p><a href="${emailEscape(reviewLink)}">Show Lune your set →</a></p>` }).catch(() => {});
    }
    await allocator.recordEvent(order.id,'partner_status',order.status,next,{},'partner',ctx.user.id);
    res.json({ ok:true,status:next });
  }));

  app.get('/api/admin/overview', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const [orders,partners,payments,payouts,requests] = await Promise.all([
      pool.query(`SELECT status,count(*)::int AS count FROM lune_orders GROUP BY status`),
      pool.query(`SELECT status,count(*)::int AS count FROM lune_partners GROUP BY status`),
      pool.query(`SELECT payment_status,count(*)::int AS count,COALESCE(sum(amount_kes),0)::int AS value_kes FROM lune_orders GROUP BY payment_status`),
      pool.query(`SELECT status,count(*)::int AS count,COALESCE(sum(net_kes),0)::int AS value_kes FROM lune_partner_payouts GROUP BY status`),
      pool.query(`SELECT count(*)::int AS count FROM lune_order_allocations WHERE status='pending' AND expires_at>now()`)
    ]);
    res.json({ orders:orders.rows,partners:partners.rows,payments:payments.rows,payouts:payouts.rows,pendingRequests:requests.rows[0]?.count || 0 });
  }));

  app.get('/api/admin/partners', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const { rows } = await pool.query(`SELECT p.*,
      (SELECT count(*)::int FROM lune_partner_locations l WHERE l.partner_id=p.id AND l.active=true) AS locations,
      (SELECT count(*)::int FROM lune_partner_members m WHERE m.partner_id=p.id AND m.status='active') AS members
      FROM lune_partners p ORDER BY p.created_at DESC`);
    res.json({ partners:rows });
  }));

  app.get('/api/admin/partner-applications', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const { rows } = await pool.query('SELECT * FROM lune_partner_applications ORDER BY created_at DESC LIMIT 200');
    res.json({ applications:rows });
  }));

  app.patch('/api/admin/partner-applications/:id', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const status = ['received','reviewing','accepted','not_now'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error:'application_status_required' });
    const { rows } = await pool.query(`UPDATE lune_partner_applications SET status=$2,review_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,[req.params.id,status,safe(req.body?.reviewNotes,1000)||null,ctx.user.id]);
    if (!rows[0]) return res.status(404).json({ error:'application_not_found' });
    await logAdmin(ctx.user.id,'partner.application.review','partner_application',rows[0].id,{status});
    res.json({ application:rows[0] });
  }));

  app.post('/api/admin/catalog/:kind', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const kind = req.params.kind === 'work' ? 'work' : req.params.kind === 'inspo' ? 'inspo' : null;
    if (!kind) return res.status(400).json({ error:'catalog_kind_required' });
    if (kind === 'work') return res.status(409).json({ error:'finished_work_requires_partner_approval' });
    const title = safe(req.body?.title,160), imageUrl = imageDataUrl(req.body?.imageDataUrl) || safe(req.body?.imageUrl,1200);
    if (!title || !imageUrl) return res.status(400).json({ error:'title_and_image_required' });
    const slug = safe(req.body?.slug,180) || `${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}-${Date.now().toString(36)}`;
    const itemId = id(kind === 'work' ? 'set' : 'inspo'), category = safe(req.body?.category,120), tags = Array.isArray(req.body?.tags) ? req.body.tags.map(tag => safe(tag,60)).filter(Boolean).slice(0,12) : [];
    await pool.query(`INSERT INTO lune_inspo_items(id,slug,title,category,image_url,shape,length,finish,palette,structure,tags,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,[itemId,slug,title,category,imageUrl,safe(req.body?.shape,80)||null,safe(req.body?.length,80)||null,safe(req.body?.finish,120)||null,safe(req.body?.palette,120)||null,safe(req.body?.structure,120)||null,tags]);
    await logAdmin(ctx.user.id,'catalog.create',kind,itemId,{title});
    res.status(201).json({ id:itemId,slug });
  }));

  app.get('/api/admin/work-submissions', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const status = ['pending','approved','rejected'].includes(req.query?.status) ? req.query.status : 'pending';
    const { rows } = await pool.query(`SELECT s.*,p.name AS partner_name,o.item_snapshot,o.service_code,o.scheduled_for,o.status AS order_status,
      l.name AS location_name,u.email AS submitted_by_email,w.id AS published_work_id
      FROM lune_partner_work_submissions s
      JOIN lune_orders o ON o.id=s.order_id
      JOIN lune_partners p ON p.id=s.partner_id
      LEFT JOIN lune_partner_locations l ON l.id=o.allocated_location_id
      LEFT JOIN lune_users u ON u.id=s.submitted_by_user_id
      LEFT JOIN lune_work_items w ON w.partner_submission_id=s.id
      WHERE s.status=$1 ORDER BY s.created_at ASC LIMIT 300`,[status]);
    res.json({ submissions:rows });
  }));

  app.post('/api/admin/work-submissions/:id/approve', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT s.*,o.service_code,o.amount_kes,svc.base_price_kes
        FROM lune_partner_work_submissions s JOIN lune_orders o ON o.id=s.order_id
        LEFT JOIN lune_services svc ON svc.code=o.service_code WHERE s.id=$1 FOR UPDATE`,[req.params.id]);
      const submission = rows[0];
      if (!submission) throw Object.assign(new Error('work_submission_not_found'),{status:404});
      if (submission.status === 'approved' && submission.published_work_id) { result={ id:submission.published_work_id,alreadyApproved:true }; }
      else {
        if (submission.status !== 'pending') throw Object.assign(new Error('work_submission_not_pending'),{status:409});
        const workId = id('set');
        const slug = `${slugify(submission.title)}-${Date.now().toString(36)}`;
        const price = Math.max(0,Number(submission.base_price_kes ?? submission.amount_kes ?? 0));
        await client.query(`INSERT INTO lune_work_items(id,slug,title,category,style,description,image_url,price_kes,tags,active,service_code,source_order_id,partner_submission_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,$12)`,[workId,slug,submission.title,submission.category,submission.style,submission.description,submission.image_data_url,price,submission.tags || [],submission.service_code || null,submission.order_id,submission.id]);
        await client.query(`UPDATE lune_partner_work_submissions SET status='approved',published_work_id=$2,admin_note=NULL,reviewed_by_user_id=$3,reviewed_at=now(),updated_at=now() WHERE id=$1`,[submission.id,workId,ctx.user.id]);
        result={ id:workId,alreadyApproved:false };
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    await logAdmin(ctx.user.id,'partner_work.approve','partner_work_submission',req.params.id,{workId:result.id});
    res.json({ ok:true,workId:result.id,alreadyApproved:result.alreadyApproved });
  }));

  app.post('/api/admin/work-submissions/:id/reject', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const note = safe(req.body?.note,600);
    if (!note) return res.status(400).json({ error:'review_note_required' });
    const { rows } = await pool.query(`UPDATE lune_partner_work_submissions SET status='rejected',admin_note=$2,reviewed_by_user_id=$3,reviewed_at=now(),updated_at=now() WHERE id=$1 AND status='pending' RETURNING id`,[req.params.id,note,ctx.user.id]);
    if (!rows[0]) return res.status(409).json({ error:'work_submission_not_pending' });
    await logAdmin(ctx.user.id,'partner_work.reject','partner_work_submission',req.params.id,{note});
    res.json({ ok:true });
  }));

  app.patch('/api/admin/catalog/:kind/:id', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req), kind = req.params.kind === 'work' ? 'work' : req.params.kind === 'inspo' ? 'inspo' : null;
    if (!kind) return res.status(400).json({ error:'catalog_kind_required' });
    const table = kind === 'work' ? 'lune_work_items' : 'lune_inspo_items';
    await pool.query(`UPDATE ${table} SET active=$2,updated_at=now() WHERE id=$1`,[req.params.id,Boolean(req.body?.active)]);
    await logAdmin(ctx.user.id,'catalog.visibility',kind,req.params.id,{active:Boolean(req.body?.active)});
    res.json({ ok:true });
  }));

  app.post('/api/admin/partners', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const partnerId = id('par');
    const name = safe(req.body?.name,160);
    if (!name) return res.status(400).json({ error:'partner_name_required' });
    const commission = Math.max(0,Math.min(10000,Number(req.body?.commissionBps || 0)));
    await pool.query(`INSERT INTO lune_partners (id,name,legal_name,email,phone,status,commission_bps)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,[partnerId,name,safe(req.body?.legalName,200)||null,safe(req.body?.email,200)||null,safe(req.body?.phone,50)||null,req.body?.status==='active'?'active':'pending',commission]);
    await logAdmin(ctx.user.id,'partner.create','partner',partnerId,{name});
    res.status(201).json({ id:partnerId });
  }));

  app.post('/api/admin/partners/:id/locations', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const locationId = id('loc');
    const name = safe(req.body?.name,160), address = safe(req.body?.address,300);
    if (!name || !address) return res.status(400).json({ error:'location_name_and_address_required' });
    const tags = Array.isArray(req.body?.experienceTags) ? req.body.experienceTags.map(x => safe(x,40)).filter(Boolean).slice(0,20) : [];
    await pool.query(`INSERT INTO lune_partner_locations
      (id,partner_id,name,address,area,latitude,longitude,experience_tier,experience_tags,email,phone,google_maps_url,acceptance_mode,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)`,
      [locationId,req.params.id,name,address,safe(req.body?.area,120)||null,req.body?.latitude==null?null:Number(req.body.latitude),req.body?.longitude==null?null:Number(req.body.longitude),
       safe(req.body?.experienceTier,40)||'standard',tags,safe(req.body?.email,200)||null,safe(req.body?.phone,50)||null,safe(req.body?.googleMapsUrl,600)||null,
       req.body?.acceptanceMode==='auto'?'auto':'manual']);
    await logAdmin(ctx.user.id,'location.create','location',locationId,{partnerId:req.params.id,name});
    res.status(201).json({ id:locationId });
  }));

  app.post('/api/admin/partners/:id/technicians', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const techId = id('tech');
    const name = safe(req.body?.name,160), locationId = safe(req.body?.locationId,180);
    if (!name || !locationId) return res.status(400).json({ error:'technician_name_and_location_required' });
    const check = await pool.query('SELECT id FROM lune_partner_locations WHERE id=$1 AND partner_id=$2 LIMIT 1',[locationId,req.params.id]);
    if (!check.rows[0]) return res.status(400).json({ error:'location_not_in_partner' });
    await pool.query(`INSERT INTO lune_technicians (id,partner_id,location_id,name,status,quality_score) VALUES ($1,$2,$3,$4,'active',$5)`,[techId,req.params.id,locationId,name,req.body?.qualityScore==null?null:Number(req.body.qualityScore)]);
    const caps = Array.isArray(req.body?.capabilities) ? req.body.capabilities.slice(0,30) : [];
    for (const cap of caps) {
      const capability = safe(typeof cap==='string'?cap:cap.capability,80);
      const level = Math.max(1,Math.min(5,Number(typeof cap==='string'?3:cap.level || 3)));
      if (capability) await pool.query(`INSERT INTO lune_technician_capabilities (technician_id,capability,level,certified_at) VALUES ($1,$2,$3,now()) ON CONFLICT (technician_id,capability) DO UPDATE SET level=EXCLUDED.level,certified_at=now()`,[techId,capability,level]);
    }
    await logAdmin(ctx.user.id,'technician.create','technician',techId,{partnerId:req.params.id,name});
    res.status(201).json({ id:techId });
  }));

  app.post('/api/admin/partners/:id/members', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const email = safe(req.body?.email,200).toLowerCase();
    const ur = await pool.query('SELECT id FROM lune_users WHERE email=$1 LIMIT 1',[email]);
    if (!ur.rows[0]) return res.status(409).json({ error:'partner_member_account_required' });
    const memberId = id('mem');
    await pool.query(`INSERT INTO lune_partner_members (id,user_id,partner_id,location_id,role,status)
      VALUES ($1,$2,$3,$4,$5,'active') ON CONFLICT (user_id,partner_id) DO UPDATE SET location_id=EXCLUDED.location_id,role=EXCLUDED.role,status='active'`,
      [memberId,ur.rows[0].id,req.params.id,safe(req.body?.locationId,180)||null,safe(req.body?.role,40)||'manager']);
    await logAdmin(ctx.user.id,'partner.member.add','partner',req.params.id,{email});
    res.status(201).json({ ok:true });
  }));

  app.get('/api/admin/orders', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const { rows } = await pool.query(`SELECT o.id,o.item_snapshot,o.status,o.payment_status,o.scheduled_for,o.amount_kes,o.customer_name,o.customer_email,o.customer_phone,
      o.created_at,l.name AS location_name,p.name AS partner_name
      FROM lune_orders o LEFT JOIN lune_partner_locations l ON l.id=o.allocated_location_id LEFT JOIN lune_partners p ON p.id=l.partner_id
      ORDER BY o.created_at DESC LIMIT 300`);
    res.json({ orders:rows });
  }));

  app.post('/api/admin/orders/:id/reallocate', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    await pool.query(`UPDATE lune_order_allocations SET status='superseded',responded_at=now() WHERE order_id=$1 AND status='pending'`,[order.id]);
    await pool.query(`UPDATE lune_orders SET status='matching',allocated_location_id=NULL,allocated_technician_id=NULL,updated_at=now() WHERE id=$1`,[order.id]);
    const result = await allocator.allocateOrder(order.id);
    await logAdmin(ctx.user.id,'order.reallocate','order',order.id,{status:result.status});
    res.json({ ok:true,status:result.status });
  }));

  app.post('/api/admin/orders/:id/refund', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const order = await orderRow(req.params.id);
    if (!order) return res.status(404).json({ error:'order_not_found' });
    const pr = await pool.query(`SELECT * FROM lune_payments WHERE order_id=$1 AND status='paid' ORDER BY paid_at DESC LIMIT 1`,[order.id]);
    const payment = pr.rows[0];
    if (!payment) return res.status(409).json({ error:'paid_payment_not_found' });
    const requested = req.body?.amountKes == null ? Number(payment.amount_kes) : Math.max(0,Math.min(Number(payment.amount_kes),Number(req.body.amountKes)));
    const result = await paystack.refund({ reference:payment.reference,amountKes:requested,customerNote:safe(req.body?.reason,500),merchantNote:`Lune refund for ${order.id}` });
    const refundId = id('rfd');
    await pool.query(`INSERT INTO lune_refunds (id,order_id,payment_id,provider_refund_id,amount_kes,status,reason,provider_payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[refundId,order.id,payment.id,result.data?.id==null?null:String(result.data.id),requested,String(result.data?.status || 'pending'),safe(req.body?.reason,500)||null,json(result.data || {})]);
    await pool.query(`UPDATE lune_orders SET status='refund_pending',payment_status='refund_pending',updated_at=now() WHERE id=$1`,[order.id]);
    await logAdmin(ctx.user.id,'order.refund','order',order.id,{amountKes:requested});
    res.json({ ok:true,refundId,status:result.data?.status || 'pending' });
  }));

  app.get('/api/admin/payouts', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const { rows } = await pool.query(`SELECT pp.*,p.name AS partner_name,p.paystack_recipient_code FROM lune_partner_payouts pp JOIN lune_partners p ON p.id=pp.partner_id ORDER BY pp.created_at DESC LIMIT 300`);
    res.json({ payouts:rows });
  }));

  app.post('/api/admin/payouts/:id/send', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const pr = await pool.query(`SELECT pp.*,p.paystack_recipient_code,p.name AS partner_name FROM lune_partner_payouts pp JOIN lune_partners p ON p.id=pp.partner_id WHERE pp.id=$1 LIMIT 1`,[req.params.id]);
    const payout = pr.rows[0];
    if (!payout) return res.status(404).json({ error:'payout_not_found' });
    if (payout.status !== 'payable') return res.status(409).json({ error:'payout_not_payable' });
    if (!payout.paystack_recipient_code) return res.status(409).json({ error:'partner_recipient_not_configured' });
    const reference = `LUNE-PAYOUT-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const result = await paystack.transfer({ recipient:payout.paystack_recipient_code,amountKes:Number(payout.net_kes),reference,reason:`Lune settlement ${payout.order_id}` });
    await pool.query(`UPDATE lune_partner_payouts SET status='processing',provider_reference=$2,provider_payload=$3::jsonb,updated_at=now() WHERE id=$1`,[payout.id,reference,json(result.data || {})]);
    await logAdmin(ctx.user.id,'payout.send','payout',payout.id,{reference,amountKes:Number(payout.net_kes)});
    res.json({ ok:true,reference });
  }));

  app.get('/api/admin/offers', requireDb, asyncRoute(async (req,res) => {
    await requireAdmin(req);
    const { rows } = await pool.query('SELECT * FROM lune_offers ORDER BY priority DESC,created_at DESC');
    res.json({ offers:rows });
  }));

  app.post('/api/admin/offers', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const offerId = id('off');
    const code = safe(req.body?.code,80).toUpperCase();
    const title = safe(req.body?.title,180);
    if (!code || !title) return res.status(400).json({ error:'offer_code_and_title_required' });
    await pool.query(`INSERT INTO lune_offers (id,code,title,copy,rule,reward,active,priority,starts_at,ends_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[offerId,code,title,safe(req.body?.copy,600)||null,json(req.body?.rule || {}),json(req.body?.reward || {}),Boolean(req.body?.active),Number(req.body?.priority || 0),req.body?.startsAt || null,req.body?.endsAt || null]);
    await logAdmin(ctx.user.id,'offer.create','offer',offerId,{code});
    res.status(201).json({ id:offerId });
  }));

  app.patch('/api/admin/offers/:id', requireDb, asyncRoute(async (req,res) => {
    const ctx = await requireAdmin(req);
    const fields = [];
    const values = [];
    const add = (column,value) => { values.push(value); fields.push(`${column}=$${values.length}`); };
    if (req.body?.title != null) add('title',safe(req.body.title,180));
    if (req.body?.copy != null) add('copy',safe(req.body.copy,600));
    if (req.body?.active != null) add('active',Boolean(req.body.active));
    if (req.body?.priority != null) add('priority',Number(req.body.priority));
    if (req.body?.rule != null) { values.push(json(req.body.rule)); fields.push(`rule=$${values.length}::jsonb`); }
    if (req.body?.reward != null) { values.push(json(req.body.reward)); fields.push(`reward=$${values.length}::jsonb`); }
    if (!fields.length) return res.json({ ok:true });
    values.push(req.params.id);
    await pool.query(`UPDATE lune_offers SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length}`,values);
    await logAdmin(ctx.user.id,'offer.update','offer',req.params.id,{});
    res.json({ ok:true });
  }));

  app.get('/api/ops/health', requireDb, asyncRoute(async (_req,res) => {
    const [db,partners,services] = await Promise.all([
      pool.query('SELECT now() AS now'),
      pool.query(`SELECT count(*)::int AS n FROM lune_partners WHERE status='active'`),
      pool.query(`SELECT count(*)::int AS n FROM lune_services WHERE active=true`)
    ]);
    res.json({ ok:true,database:true,paystack:paystack.configured,email:notifier.configured,activePartners:partners.rows[0].n,activeServices:services.rows[0].n,now:db.rows[0].now });
  }));

  const timer = setInterval(() => allocator.expirePending().catch(err => console.error('[lune-allocation-timer]',err.message)), 60000);
  timer.unref?.();

  return { paystack, notifier, allocator, finalizeSuccessfulPayment };
};
