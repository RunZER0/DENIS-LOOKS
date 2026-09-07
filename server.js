const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID, randomBytes, createHash } = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL || process.env.STASHI_DATABASE_URL || '';
const SESSION_COOKIE = 'lune_session';
const SESSION_DAYS = Math.max(1, Number(process.env.LUNE_SESSION_DAYS || 365));
const MAX_BODY_BYTES = 1024 * 1024;
const PRIVATE_PATHS = [
  '/server.js',
  '/migrate.js',
  '/package.json',
  '/package-lock.json',
  '/render.yaml',
  '/build-env.js',
  '/env-config.js',
  '/env-vars.json',
  '/migrations/',
  '/.env'
];

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      max: Number(process.env.PGPOOL_MAX || 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    })
  : null;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const json = (res, status, payload, extraHeaders = {}) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
};

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
}

function secureRequest(req) {
  return process.env.NODE_ENV === 'production' || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sessionCookie(req, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_DAYS * 86400)}`
  ];
  if (secureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function requireDatabase(res) {
  if (pool) return true;
  json(res, 503, { ok: false, error: 'database_not_configured' });
  return false;
}

async function ensureSession(req, res) {
  if (!pool) throw Object.assign(new Error('Database not configured'), { statusCode: 503 });

  const token = cookies(req)[SESSION_COOKIE];
  if (token) {
    const tokenHash = hash(token);
    const found = await pool.query(
      `select i.id, i.kind, i.first_name
         from lune_sessions s
         join lune_identities i on i.id = s.identity_id
        where s.token_hash = $1
          and s.expires_at > now()
        limit 1`,
      [tokenHash]
    );
    if (found.rows[0]) {
      pool.query(
        'update lune_sessions set last_seen_at = now() where token_hash = $1',
        [tokenHash]
      ).catch(() => {});
      return found.rows[0];
    }
  }

  const identityId = randomUUID();
  const nextToken = randomBytes(32).toString('base64url');
  const tokenHash = hash(nextToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into lune_identities (id, kind)
       values ($1, 'anonymous')`,
      [identityId]
    );
    await client.query(
      `insert into lune_sessions (token_hash, identity_id, expires_at)
       values ($1, $2, $3)`,
      [tokenHash, identityId, expiresAt]
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  res.setHeader('set-cookie', sessionCookie(req, nextToken));
  return { id: identityId, kind: 'anonymous', first_name: null };
}

function normalizeWork(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    style: row.style,
    description: row.description || '',
    price: Number(row.price_kes || 0),
    imageUrl: row.image_url,
    tags: Array.isArray(row.tags) ? row.tags : [],
    likes: Number(row.likes || 0)
  };
}

function normalizeInspo(row) {
  return {
    id: row.id,
    img: row.image_url,
    category: row.category,
    style: row.style,
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

async function getCatalog() {
  const [workResult, inspoResult] = await Promise.all([
    pool.query(
      `select id, title, category, style, description, price_kes, image_url, tags, likes
         from lune_nail_sets
        where is_active = true
        order by sort_order asc, created_at asc`
    ),
    pool.query(
      `select id, image_url, category, style, tags
         from lune_inspo_items
        where is_active = true
        order by sort_order asc, created_at asc`
    )
  ]);
  return {
    work: workResult.rows.map(normalizeWork),
    inspo: inspoResult.rows.map(normalizeInspo)
  };
}

async function getState(identityId) {
  const [savedWorkResult, savedInspoResult, eventsResult] = await Promise.all([
    pool.query(
      `select set_id
         from lune_saved_work
        where identity_id = $1
        order by created_at asc`,
      [identityId]
    ),
    pool.query(
      `select i.id, i.image_url, i.category, i.style, i.tags
         from lune_saved_inspo s
         join lune_inspo_items i on i.id = s.inspo_id
        where s.identity_id = $1
        order by s.created_at asc`,
      [identityId]
    ),
    pool.query(
      `select kind, item_id as id, action, weight, features,
              floor(extract(epoch from occurred_at) * 1000)::bigint as ts
         from lune_taste_events
        where identity_id = $1
        order by occurred_at desc
        limit 240`,
      [identityId]
    )
  ]);

  return {
    savedWork: savedWorkResult.rows.map(row => row.set_id),
    savedInspo: savedInspoResult.rows.map(normalizeInspo),
    events: eventsResult.rows.reverse().map(row => ({
      kind: row.kind,
      id: row.id,
      action: row.action,
      weight: Number(row.weight || 0),
      features: Array.isArray(row.features) ? row.features : [],
      ts: Number(row.ts || Date.now())
    }))
  };
}

function cleanIds(value, limit = 200) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim())
    .filter(Boolean))]
    .slice(0, limit);
}

function cleanInspoIds(value) {
  return cleanIds((Array.isArray(value) ? value : []).map(item => item && typeof item === 'object' ? item.id : item), 200);
}

function cleanEvents(value) {
  const allowedActions = new Set(['open', 'save', 'unsave', 'share', 'book']);
  const allowedKinds = new Set(['work', 'inspo']);
  return (Array.isArray(value) ? value : []).slice(-240).flatMap(event => {
    if (!event || typeof event !== 'object') return [];
    const kind = String(event.kind || '');
    const itemId = String(event.id || '').trim();
    const action = String(event.action || '');
    if (!allowedKinds.has(kind) || !itemId || !allowedActions.has(action)) return [];
    const ts = Number(event.ts);
    const features = cleanIds(event.features, 40);
    const weight = Number.isFinite(Number(event.weight)) ? Number(event.weight) : 0;
    return [{
      kind,
      id: itemId,
      action,
      weight,
      features,
      ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now()
    }];
  });
}

async function putState(identityId, body) {
  const savedWork = cleanIds(body.savedWork);
  const savedInspo = cleanInspoIds(body.savedInspo);
  const events = cleanEvents(body.events);
  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query('delete from lune_saved_work where identity_id = $1', [identityId]);
    if (savedWork.length) {
      await client.query(
        `insert into lune_saved_work (identity_id, set_id)
         select $1, candidate.id
           from lune_nail_sets candidate
          where candidate.id = any($2::text[])
         on conflict do nothing`,
        [identityId, savedWork]
      );
    }

    await client.query('delete from lune_saved_inspo where identity_id = $1', [identityId]);
    if (savedInspo.length) {
      await client.query(
        `insert into lune_saved_inspo (identity_id, inspo_id)
         select $1, candidate.id
           from lune_inspo_items candidate
          where candidate.id = any($2::text[])
         on conflict do nothing`,
        [identityId, savedInspo]
      );
    }

    for (const event of events) {
      const eventKey = hash(JSON.stringify([
        event.kind,
        event.id,
        event.action,
        event.weight,
        event.features,
        event.ts
      ]));
      await client.query(
        `insert into lune_taste_events
          (identity_id, client_event_key, kind, item_id, action, weight, features, occurred_at)
         values ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
         on conflict (identity_id, client_event_key) do nothing`,
        [
          identityId,
          eventKey,
          event.kind,
          event.id,
          event.action,
          event.weight,
          event.features,
          event.ts
        ]
      );
    }

    await client.query(
      `delete from lune_taste_events
        where identity_id = $1
          and id not in (
            select id
              from lune_taste_events
             where identity_id = $1
             order by occurred_at desc
             limit 240
          )`,
      [identityId]
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return getState(identityId);
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    if (!requireDatabase(res)) return;
    try {
      await pool.query('select 1');
      return json(res, 200, { ok: true, database: 'connected' });
    } catch (error) {
      return json(res, 503, { ok: false, database: 'unavailable' });
    }
  }

  if (url.pathname === '/api/catalog' && req.method === 'GET') {
    if (!requireDatabase(res)) return;
    try {
      return json(res, 200, await getCatalog());
    } catch (error) {
      console.error('catalog error', error);
      return json(res, 500, { ok: false, error: 'catalog_unavailable' });
    }
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    if (!requireDatabase(res)) return;
    try {
      const identity = await ensureSession(req, res);
      return json(res, 200, {
        identity: {
          id: identity.id,
          state: identity.kind === 'member' ? 'member' : 'anonymous',
          firstName: identity.first_name || ''
        },
        ...(await getState(identity.id))
      });
    } catch (error) {
      console.error('state read error', error);
      return json(res, error.statusCode || 500, { ok: false, error: 'state_unavailable' });
    }
  }

  if (url.pathname === '/api/state' && req.method === 'PUT') {
    if (!requireDatabase(res)) return;
    try {
      const identity = await ensureSession(req, res);
      const body = await readBody(req);
      const state = await putState(identity.id, body);
      return json(res, 200, { ok: true, ...state });
    } catch (error) {
      console.error('state write error', error);
      return json(res, error.statusCode || 500, { ok: false, error: 'state_write_failed' });
    }
  }

  json(res, 404, { ok: false, error: 'not_found' });
}

function isPrivatePath(pathname) {
  const lower = pathname.toLowerCase();
  return PRIVATE_PATHS.some(item => item.endsWith('/') ? lower.startsWith(item) : lower === item || lower.startsWith(item));
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (isPrivatePath(pathname)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  if (pathname === '/') pathname = '/index.html';
  const relative = pathname.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(resolved, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const type = mime[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'content-type': type,
      'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(resolved).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    });
    return req.method === 'HEAD' ? res.end() : res.end('{"ok":true}');
  }

  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'HEAD' && url.pathname === '/api/health') {
      if (!pool) return res.writeHead(503).end();
      try {
        await pool.query('select 1');
        return res.writeHead(200).end();
      } catch (_) {
        return res.writeHead(503).end();
      }
    }
    return handleApi(req, res, url);
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }

  return serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lune listening on ${PORT}${pool ? ' with Stashi/Postgres' : ' without DATABASE_URL'}.`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
