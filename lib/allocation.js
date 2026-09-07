'use strict';

const RESPONSE_MINUTES = Math.max(5, Math.min(60, Number(process.env.LUNE_PARTNER_RESPONSE_MINUTES || 15)));

function createAllocator({ pool, id, notifier }) {
  const radians = deg => Number(deg) * Math.PI / 180;
  function distanceKm(aLat, aLng, bLat, bLng) {
    if ([aLat,aLng,bLat,bLng].some(v => v == null || v === '' || !Number.isFinite(Number(v)))) return null;
    const R = 6371;
    const dLat = radians(Number(bLat) - Number(aLat));
    const dLon = radians(Number(bLng) - Number(aLng));
    const q = Math.sin(dLat/2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(q));
  }

  function normalizeQuality(...values) {
    const valid = values.map(Number).filter(Number.isFinite);
    if (!valid.length) return .55;
    const avg = valid.reduce((a,b) => a+b, 0) / valid.length;
    return Math.max(0, Math.min(1, avg / 5));
  }

  async function serviceForOrder(order) {
    let serviceCode = order.service_code || null;
    let item = null;
    if (order.item_kind === 'work' && order.item_id) {
      const { rows } = await pool.query('SELECT * FROM lune_work_items WHERE id=$1 AND active=true LIMIT 1', [order.item_id]);
      item = rows[0] || null;
      serviceCode ||= item?.service_code || null;
    } else if (order.item_kind === 'inspo' && order.item_id) {
      const { rows } = await pool.query('SELECT * FROM lune_inspo_items WHERE id=$1 AND active=true LIMIT 1', [order.item_id]);
      item = rows[0] || null;
      serviceCode ||= item?.service_code || null;
    }
    if (!serviceCode) serviceCode = 'natural_gel';
    const { rows } = await pool.query('SELECT * FROM lune_services WHERE code=$1 AND active=true LIMIT 1', [serviceCode]);
    const service = rows[0] || { code: serviceCode, title: serviceCode, base_price_kes: Number(order.amount_kes || 0), duration_minutes: Number(order.duration_minutes || 90), capabilities: [] };
    return { service, item };
  }

  async function rawCandidates(order, service) {
    const scheduled = new Date(order.scheduled_for);
    const end = new Date(scheduled.getTime() + Number(order.duration_minutes || service.duration_minutes || 90) * 60000);
    const { rows } = await pool.query(`
      SELECT
        l.id AS location_id,l.partner_id,l.name AS location_name,l.address,l.area,l.latitude,l.longitude,
        l.experience_tier,l.experience_tags,l.google_maps_url,l.email AS location_email,l.phone AS location_phone,
        l.quality_score AS location_quality,l.acceptance_mode,
        p.name AS partner_name,p.email AS partner_email,p.quality_score AS partner_quality,p.commission_bps,
        t.id AS technician_id,t.name AS technician_name,t.quality_score AS technician_quality,
        COALESCE(array_agg(c.capability) FILTER (WHERE c.capability IS NOT NULL),ARRAY[]::text[]) AS capabilities,
        COALESCE(jsonb_object_agg(c.capability,c.level) FILTER (WHERE c.capability IS NOT NULL),'{}'::jsonb) AS capability_levels,
        EXISTS(
          SELECT 1 FROM lune_availability a
          WHERE a.location_id=l.id AND (a.technician_id IS NULL OR a.technician_id=t.id)
            AND a.status='available' AND a.starts_at <= $1 AND a.ends_at >= $2
        ) AS has_covering_availability,
        EXISTS(
          SELECT 1 FROM lune_availability ax
          WHERE ax.location_id=l.id AND ax.status='available' AND ax.ends_at > now()
        ) AS has_any_availability,
        (SELECT count(*)::int FROM lune_orders o2
          WHERE o2.allocated_location_id=l.id
            AND o2.status IN ('partner_accepted','payment_pending','confirmed','upcoming','checked_in','in_service')
            AND o2.scheduled_for < $2
            AND (o2.scheduled_for + (o2.duration_minutes || ' minutes')::interval) > $1
        ) AS conflict_count,
        (SELECT count(*)::int FROM lune_orders od
          WHERE od.allocated_location_id=l.id
            AND od.status IN ('partner_accepted','payment_pending','confirmed','upcoming')
            AND od.scheduled_for::date=$1::date
        ) AS day_load
      FROM lune_partner_locations l
      JOIN lune_partners p ON p.id=l.partner_id AND p.status='active'
      JOIN lune_technicians t ON t.location_id=l.id AND t.status='active'
      LEFT JOIN lune_technician_capabilities c ON c.technician_id=t.id
      WHERE l.active=true
      GROUP BY l.id,p.id,t.id`, [scheduled, end]);
    return rows;
  }

  function scoreCandidate(row, order, requiredCapabilities) {
    const caps = new Set(row.capabilities || []);
    const missing = requiredCapabilities.filter(c => !caps.has(c));
    if (missing.length) return null;
    if (Number(row.conflict_count || 0) > 0) return null;

    const distance = distanceKm(order.requested_latitude, order.requested_longitude, row.latitude, row.longitude);
    const distanceScore = distance == null ? .48 : Math.max(0, 1 - distance / 25);
    const quality = normalizeQuality(row.partner_quality,row.location_quality,row.technician_quality);
    const levels = row.capability_levels || {};
    const capability = requiredCapabilities.length
      ? requiredCapabilities.reduce((sum,c) => sum + Math.max(1, Number(levels[c] || 1)) / 5, 0) / requiredCapabilities.length
      : .7;
    const tags = new Set((row.experience_tags || []).map(x => String(x).toLowerCase()));
    const tier = String(row.experience_tier || '').toLowerCase();
    const preference = String(order.experience_preference || 'closest').toLowerCase();
    let experience = .55;
    if (preference === 'calm') experience = tags.has('calm') || tags.has('quiet') ? 1 : .2;
    if (preference === 'select') experience = ['select','premium','elevated'].includes(tier) || tags.has('select') ? 1 : quality * .55;
    if (preference === 'same') experience = row.location_id === order.preferred_location_id ? 1 : .12;
    if (preference === 'closest') experience = .65;

    let availability = row.has_covering_availability ? 1 : (row.has_any_availability ? 0 : .5);
    if (!row.has_covering_availability && row.has_any_availability && !(order.force_preferred_location && row.location_id === order.preferred_location_id)) return null;
    if (order.force_preferred_location && row.location_id !== order.preferred_location_id) return null;

    const loadPenalty = Math.min(.18, Number(row.day_load || 0) * .025);
    const preferredBoost = row.location_id === order.preferred_location_id ? .12 : 0;
    const weights = preference === 'select'
      ? { d:.10,q:.38,c:.27,e:.15,a:.10 }
      : preference === 'calm'
        ? { d:.18,q:.25,c:.20,e:.27,a:.10 }
        : preference === 'same'
          ? { d:.08,q:.20,c:.22,e:.40,a:.10 }
          : { d:.36,q:.22,c:.20,e:.10,a:.12 };
    const score = distanceScore*weights.d + quality*weights.q + capability*weights.c + experience*weights.e + availability*weights.a + preferredBoost - loadPenalty;
    return {
      ...row,
      distance_km: distance == null ? null : Math.round(distance * 10) / 10,
      score: Math.max(0, score),
      availability_state: row.has_covering_availability ? 'available' : (row.has_any_availability ? 'unavailable' : 'confirming'),
      reason: { distance: distanceScore, quality, capability, experience, availability, loadPenalty, preference }
    };
  }

  async function matchesForOrder(order, limit = 8) {
    const { service } = await serviceForOrder(order);
    const required = Array.isArray(service.capabilities) ? service.capabilities : [];
    const raw = await rawCandidates(order, service);
    return raw.map(row => scoreCandidate(row, order, required)).filter(Boolean).sort((a,b) => b.score - a.score).slice(0, limit);
  }

  async function publicMatches({ itemKind, itemId, scheduledFor, durationMinutes, experiencePreference, preferredLocationId, forcePreferredLocation, latitude, longitude, area }) {
    const synthetic = {
      item_kind:itemKind,
      item_id:itemId,
      scheduled_for:scheduledFor,
      duration_minutes:Number(durationMinutes || 90),
      experience_preference:experiencePreference || 'closest',
      preferred_location_id:preferredLocationId || null,
      force_preferred_location:Boolean(forcePreferredLocation),
      requested_latitude:latitude,
      requested_longitude:longitude,
      requested_area:area || null
    };
    const { service, item } = await serviceForOrder(synthetic);
    synthetic.service_code = service.code;
    synthetic.duration_minutes = Number(durationMinutes || service.duration_minutes || 90);
    const matches = await matchesForOrder(synthetic, 8);
    return {
      service: { code:service.code,title:service.title,basePriceKes:Number(service.base_price_kes),durationMinutes:Number(service.duration_minutes) },
      item,
      matches: matches.map(m => ({
        locationId:m.location_id,
        name:m.location_name,
        area:m.area,
        address:m.address,
        distanceKm:m.distance_km,
        experienceTier:m.experience_tier,
        experienceTags:m.experience_tags || [],
        qualityScore:Number(m.location_quality || m.partner_quality || 0) || null,
        availability:m.availability_state,
        mapUrl:m.google_maps_url || null,
        score:Math.round(m.score*1000)/1000
      }))
    };
  }

  async function recordEvent(orderId, eventType, fromStatus, toStatus, metadata = {}, actorKind = 'system', actorId = null) {
    await pool.query(`INSERT INTO lune_order_events (id,order_id,actor_kind,actor_id,event_type,from_status,to_status,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [id('evt'),orderId,actorKind,actorId,eventType,fromStatus || null,toStatus || null,JSON.stringify(metadata || {})]);
  }

  async function offer(orderId, candidate) {
    const allocationId = id('alc');
    const expires = new Date(Date.now() + RESPONSE_MINUTES * 60000);
    await pool.query(`INSERT INTO lune_order_allocations
      (id,order_id,partner_id,location_id,technician_id,score,distance_km,status,reason,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb,$9)`,
      [allocationId,orderId,candidate.partner_id,candidate.location_id,candidate.technician_id,candidate.score,candidate.distance_km,JSON.stringify(candidate.reason),expires]);
    await pool.query(`UPDATE lune_orders SET status='matching',allocation_deadline=$2,updated_at=now() WHERE id=$1`, [orderId,expires]);
    const to = candidate.location_email || candidate.partner_email;
    const base = process.env.PUBLIC_BASE_URL || '';
    const link = `${base}/partner.html?request=${encodeURIComponent(allocationId)}`;
    notifier.partner({
      partnerId:candidate.partner_id,locationId:candidate.location_id,orderId,allocationId,to,type:'allocation_request',
      subject:'New Lune appointment request',
      html:`<p>A Lune appointment is waiting for ${candidate.location_name}.</p><p><strong>Respond within ${RESPONSE_MINUTES} minutes.</strong></p><p><a href="${link}">Open the request</a></p>`
    }).catch(() => {});
    return { allocationId, expiresAt: expires };
  }

  async function allocateOrder(orderId) {
    const { rows } = await pool.query('SELECT * FROM lune_orders WHERE id=$1 LIMIT 1', [orderId]);
    const order = rows[0];
    if (!order) throw Object.assign(new Error('order_not_found'), { status:404 });
    if (!order.scheduled_for) throw Object.assign(new Error('schedule_required'), { status:400 });
    const attempted = new Set((await pool.query('SELECT location_id FROM lune_order_allocations WHERE order_id=$1', [orderId])).rows.map(r => r.location_id));
    const matches = await matchesForOrder(order, 20);
    const candidate = matches.find(m => !attempted.has(m.location_id));
    if (!candidate) {
      const from = order.status;
      await pool.query(`UPDATE lune_orders SET status='needs_attention',allocation_deadline=NULL,updated_at=now() WHERE id=$1`, [orderId]);
      await recordEvent(orderId,'allocation_exhausted',from,'needs_attention',{attempted:[...attempted]});
      return { status:'needs_attention', allocation:null };
    }
    const offered = await offer(orderId,candidate);
    await recordEvent(orderId,'allocation_offered',order.status,'matching',{locationId:candidate.location_id,score:candidate.score,availability:candidate.availability_state});
    if (String(candidate.acceptance_mode).toLowerCase() === 'auto' && candidate.availability_state === 'available') {
      await acceptAllocation(offered.allocationId,{kind:'system',id:'auto'});
      return { status:'partner_accepted', allocation:offered, auto:true };
    }
    return { status:'matching', allocation:offered, candidate };
  }

  async function acceptAllocation(allocationId, actor = {kind:'partner',id:null}) {
    const client = await pool.connect();
    let allocation, order;
    try {
      await client.query('BEGIN');
      const ar = await client.query(`SELECT a.*,o.status AS order_status,o.customer_email,o.customer_name,l.name AS location_name,l.address,l.google_maps_url
        FROM lune_order_allocations a JOIN lune_orders o ON o.id=a.order_id JOIN lune_partner_locations l ON l.id=a.location_id
        WHERE a.id=$1 FOR UPDATE`, [allocationId]);
      allocation = ar.rows[0];
      if (!allocation) throw Object.assign(new Error('allocation_not_found'),{status:404});
      if (allocation.status !== 'pending') throw Object.assign(new Error('allocation_already_resolved'),{status:409});
      if (new Date(allocation.expires_at).getTime() < Date.now()) throw Object.assign(new Error('allocation_expired'),{status:409});
      await client.query(`UPDATE lune_order_allocations SET status='accepted',responded_at=now() WHERE id=$1`, [allocationId]);
      await client.query(`UPDATE lune_order_allocations SET status='superseded',responded_at=now() WHERE order_id=$1 AND id<>$2 AND status='pending'`, [allocation.order_id,allocationId]);
      const or = await client.query(`UPDATE lune_orders SET status='partner_accepted',allocated_location_id=$2,allocated_technician_id=$3,allocation_deadline=NULL,updated_at=now()
        WHERE id=$1 RETURNING *`, [allocation.order_id,allocation.location_id,allocation.technician_id]);
      order = or.rows[0];
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
    await recordEvent(order.id,'partner_accepted',allocation.order_status,'partner_accepted',{locationId:allocation.location_id},actor.kind,actor.id);
    notifier.customer({
      to:order.customer_email,
      subject:'Your Lune appointment has a station',
      html:`<p>${order.customer_name ? `${order.customer_name}, ` : ''}your appointment has been accepted by ${allocation.location_name}.</p><p>Return to Lune to complete payment and confirm the booking.</p>`
    }).catch(() => {});
    return order;
  }

  async function declineAllocation(allocationId, note, actor = {kind:'partner',id:null}) {
    const { rows } = await pool.query(`UPDATE lune_order_allocations SET status='declined',responded_at=now(),response_note=$2
      WHERE id=$1 AND status='pending' RETURNING *`, [allocationId,String(note || '').slice(0,500)]);
    const allocation = rows[0];
    if (!allocation) throw Object.assign(new Error('allocation_already_resolved'),{status:409});
    const orderResult = await pool.query('SELECT status FROM lune_orders WHERE id=$1',[allocation.order_id]);
    await recordEvent(allocation.order_id,'partner_declined',orderResult.rows[0]?.status,'matching',{locationId:allocation.location_id},actor.kind,actor.id);
    return allocateOrder(allocation.order_id);
  }

  async function expirePending() {
    const { rows } = await pool.query(`UPDATE lune_order_allocations SET status='expired',responded_at=now()
      WHERE status='pending' AND expires_at < now() RETURNING id,order_id,location_id`);
    const unique = [...new Set(rows.map(r => r.order_id))];
    for (const orderId of unique) {
      try {
        await recordEvent(orderId,'allocation_expired','matching','matching',{});
        await allocateOrder(orderId);
      } catch (err) { console.error('[lune-allocation-expiry]',orderId,err.message); }
    }
    return rows.length;
  }

  return { publicMatches, matchesForOrder, allocateOrder, acceptAllocation, declineAllocation, expirePending, serviceForOrder, recordEvent };
}

module.exports = createAllocator;
