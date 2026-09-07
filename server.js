const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000
}) : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[decodeURIComponent(part.slice(0, i).trim())] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token, maxAgeSeconds = SESSION_DAYS * 86400) {
  const secure = PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `lune_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}
function clearSessionCookie(res) {
  const secure = PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `lune_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, encoded) {
  try {
    const [kind, saltHex, hashHex] = String(encoded).split('$');
    if (kind !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) { return false; }
}
function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'database_not_configured' });
  next();
}

async function sessionUser(req) {
  if (!pool) return null;
  const token = parseCookies(req).lune_session;
  if (!token) return null;
  const tokenHash = sha256(token);
  const { rows } = await pool.query(`
    SELECT u.id,u.email,u.display_name,u.phone,s.id AS session_id
    FROM lune_user_sessions s
    JOIN lune_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now()
    LIMIT 1`, [tokenHash]);
  if (!rows[0]) return null;
  pool.query('UPDATE lune_user_sessions SET last_seen_at=now() WHERE id=$1', [rows[0].session_id]).catch(() => {});
  return rows[0];
}

async function ensureVisitor(anonymousKey, userId = null, metadata = {}) {
  if (!anonymousKey || String(anonymousKey).length > 160) throw Object.assign(new Error('visitor_id_required'), { status: 400 });
  const visitorId = id('vis');
  const { rows } = await pool.query(`
    INSERT INTO lune_visitors (id,anonymous_key,user_id,metadata)
    VALUES ($1,$2,$3,$4::jsonb)
    ON CONFLICT (anonymous_key) DO UPDATE SET
      last_seen_at=now(),
      user_id=COALESCE(EXCLUDED.user_id,lune_visitors.user_id),
      metadata=lune_visitors.metadata || EXCLUDED.metadata
    RETURNING id,anonymous_key,user_id,first_seen_at,last_seen_at`,
    [visitorId, String(anonymousKey), userId, JSON.stringify(metadata || {})]);
  return rows[0];
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO lune_user_sessions (id,user_id,token_hash,expires_at)
    VALUES ($1,$2,$3,now()+($4 || ' days')::interval)`,
    [id('ses'), userId, sha256(token), String(SESSION_DAYS)]);
  setSessionCookie(res, token);
}

async function mergeVisitorIntoUser(visitorDbId, userId) {
  await pool.query('BEGIN');
  try {
    await pool.query('UPDATE lune_visitors SET user_id=$2,last_seen_at=now() WHERE id=$1', [visitorDbId, userId]);
    await pool.query(`
      INSERT INTO lune_saved_items (owner_kind,owner_id,item_kind,item_id,is_saved,item_snapshot,created_at,updated_at)
      SELECT 'user',$2,item_kind,item_id,is_saved,item_snapshot,created_at,updated_at
      FROM lune_saved_items WHERE owner_kind='visitor' AND owner_id=$1
      ON CONFLICT (owner_kind,owner_id,item_kind,item_id) DO UPDATE SET
        is_saved=EXCLUDED.is_saved,
        item_snapshot=EXCLUDED.item_snapshot,
        updated_at=EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at > lune_saved_items.updated_at`, [visitorDbId, userId]);
    await pool.query('UPDATE lune_taste_events SET user_id=$2 WHERE visitor_id=$1 AND user_id IS NULL', [visitorDbId, userId]);
    await pool.query('UPDATE lune_recommendation_impressions SET user_id=$2 WHERE visitor_id=$1 AND user_id IS NULL', [visitorDbId, userId]);
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.display_name || '', phone: user.phone || '' };
}

app.get('/api/health', requireDb, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT now() AS now');
    res.json({ ok: true, database: true, now: rows[0].now });
  } catch (err) { res.status(503).json({ ok: false, database: false }); }
});

app.post('/api/identity/visitor', requireDb, async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(req.body?.visitorId, user?.id || null, {
      path: req.body?.path || null,
      timezone: req.body?.timezone || null,
      language: req.body?.language || null
    });
    res.json({ visitor, user: publicUser(user) });
  } catch (err) { next(err); }
});

app.post('/api/auth/register', requireDb, async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim().slice(0, 120);
  const phone = String(req.body?.phone || '').trim().slice(0, 40);
  if (!validEmail(email)) return res.status(400).json({ error: 'valid_email_required' });
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  try {
    const userId = id('usr');
    const { rows } = await pool.query(`INSERT INTO lune_users (id,email,password_hash,display_name,phone)
      VALUES ($1,$2,$3,$4,$5) RETURNING id,email,display_name,phone`,
      [userId, email, hashPassword(password), displayName || null, phone || null]);
    const visitor = await ensureVisitor(req.body?.visitorId, userId);
    await mergeVisitorIntoUser(visitor.id, userId);
    await createSession(res, userId);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email_already_registered' });
    next(err);
  }
});

app.post('/api/auth/login', requireDb, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const { rows } = await pool.query('SELECT * FROM lune_users WHERE email=$1 LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
    const visitor = await ensureVisitor(req.body?.visitorId, user.id);
    await mergeVisitorIntoUser(visitor.id, user.id);
    await createSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

app.post('/api/auth/logout', requireDb, async (req, res, next) => {
  try {
    const token = parseCookies(req).lune_session;
    if (token) await pool.query('DELETE FROM lune_user_sessions WHERE token_hash=$1', [sha256(token)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', requireDb, async (req, res, next) => {
  try { res.json({ user: publicUser(await sessionUser(req)) }); }
  catch (err) { next(err); }
});

app.patch('/api/profile', requireDb, async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'authentication_required' });
    const displayName = String(req.body?.displayName || '').trim().slice(0, 120);
    const phone = String(req.body?.phone || '').trim().slice(0, 40);
    const { rows } = await pool.query(`UPDATE lune_users SET display_name=$2,phone=$3,updated_at=now()
      WHERE id=$1 RETURNING id,email,display_name,phone`, [user.id, displayName || null, phone || null]);
    res.json({ user: publicUser(rows[0]) });
  } catch (err) { next(err); }
});

app.post('/api/saves/toggle', requireDb, async (req, res, next) => {
  try {
    const kind = req.body?.kind;
    const itemId = String(req.body?.itemId || '');
    if (!['work','inspo'].includes(kind) || !itemId) return res.status(400).json({ error: 'invalid_item' });
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(req.body?.visitorId, user?.id || null);
    const ownerKind = user ? 'user' : 'visitor';
    const ownerId = user ? user.id : visitor.id;
    const saved = req.body?.saved !== false;
    await pool.query(`INSERT INTO lune_saved_items
      (owner_kind,owner_id,item_kind,item_id,is_saved,item_snapshot,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,now())
      ON CONFLICT (owner_kind,owner_id,item_kind,item_id) DO UPDATE SET
      is_saved=EXCLUDED.is_saved,item_snapshot=EXCLUDED.item_snapshot,updated_at=now()`,
      [ownerKind, ownerId, kind, itemId, saved, JSON.stringify(req.body?.snapshot || {})]);
    res.json({ ok: true, saved });
  } catch (err) { next(err); }
});

app.post('/api/saves/import', requireDb, async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(req.body?.visitorId, user?.id || null);
    const ownerKind = user ? 'user' : 'visitor';
    const ownerId = user ? user.id : visitor.id;
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
    for (const item of items) {
      if (!['work','inspo'].includes(item.kind) || !item.itemId) continue;
      await pool.query(`INSERT INTO lune_saved_items (owner_kind,owner_id,item_kind,item_id,is_saved,item_snapshot,updated_at)
        VALUES ($1,$2,$3,$4,true,$5::jsonb,now())
        ON CONFLICT (owner_kind,owner_id,item_kind,item_id) DO NOTHING`,
        [ownerKind, ownerId, item.kind, String(item.itemId), JSON.stringify(item.snapshot || {})]);
    }
    res.json({ ok: true, imported: items.length });
  } catch (err) { next(err); }
});

app.post('/api/taste/events', requireDb, async (req, res, next) => {
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 100) : [];
  if (!events.length) return res.json({ ok: true, accepted: 0 });
  const client = await pool.connect();
  try {
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(req.body?.visitorId, user?.id || null);
    await client.query('BEGIN');
    let accepted = 0;
    for (const event of events) {
      if (!event?.id || !['work','inspo'].includes(event.kind) || !event.itemId || !event.action) continue;
      const occurred = new Date(Number(event.ts || Date.now()));
      const result = await client.query(`INSERT INTO lune_taste_events
        (event_id,visitor_id,user_id,session_key,item_kind,item_id,action,weight,features,surface,source,dwell_ms,bucket,rank,occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (event_id) DO NOTHING`, [
          String(event.id), visitor.id, user?.id || null, String(req.body?.sessionId || event.sessionId || ''),
          event.kind, String(event.itemId), String(event.action), Number(event.weight || 0),
          Array.isArray(event.features) ? event.features.slice(0, 80) : [], event.surface || null, event.source || null,
          event.dwellMs ? Math.min(Number(event.dwellMs), 3600000) : null, event.bucket || null,
          event.rank ? Number(event.rank) : null, occurred
        ]);
      if (!result.rowCount) continue;
      accepted += 1;
      if (event.action === 'impression') {
        await client.query(`INSERT INTO lune_recommendation_impressions
          (id,event_id,visitor_id,user_id,item_kind,item_id,surface,bucket,rank,shown_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (event_id) DO NOTHING`, [id('imp'), String(event.id), visitor.id, user?.id || null,
          event.kind, String(event.itemId), event.surface || 'unknown', event.bucket || null,
          event.rank ? Number(event.rank) : null, occurred]);
      } else if (['open','save','share','book','reorder','dislike','unsave'].includes(event.action)) {
        await client.query(`UPDATE lune_recommendation_impressions SET engaged_action=$1,engaged_at=$2
          WHERE id=(SELECT id FROM lune_recommendation_impressions
            WHERE visitor_id=$3 AND item_kind=$4 AND item_id=$5 AND engaged_at IS NULL
            ORDER BY shown_at DESC LIMIT 1)`, [event.action, occurred, visitor.id, event.kind, String(event.itemId)]);
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, accepted });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

app.get('/api/state', requireDb, async (req, res, next) => {
  try {
    const anonymousKey = String(req.query.visitorId || '');
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(anonymousKey, user?.id || null);
    const ownerKind = user ? 'user' : 'visitor';
    const ownerId = user ? user.id : visitor.id;
    const [savedResult, eventResult, impressionResult] = await Promise.all([
      pool.query(`SELECT item_kind,item_id,is_saved,item_snapshot,updated_at FROM lune_saved_items
        WHERE owner_kind=$1 AND owner_id=$2 ORDER BY updated_at DESC`, [ownerKind, ownerId]),
      user ? pool.query(`SELECT event_id,item_kind,item_id,action,weight,features,surface,source,dwell_ms,bucket,rank,occurred_at
        FROM lune_taste_events WHERE user_id=$1 ORDER BY occurred_at DESC LIMIT 500`, [user.id])
        : pool.query(`SELECT event_id,item_kind,item_id,action,weight,features,surface,source,dwell_ms,bucket,rank,occurred_at
        FROM lune_taste_events WHERE visitor_id=$1 ORDER BY occurred_at DESC LIMIT 500`, [visitor.id]),
      user ? pool.query(`SELECT item_kind,item_id,surface,bucket,rank,shown_at,engaged_action,engaged_at
        FROM lune_recommendation_impressions WHERE user_id=$1 ORDER BY shown_at DESC LIMIT 500`, [user.id])
        : pool.query(`SELECT item_kind,item_id,surface,bucket,rank,shown_at,engaged_action,engaged_at
        FROM lune_recommendation_impressions WHERE visitor_id=$1 ORDER BY shown_at DESC LIMIT 500`, [visitor.id])
    ]);
    const tasteEvents = eventResult.rows.reverse().map(row => ({
      id: row.event_id, kind: row.item_kind, itemId: row.item_id, action: row.action,
      weight: Number(row.weight), features: row.features || [], surface: row.surface, source: row.source,
      dwellMs: row.dwell_ms, bucket: row.bucket, rank: row.rank, ts: new Date(row.occurred_at).getTime()
    }));
    res.json({
      user: publicUser(user),
      visitor: { id: visitor.anonymous_key },
      savedItems: savedResult.rows,
      tasteEvents,
      impressions: impressionResult.rows
    });
  } catch (err) { next(err); }
});

app.get('/api/catalog/work', requireDb, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM lune_work_items WHERE active=true ORDER BY popularity_score DESC,title');
    res.json({ items: rows });
  } catch (err) { next(err); }
});
app.get('/api/catalog/inspo', requireDb, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM lune_inspo_items WHERE active=true ORDER BY editorial_score DESC,title');
    res.json({ items: rows });
  } catch (err) { next(err); }
});

app.post('/api/orders/drafts', requireDb, async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(req.body?.visitorId, user?.id || null);
    const orderId = id('ord');
    const kind = ['work','inspo','custom'].includes(req.body?.itemKind) ? req.body.itemKind : 'custom';
    await pool.query(`INSERT INTO lune_orders
      (id,user_id,visitor_id,item_kind,item_id,item_snapshot,experience_preference,status)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'draft')`, [orderId, user?.id || null, visitor.id,
      kind, req.body?.itemId || null, JSON.stringify(req.body?.snapshot || {}), req.body?.experiencePreference || null]);
    res.status(201).json({ id: orderId, status: 'draft' });
  } catch (err) { next(err); }
});

app.get('/api/orders', requireDb, async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    const visitor = await ensureVisitor(req.query.visitorId, user?.id || null);
    const { rows } = user
      ? await pool.query('SELECT * FROM lune_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [user.id])
      : await pool.query('SELECT * FROM lune_orders WHERE visitor_id=$1 ORDER BY created_at DESC LIMIT 100', [visitor.id]);
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

app.use(express.static(path.join(__dirname), { extensions: ['html'], maxAge: PROD ? '10m' : 0 }));

app.use((err, _req, res, _next) => {
  console.error('[lune-api]', err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`Lune listening on :${PORT}${pool ? ' with database' : ' without DATABASE_URL'}`);
});
