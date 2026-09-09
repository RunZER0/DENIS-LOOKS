'use strict';

const assert = require('assert');
const createNotifier = require('./lib/notify');

async function run() {
  const originalKey = process.env.BREVO_API_KEY;
  const originalFrom = process.env.LUNE_EMAIL_FROM;
  const originalFetch = global.fetch;
  let request;
  process.env.BREVO_API_KEY = 'test-brevo-key';
  process.env.LUNE_EMAIL_FROM = 'Lune <bookings@mylune.co.ke>';
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok:true, json:async () => ({ messageId:'test-message' }) };
  };

  try {
    const notifier = createNotifier({ pool:{ query:async () => ({ rows:[] }) }, id:() => 'ntf_test' });
    const result = await notifier.customer({ to:'guest@example.com', subject:'You’re confirmed with Lune', html:'<p>See you soon.</p>' });
    assert.equal(result.status, 'sent');
    assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(request.options.headers['api-key'], 'test-brevo-key');
    const payload = JSON.parse(request.options.body);
    assert.deepEqual(payload.sender, { name:'Lune', email:'bookings@mylune.co.ke' });
    assert.deepEqual(payload.to, [{ email:'guest@example.com' }]);
    assert.equal(payload.htmlContent, '<p>See you soon.</p>');
    console.log('Brevo notifier tests passed');
  } finally {
    if (originalKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.LUNE_EMAIL_FROM; else process.env.LUNE_EMAIL_FROM = originalFrom;
    global.fetch = originalFetch;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
