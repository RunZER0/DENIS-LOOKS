const fs = require('fs');

const pages = ['index.html','work.html','inspo.html','favorites.html','standard.html','account.html'];
const redirectPages = ['references.html'];
const scripts = ['experience-v4.js','site-motion.js','public-catalog.js','membership-experience.js'];
const failures = [];

function fail(file, message) { failures.push(`${file}: ${message}`); }

for (const file of [...pages, ...redirectPages]) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of [
    ['Aura Nails Hub', 'legacy Aura brand is user-visible'],
    ['Denis', 'legacy individual-artist identity is user-visible'],
    ['Embu', 'legacy launch geography is user-visible'],
    ['wa.me', 'legacy direct WhatsApp booking remains'],
    ['firebase-service.js', 'legacy Firebase runtime remains on a public page'],
    ['firebasejs', 'legacy Firebase module import remains on a public page']
  ]) if (text.includes(pattern[0])) fail(file, pattern[1]);

  if (!redirectPages.includes(file)) {
    if (!text.includes('<strong>LUNE</strong>')) fail(file, 'missing Lune brand mark');
    if (!text.includes('data-lune-account-link')) fail(file, 'account continuity is missing from primary navigation');
    if (!text.includes('site-motion.js')) fail(file, 'shared motion layer is missing');
  }
}

for (const file of scripts) {
  const text = fs.readFileSync(file, 'utf8');
  for (const term of ['Hi Denis', 'Aura Nails Hub', 'wa.me/']) {
    if (text.includes(term)) fail(file, `legacy user-facing behavior remains: ${term}`);
  }
}

for (const file of ['work.html','inspo.html','favorites.html']) {
  const text = fs.readFileSync(file,'utf8');
  if (!text.includes('public-catalog.js')) fail(file,'live catalog runtime is missing');
  if (text.includes('<script src="app.js"')) fail(file,'legacy Aura application engine is still loaded');
}

const catalog = fs.readFileSync('public-catalog.js','utf8');
if (!catalog.includes("api('/catalog/work')") || !catalog.includes("api('/catalog/inspo')")) fail('public-catalog.js','public discovery is not sourced from the live catalog API');
if (!catalog.includes('lune:taste-changed')) fail('public-catalog.js','live catalog does not refresh taste and Saved surfaces');

const work = fs.readFileSync('work.html', 'utf8');
if (!work.includes('data-dialog-save-work')) fail('work.html', 'work detail does not preserve save continuity');
if (!work.includes('data-dialog-price')) fail('work.html', 'work preview does not disclose price after opening');
const inspo = fs.readFileSync('inspo.html', 'utf8');
if (!inspo.includes('data-dialog-share')) fail('inspo.html', 'inspo detail is not shareable');
if (!inspo.includes('data-dialog-work')) fail('inspo.html', 'inspo does not lead back to finished work');
if (!inspo.includes('data-dialog-price')) fail('inspo.html', 'inspo preview does not disclose a service price');
if (!inspo.includes('data-inspo-mood')) fail('inspo.html', 'inspo does not start from an identity-led direction');
const saved = fs.readFileSync('favorites.html', 'utf8');
if (!saved.includes('taste-recommendations')) fail('favorites.html', 'Saved has no recommendation recovery surface');

const account = fs.readFileSync('account.html', 'utf8');
for (const marker of ['data-account-now-content', 'data-account-offer', 'data-account-orders', 'ACCOUNT DETAILS']) {
  if (!account.includes(marker)) fail('account.html', `account home is missing: ${marker}`);
}
const accountRuntime = fs.readFileSync('account.js', 'utf8');
for (const marker of ['booking.html?reorder=', 'renderDashboard()', 'if (next) location.assign(next)']) {
  if (!accountRuntime.includes(marker)) fail('account.js', `signed-in continuity is missing: ${marker}`);
}
const bookingRuntime = fs.readFileSync('booking.js', 'utf8');
for (const marker of ['offerDiscount(total)', 'Total after offer', 'The total below includes it']) {
  if (!bookingRuntime.includes(marker)) fail('booking.js', `checkout offer transparency is missing: ${marker}`);
}
const orderRuntime = fs.readFileSync('order.js', 'utf8');
if (!orderRuntime.includes('Lune offer applied')) fail('order.js', 'confirmed order does not disclose its applied offer');
const membership = fs.readFileSync('membership-experience.js', 'utf8');
if (membership.includes('10% on selected appointments')) fail('membership-experience.js', 'Circle promises an unconfigured fixed discount');

if (catalog.includes('card-badge-price')) fail('public-catalog.js', 'price is shown before the visitor opens a work preview');
const experience = fs.readFileSync('experience-v4.js', 'utf8');
if (!experience.includes('syncInspoPrice') || !experience.includes('matchesInspoMood')) fail('experience-v4.js', 'inspiration price disclosure or feeling-led filtering is missing');
const motion = fs.readFileSync('site-motion.js', 'utf8');
if (!motion.includes('membership-experience.js')) fail('site-motion.js', 'membership invitation is not available across public discovery pages');
const home = fs.readFileSync('index.html', 'utf8');
const homeEdit = fs.readFileSync('home-edit.js', 'utf8');
if (!home.includes('home-edit.js') || !homeEdit.includes('SET OF THE MONTH')) fail('index.html', 'home highlight does not rotate with the monthly set');

const standard = fs.readFileSync('standard.html', 'utf8');
for (const phrase of ['The part you do not', 'A good base', 'Built around', 'Clean tools.', 'Different artists.']) {
  if (!standard.includes(phrase)) fail('standard.html', `revised Standard copy is missing: ${phrase}`);
}
for (const phrase of ['Care you can', 'It begins<br>with care', 'Care you should never']) {
  if (standard.includes(phrase)) fail('standard.html', `repetitive care-led copy remains: ${phrase}`);
}

const booking = fs.readFileSync('booking.js', 'utf8');
if (!booking.includes('Lune could not load this direction right now')) fail('booking.js', 'temporary catalogue failures are incorrectly presented as a removed look');
const coreStyles = fs.readFileSync('site-v2-core.css', 'utf8');
if (coreStyles.includes('@view-transition')) fail('site-v2-core.css', 'native View Transition conflicts with the Lune page transition');

if (failures.length) {
  console.error(`Lune experience QA failed (${failures.length})`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Lune public experience QA passed');
