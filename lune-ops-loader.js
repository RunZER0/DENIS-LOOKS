'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const filename = path.join(__dirname, 'lune-ops.js');
let source = fs.readFileSync(filename, 'utf8');

source = source.replace(
  "module.exports = function installLuneOps(app, { pool, requireDb, sessionUser, ensureVisitor, id }) {",
  "module.exports = function installLuneOps(app, { pool, requireDb, sessionUser, ensureVisitor, id }) {\n  require('./release-ops')(app,{pool,requireDb,sessionUser,ensureVisitor,id});"
);

source = source.replace(
  "    const ownerFilter = user ? ['user_id',$2 = undefined] : null;\n    void ownerFilter;\n",
  ''
);

source = source.replace(
  "    if (!offer) return { offer:null, discountKes:0 };\n    const reward = offer.reward || {};",
  "    if (!offer) return { offer:null, discountKes:0 };\n    const prior = user\n      ? await pool.query(\"SELECT 1 FROM lune_offer_assignments WHERE offer_id=$1 AND user_id=$2 AND status='redeemed' LIMIT 1\",[offer.id,user.id])\n      : visitor ? await pool.query(\"SELECT 1 FROM lune_offer_assignments WHERE offer_id=$1 AND visitor_id=$2 AND status='redeemed' LIMIT 1\",[offer.id,visitor.id]) : {rows:[]};\n    if (prior.rows[0]) return { offer:null, discountKes:0 };\n    const reward = offer.reward || {};"
);

source = source.replace(
  "    const offer = offers.rows.find(o => matchesRule(o.rule)) || null;",
  "    const blockedResult = user\n      ? await pool.query(\"SELECT offer_id FROM lune_offer_assignments WHERE user_id=$1 AND status IN ('dismissed','redeemed')\",[user.id])\n      : await pool.query(\"SELECT offer_id FROM lune_offer_assignments WHERE visitor_id=$1 AND status IN ('dismissed','redeemed')\",[visitor.id]);\n    const blockedOffers = new Set(blockedResult.rows.map(r => r.offer_id));\n    const offer = offers.rows.find(o => !blockedOffers.has(o.id) && matchesRule(o.rule)) || null;"
);

source = source.replace(
  "    await allocator.recordEvent(orderId,'order_created',null,'matching',{experience,serviceCode:service.code,offerCode:offerResult.offer?.code || null},user ? 'user':'visitor',user?.id || visitor.id);",
  "    if (req.body?.sourceOrderId) await pool.query('UPDATE lune_orders SET source_order_id=$2 WHERE id=$1',[orderId,safe(req.body.sourceOrderId,180)]);\n    await allocator.recordEvent(orderId,'order_created',null,'matching',{experience,serviceCode:service.code,offerCode:offerResult.offer?.code || null},user ? 'user':'visitor',user?.id || visitor.id);"
);

source = source.replace(
  'if (!paystack.verifyWebhook(req.body,signature))',
  'if (!paystack.verifyWebhook(req.rawBody || req.body,signature))'
);

const patched = new Module(filename, module);
patched.filename = filename;
patched.paths = module.paths;
patched._compile(source, filename);

module.exports = patched.exports;
