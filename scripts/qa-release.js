'use strict';

const fs=require('fs');
const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');

const server=read('server-v2.js');
const loader=read('lune-ops-loader.js');
const render=read('render.yaml');
const build=read('build-env.js');
const fixes=read('site-v2-fixes.css');
const bookingLinks=read('booking-links.js');
const partner=read('partner.html');
const admin=read('admin.html');
const motion=read('site-motion.js');

assert(server.includes("require('./lune-ops-loader')"),'production server must use hardened ops loader');
assert(server.includes('req.rawBody = Buffer.from(buf)'),'Paystack webhook raw body must be preserved');
assert(server.includes('PRIVATE_PATHS'),'server source and migrations must not be publicly served');
assert(loader.includes("require('./release-ops')"),'release operations must be installed');
assert(loader.includes('blockedOffers'),'dismissed offers must remain dismissed');
assert(loader.includes('source_order_id'),'reorders must retain lineage');
assert(/env:\s*node/.test(render),'Render must deploy a Node service');
assert(!build.includes('PAYSTACK_SECRET_KEY'),'build step must not export Paystack secrets');
assert(fixes.includes("content:'LUNE'"),'page transition must carry Lune branding');
assert(bookingLinks.includes('booking.html'),'discovery surfaces must connect to booking');
assert(partner.includes('data-request-list')&&partner.includes('data-capacity-form'),'partner operations surface missing');
assert(admin.includes('data-admin-orders')&&admin.includes('data-payout-list'),'admin operations surface missing');
assert(motion.includes('lune-data.js')&&motion.includes('booking-links.js'),'public continuity scripts must load globally');

for(const page of ['index.html','work.html','inspo.html','favorites.html','standard.html','account.html','booking.html','order.html']){
  const html=read(page);
  assert(/LUNE|Lune/.test(html),`${page} must be Lune branded`);
  assert(!/wa\.me/i.test(html),`${page} must not bypass Lune through WhatsApp`);
}

console.log('Lune release QA passed.');
