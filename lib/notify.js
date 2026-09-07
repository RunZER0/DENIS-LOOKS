'use strict';

function createNotifier({ pool, id }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.LUNE_EMAIL_FROM || 'Lune <bookings@lune.co.ke>';
  const configured = Boolean(apiKey);

  async function deliverEmail({ to, subject, html }) {
    if (!configured) return { status: 'skipped', reason: 'email_not_configured' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(payload?.message || `email_${response.status}`);
    return { status: 'sent', payload };
  }

  async function partner({ partnerId, locationId, orderId, allocationId, to, type, subject, html }) {
    const notificationId = id('ntf');
    await pool.query(`INSERT INTO lune_partner_notifications
      (id,partner_id,location_id,order_id,allocation_id,channel,type,recipient,status)
      VALUES ($1,$2,$3,$4,$5,'email',$6,$7,'queued')`,
      [notificationId, partnerId || null, locationId || null, orderId || null, allocationId || null, type, to || null]);
    if (!to) {
      await pool.query(`UPDATE lune_partner_notifications SET status='skipped',last_error='recipient_missing',attempts=1 WHERE id=$1`, [notificationId]);
      return { status: 'skipped' };
    }
    try {
      const result = await deliverEmail({ to, subject, html });
      await pool.query(`UPDATE lune_partner_notifications SET status=$2,attempts=attempts+1,sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END,last_error=$3 WHERE id=$1`,
        [notificationId, result.status, result.reason || null]);
      return result;
    } catch (err) {
      await pool.query(`UPDATE lune_partner_notifications SET status='failed',attempts=attempts+1,last_error=$2 WHERE id=$1`, [notificationId, String(err.message).slice(0,500)]);
      return { status: 'failed', error: err.message };
    }
  }

  async function customer({ to, subject, html }) {
    if (!to) return { status: 'skipped' };
    try { return await deliverEmail({ to, subject, html }); }
    catch (err) { console.error('[lune-email]', err.message); return { status: 'failed', error: err.message }; }
  }

  return { configured, partner, customer };
}

module.exports = createNotifier;
