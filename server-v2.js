'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const installLuneOps = require('./lune-ops-loader');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;

const pool = DATABASE_URL ? new Pool({
  connectionString:DATABASE_URL,
  ssl:process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized:false },
  max:10,
  idleTimeoutMillis:30000,
  connectionTimeoutMillis:8000
}) : null;

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(express.json({
  limit:'4mb',
  verify:(req,_res,buf)=>{ if(req.originalUrl === '/api/paystack/webhook') req.rawBody = Buffer.from(buf); }
}));

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[decodeURIComponent(part.slice(0,i).trim())] = decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}
function setSessionCookie(res,value,maxAgeSeconds=SESSION_DAYS*86400) {
  res.setHeader('Set-Cookie',`lune_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${PROD?'; Secure':''}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',`lune_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${PROD?'; Secure':''}`);
}
function hashPassword(password) {
  const salt=crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
function verifyPassword(password,encoded) {
  try {
    const [kind,saltHex,hashHex]=String(encoded).split('$');
    if(kind!=='scrypt') return false;
    const expected=Buffer.from(hashHex,'hex');
    const actual=crypto.scryptSync(password,Buffer.from(saltHex,'hex'),expected.length);
    return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
  } catch (_) { return false; }
}
function requireDb(_req,res,next) {
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  next();
}
function asyncRoute(fn){return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}

async function sessionUser(req) {
  if(!pool) return null;
  const raw=parseCookies(req).lune_session;
  if(!raw) return null;
  const {rows}=await pool.query(`SELECT u.id,u.email,u.display_name,u.phone,u.role,u.marketing_opt_in,s.id AS session_id
    FROM lune_user_sessions s JOIN lune_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1`,[sha256(raw)]);
  if(!rows[0]) return null;
  pool.query('UPDATE lune_user_sessions SET last_seen_at=now() WHERE id=$1',[rows[0].session_id]).catch(()=>{});
  return rows[0];
}

async function ensureVisitor(anonymousKey,userId=null,metadata={}) {
  if(!anonymousKey||String(anonymousKey).length>160) throw Object.assign(new Error('visitor_id_required'),{status:400});
  const {rows}=await pool.query(`INSERT INTO lune_visitors(id,anonymous_key,user_id,metadata)
    VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(anonymous_key) DO UPDATE SET last_seen_at=now(),user_id=COALESCE(EXCLUDED.user_id,lune_visitors.user_id),metadata=lune_visitors.metadata||EXCLUDED.metadata
    RETURNING id,anonymous_key,user_id,first_seen_at,last_seen_at`,[id('vis'),String(anonymousKey),userId,JSON.stringify(metadata||{})]);
  return rows[0];
}

async function createSession(res,userId){
  const raw=crypto.randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO lune_user_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+($4||' days')::interval)`,[id('ses'),userId,sha256(raw),String(SESSION_DAYS)]);
  setSessionCookie(res,raw);
}

async function mergeVisitorIntoUser(visitorDbId,userId){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('UPDATE lune_visitors SET user_id=$2,last_seen_at=now() WHERE id=$1',[visitorDbId,userId]);
    await client.query(`INSERT INTO lune_saved_items(owner_kind,owner_id,item_kind,item_id,is_saved,item_snapshot,created_at,updated_at)
      SELECT 'user',$2,item_kind,item_id,is_saved,item_snapshot,created_at,updated_at FROM lune_saved_items WHERE owner_kind='visitor' AND owner_id=$1
      ON CONFLICT(owner_kind,owner_id,item_kind,item_id) DO UPDATE SET is_saved=EXCLUDED.is_saved,item_snapshot=EXCLUDED.item_snapshot,updated_at=EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at>lune_saved_items.updated_at`,[visitorDbId,userId]);
    await client.query('UPDATE lune_taste_events SET user_id=$2 WHERE visitor_id=$1 AND user_id IS NULL',[visitorDbId,userId]);
    await client.query('UPDATE lune_recommendation_impressions SET user_id=$2 WHERE visitor_id=$1 AND user_id IS NULL',[visitorDbId,userId]);
    await client.query('UPDATE lune_orders SET user_id=$2 WHERE visitor_id=$1 AND user_id IS NULL',[visitorDbId,userId]);
    await client.query('COMMIT');
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}finally{client.release();}
}

function publicUser(user){
  if(!user)return null;
  return {id:user.id,email:user.email,displayName:user.display_name||'',phone:user.phone||'',role:user.role||'customer',marketingOptIn:Boolean(user.marketing_opt_in)};
}

app.get('/api/health',requireDb,asyncRoute(async(_req,res)=>{
  const {rows}=await pool.query('SELECT now() AS now');
  res.json({ok:true,database:true,now:rows[0].now});
}));

app.post('/api/identity/visitor',requireDb,asyncRoute(async(req,res)=>{
  const user=await sessionUser(req);
  const visitor=await ensureVisitor(req.body?.visitorId,user?.id||null,{path:req.body?.path||null,ref:req.body?.ref||null,timezone:req.body?.timezone||null,language:req.body?.language||null});
  res.json({visitor,user:publicUser(user)});
}));

app.post('/api/auth/register',requireDb,asyncRoute(async(req,res)=>{
  const email=normalizeEmail(req.body?.email),password=String(req.body?.password||'');
  const displayName=String(req.body?.displayName||'').trim().slice(0,120),phone=String(req.body?.phone||'').trim().slice(0,40);
  if(!validEmail(email))return res.status(400).json({error:'valid_email_required'});
  if(password.length<8)return res.status(400).json({error:'password_too_short'});
  try{
    const userId=id('usr');
    const {rows}=await pool.query(`INSERT INTO lune_users(id,email,password_hash,display_name,phone) VALUES($1,$2,$3,$4,$5) RETURNING *`,[userId,email,hashPassword(password),displayName||null,phone||null]);
    const visitor=await ensureVisitor(req.body?.visitorId,userId);
    await mergeVisitorIntoUser(visitor.id,userId);
    await createSession(res,userId);
    res.status(201).json({user:publicUser(rows[0])});
  }catch(err){if(err.code==='23505')return res.status(409).json({error:'email_already_registered'});throw err;}
}));

app.post('/api/auth/login',requireDb,asyncRoute(async(req,res)=>{
  const email=normalizeEmail(req.body?.email),password=String(req.body?.password||'');
  const {rows}=await pool.query('SELECT * FROM lune_users WHERE email=$1 LIMIT 1',[email]);
  const user=rows[0];
  if(!user||!verifyPassword(password,user.password_hash))return res.status(401).json({error:'invalid_credentials'});
  const visitor=await ensureVisitor(req.body?.visitorId,user.id);
  await mergeVisitorIntoUser(visitor.id,user.id);
  await createSession(res,user.id);
  res.json({user:publicUser(user)});
}));

app.post('/api/auth/logout',requireDb,asyncRoute(async(req,res)=>{
  const raw=parseCookies(req).lune_session;
  if(raw)await pool.query('DELETE FROM lune_user_sessions WHERE token_hash=$1',[sha256(raw)]);
  clearSessionCookie(res);res.json({ok:true});
}));

app.get('/api/auth/me',requireDb,asyncRoute(async(req,res)=>res.json({user:publicUser(await sessionUser(req))})));

app.patch('/api/profile',requireDb,asyncRoute(async(req,res)=>{
  const user=await sessionUser(req);if(!user)return res.status(401).json({error:'authentication_required'});
  const displayName=String(req.body?.displayName||'').trim().slice(0,120),phone=String(req.body?.phone||'').trim().slice(0,40);
  const {rows}=await pool.query(`UPDATE lune_users SET display_name=$2,phone=$3,marketing_opt_in=COALESCE($4,marketing_opt_in),updated_at=now() WHERE id=$1 RETURNING *`,[user.id,displayName||null,phone||null,req.body?.marketingOptIn==null?null:Boolean(req.body.marketingOptIn)]);
  res.json({user:publicUser(rows[0])});
}));

app.post('/api/saves/toggle',requireDb,asyncRoute(async(req,res)=>{
  const kind=req.body?.kind,itemId=String(req.body?.itemId||'');
  if(!['work','inspo'].includes(kind)||!itemId)return res.status(400).json({error:'invalid_item'});
  const user=await sessionUser(req),visitor=await ensureVisitor(req.body?.visitorId,user?.id||null);
  const ownerKind=user?'user':'visitor',ownerId=user?user.id:visitor.id,saved=req.body?.saved!==false;
  await pool.query(`INSERT INTO lune_saved_items(owner_kind,owner_id,item_kind,item_id,is_saved,item_snapshot,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,now())
    ON CONFLICT(owner_kind,owner_id,item_kind,item_id) DO UPDATE SET is_saved=EXCLUDED.is_saved,item_snapshot=EXCLUDED.item_snapshot,updated_at=now()`,[ownerKind,ownerId,kind,itemId,saved,JSON.stringify(req.body?.snapshot||{})]);
  res.json({ok:true,saved});
}));

app.post('/api/saves/import',requireDb,asyncRoute(async(req,res)=>{
  const user=await sessionUser(req),visitor=await ensureVisitor(req.body?.visitorId,user?.id||null);
  const ownerKind=user?'user':'visitor',ownerId=user?user.id:visitor.id,items=Array.isArray(req.body?.items)?req.body.items.slice(0,200):[];
  let imported=0;
  for(const item of items){
    if(!['work','inspo'].includes(item.kind)||!item.itemId)continue;
    await pool.query(`INSERT INTO lune_saved_items(owner_kind,owner_id,item_kind,item_id,is_saved,item_snapshot,updated_at) VALUES($1,$2,$3,$4,true,$5::jsonb,now()) ON CONFLICT(owner_kind,owner_id,item_kind,item_id) DO NOTHING`,[ownerKind,ownerId,item.kind,String(item.itemId),JSON.stringify(item.snapshot||{})]);
    imported++;
  }
  res.json({ok:true,imported});
}));

app.post('/api/taste/events',requireDb,asyncRoute(async(req,res)=>{
  const events=Array.isArray(req.body?.events)?req.body.events.slice(0,100):[];
  if(!events.length)return res.json({ok:true,accepted:0});
  const user=await sessionUser(req),visitor=await ensureVisitor(req.body?.visitorId,user?.id||null),client=await pool.connect();
  let accepted=0;
  try{
    await client.query('BEGIN');
    for(const event of events){
      if(!event?.id||!['work','inspo'].includes(event.kind)||!event.itemId||!event.action)continue;
      const occurred=new Date(Number(event.ts||Date.now()));
      const result=await client.query(`INSERT INTO lune_taste_events(event_id,visitor_id,user_id,session_key,item_kind,item_id,action,weight,features,surface,source,dwell_ms,bucket,rank,occurred_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(event_id) DO NOTHING`,[String(event.id),visitor.id,user?.id||null,String(req.body?.sessionId||event.sessionId||''),event.kind,String(event.itemId),String(event.action),Number(event.weight||0),Array.isArray(event.features)?event.features.slice(0,80):[],event.surface||null,event.source||null,event.dwellMs?Math.min(Number(event.dwellMs),3600000):null,event.bucket||null,event.rank?Number(event.rank):null,occurred]);
      if(!result.rowCount)continue;accepted++;
      if(event.action==='impression')await client.query(`INSERT INTO lune_recommendation_impressions(id,event_id,visitor_id,user_id,item_kind,item_id,surface,bucket,rank,shown_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(event_id) DO NOTHING`,[id('imp'),String(event.id),visitor.id,user?.id||null,event.kind,String(event.itemId),event.surface||'unknown',event.bucket||null,event.rank?Number(event.rank):null,occurred]);
      else if(['open','save','share','book','reorder','dislike','unsave'].includes(event.action))await client.query(`UPDATE lune_recommendation_impressions SET engaged_action=$1,engaged_at=$2 WHERE id=(SELECT id FROM lune_recommendation_impressions WHERE visitor_id=$3 AND item_kind=$4 AND item_id=$5 AND engaged_at IS NULL ORDER BY shown_at DESC LIMIT 1)`,[event.action,occurred,visitor.id,event.kind,String(event.itemId)]);
    }
    await client.query('COMMIT');
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}finally{client.release();}
  res.json({ok:true,accepted});
}));

app.get('/api/state',requireDb,asyncRoute(async(req,res)=>{
  const user=await sessionUser(req),visitor=await ensureVisitor(String(req.query.visitorId||''),user?.id||null);
  const ownerKind=user?'user':'visitor',ownerId=user?user.id:visitor.id;
  const [savedResult,eventResult,impressionResult]=await Promise.all([
    pool.query(`SELECT item_kind,item_id,is_saved,item_snapshot,updated_at FROM lune_saved_items WHERE owner_kind=$1 AND owner_id=$2 ORDER BY updated_at DESC`,[ownerKind,ownerId]),
    user?pool.query(`SELECT event_id,item_kind,item_id,action,weight,features,surface,source,dwell_ms,bucket,rank,occurred_at FROM lune_taste_events WHERE user_id=$1 ORDER BY occurred_at DESC LIMIT 500`,[user.id]):pool.query(`SELECT event_id,item_kind,item_id,action,weight,features,surface,source,dwell_ms,bucket,rank,occurred_at FROM lune_taste_events WHERE visitor_id=$1 ORDER BY occurred_at DESC LIMIT 500`,[visitor.id]),
    user?pool.query(`SELECT item_kind,item_id,surface,bucket,rank,shown_at,engaged_action,engaged_at FROM lune_recommendation_impressions WHERE user_id=$1 ORDER BY shown_at DESC LIMIT 500`,[user.id]):pool.query(`SELECT item_kind,item_id,surface,bucket,rank,shown_at,engaged_action,engaged_at FROM lune_recommendation_impressions WHERE visitor_id=$1 ORDER BY shown_at DESC LIMIT 500`,[visitor.id])
  ]);
  const tasteEvents=eventResult.rows.reverse().map(row=>({id:row.event_id,kind:row.item_kind,itemId:row.item_id,action:row.action,weight:Number(row.weight),features:row.features||[],surface:row.surface,source:row.source,dwellMs:row.dwell_ms,bucket:row.bucket,rank:row.rank,ts:new Date(row.occurred_at).getTime()}));
  res.json({user:publicUser(user),visitor:{id:visitor.anonymous_key},savedItems:savedResult.rows,tasteEvents,impressions:impressionResult.rows});
}));

app.get('/api/catalog/work',requireDb,asyncRoute(async(_req,res)=>{const {rows}=await pool.query(`SELECT w.*,COALESCE(proof.review_count,0)::int AS review_count,COALESCE(proof.booking_count,0)::int AS booking_count,proof.average_rating
  FROM lune_work_items w LEFT JOIN (SELECT item_kind,item_id,count(*) FILTER (WHERE status IN ('completed','reviewed'))::int AS booking_count,count(r.id)::int AS review_count,round(avg(r.rating)::numeric,1) AS average_rating FROM lune_orders o LEFT JOIN lune_reviews r ON r.order_id=o.id GROUP BY item_kind,item_id) proof ON proof.item_kind='work' AND proof.item_id=w.id
  WHERE w.active=true ORDER BY w.popularity_score DESC,w.title`);res.json({items:rows});}));
app.get('/api/catalog/inspo',requireDb,asyncRoute(async(_req,res)=>{const {rows}=await pool.query(`SELECT i.*,COALESCE(proof.review_count,0)::int AS review_count,COALESCE(proof.booking_count,0)::int AS booking_count,proof.average_rating
  FROM lune_inspo_items i LEFT JOIN (SELECT item_kind,item_id,count(*) FILTER (WHERE status IN ('completed','reviewed'))::int AS booking_count,count(r.id)::int AS review_count,round(avg(r.rating)::numeric,1) AS average_rating FROM lune_orders o LEFT JOIN lune_reviews r ON r.order_id=o.id GROUP BY item_kind,item_id) proof ON proof.item_kind='inspo' AND proof.item_id=i.id
  WHERE i.active=true ORDER BY i.editorial_score DESC,i.title`);res.json({items:rows});}));

app.post('/api/orders/drafts',requireDb,asyncRoute(async(req,res)=>{
  const user=await sessionUser(req),visitor=await ensureVisitor(req.body?.visitorId,user?.id||null),orderId=id('ord');
  const kind=['work','inspo','custom'].includes(req.body?.itemKind)?req.body.itemKind:'custom';
  await pool.query(`INSERT INTO lune_orders(id,user_id,visitor_id,item_kind,item_id,item_snapshot,experience_preference,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'draft')`,[orderId,user?.id||null,visitor.id,kind,req.body?.itemId||null,JSON.stringify(req.body?.snapshot||{}),req.body?.experiencePreference||null]);
  res.status(201).json({id:orderId,status:'draft'});
}));

app.get('/api/orders',requireDb,asyncRoute(async(req,res)=>{
  const user=await sessionUser(req),visitor=await ensureVisitor(req.query.visitorId,user?.id||null);
  const {rows}=user?await pool.query('SELECT * FROM lune_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id]):await pool.query('SELECT * FROM lune_orders WHERE visitor_id=$1 ORDER BY created_at DESC LIMIT 100',[visitor.id]);
  res.json({orders:rows});
}));

installLuneOps(app,{pool,requireDb,sessionUser,ensureVisitor,id});

const PRIVATE_PATHS = /^(?:\/(?:migrations|scripts|lib)\/|\/(?:server(?:-v2)?|lune-ops(?:-loader)?|build-env|firebase-service|equity-payment|paystack-payment)\.js$|\/env-vars\.json$|\/package(?:-lock)?\.json$|\/render\.yaml$|\/\.env)/i;
app.use((req,res,next)=>PRIVATE_PATHS.test(req.path)?res.status(404).end():next());
app.use(express.static(path.join(__dirname),{extensions:['html'],maxAge:PROD?'10m':0,dotfiles:'ignore'}));
app.use((err,_req,res,_next)=>{console.error('[lune-api]',err);res.status(err.status||500).json({error:err.status?err.message:'internal_error'});});

if(require.main===module){app.listen(PORT,()=>console.log(`Lune listening on :${PORT}${pool?' with database':' without DATABASE_URL'}`));}
module.exports={app,pool};
