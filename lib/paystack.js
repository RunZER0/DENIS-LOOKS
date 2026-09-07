'use strict';

const crypto = require('crypto');

const BASE = 'https://api.paystack.co';

function createPaystack() {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  const configured = Boolean(secret);

  function requireConfigured() {
    if (!configured) {
      const err = new Error('paystack_not_configured');
      err.status = 503;
      throw err;
    }
  }

  async function call(path, { method = 'GET', body } = {}) {
    requireConfigured();
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.status === false) {
      const err = new Error(payload?.message || `paystack_${response.status}`);
      err.status = 502;
      err.provider = payload;
      throw err;
    }
    return payload;
  }

  function toSubunit(amountKes) {
    const amount = Number(amountKes);
    if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error('invalid_amount'), { status: 400 });
    return Math.round(amount * 100);
  }

  async function initialize({ email, amountKes, reference, metadata = {}, callbackUrl }) {
    const body = {
      email,
      amount: String(toSubunit(amountKes)),
      currency: 'KES',
      reference,
      metadata: JSON.stringify(metadata)
    };
    if (callbackUrl) body.callback_url = callbackUrl;
    return call('/transaction/initialize', { method: 'POST', body });
  }

  async function verify(reference) {
    return call(`/transaction/verify/${encodeURIComponent(reference)}`);
  }

  async function refund({ reference, amountKes, customerNote, merchantNote }) {
    const body = {
      transaction: reference,
      currency: 'KES'
    };
    if (amountKes != null) body.amount = toSubunit(amountKes);
    if (customerNote) body.customer_note = customerNote;
    if (merchantNote) body.merchant_note = merchantNote;
    return call('/refund', { method: 'POST', body });
  }

  async function transfer({ recipient, amountKes, reference, reason }) {
    return call('/transfer', {
      method: 'POST',
      body: {
        source: 'balance',
        amount: toSubunit(amountKes),
        recipient,
        reference,
        reason: reason || 'Lune partner settlement'
      }
    });
  }

  function verifyWebhook(body, signature) {
    if (!configured || !signature) return false;
    const serialized = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body || {}));
    const expected = crypto.createHmac('sha512', secret).update(serialized).digest('hex');
    const a = Buffer.from(String(expected));
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  return { configured, initialize, verify, refund, transfer, verifyWebhook, toSubunit };
}

module.exports = createPaystack;
