const fs = require('fs');

const pages = ['index.html','work.html','inspo.html','favorites.html','standard.html','account.html'];
const redirectPages = ['references.html'];
const scripts = ['experience-v4.js','site-motion.js','public-catalog.js'];
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
const inspo = fs.readFileSync('inspo.html', 'utf8');
if (!inspo.includes('data-dialog-share')) fail('inspo.html', 'inspo detail is not shareable');
if (!inspo.includes('data-dialog-work')) fail('inspo.html', 'inspo does not lead back to finished work');
const saved = fs.readFileSync('favorites.html', 'utf8');
if (!saved.includes('taste-recommendations')) fail('favorites.html', 'Saved has no recommendation recovery surface');

if (failures.length) {
  console.error(`Lune experience QA failed (${failures.length})`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Lune public experience QA passed');
