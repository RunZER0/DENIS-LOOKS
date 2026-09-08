'use strict';

module.exports = function installLaunchOps(app,{pool,requireDb,sessionUser}) {
  const adminEmails = new Set(String(process.env.LUNE_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

  async function user(req) {
    const base = await sessionUser(req);
    if (!base) return null;
    const {rows} = await pool.query('SELECT id,email,role FROM lune_users WHERE id=$1 LIMIT 1',[base.id]);
    return rows[0] || null;
  }

  async function requireAdmin(req) {
    const current = await user(req);
    if (!current) throw Object.assign(new Error('authentication_required'),{status:401});
    if (current.role !== 'admin' && !adminEmails.has(String(current.email).toLowerCase())) throw Object.assign(new Error('admin_required'),{status:403});
    return current;
  }

  async function partnerIds(req) {
    const current = await user(req);
    if (!current) throw Object.assign(new Error('authentication_required'),{status:401});
    const isAdmin = current.role === 'admin' || adminEmails.has(String(current.email).toLowerCase());
    const {rows} = await pool.query(`SELECT partner_id FROM lune_partner_members WHERE user_id=$1 AND status='active'`,[current.id]);
    if (!rows.length && !isAdmin) throw Object.assign(new Error('partner_access_required'),{status:403});
    return {current,isAdmin,ids:rows.map(r=>r.partner_id)};
  }

  app.get(['/app.js','/release-ops.js','/launch-ops.js'],(_req,res)=>res.status(404).end());

  app.get('/api/partner/technicians',requireDb,asyncRoute(async(req,res)=>{
    const ctx = await partnerIds(req);
    if (!ctx.ids.length) return res.json({technicians:[]});
    const {rows} = await pool.query(`SELECT t.id,t.partner_id,t.location_id,t.name,t.status,t.quality_score,l.name AS location_name,
      COALESCE(array_agg(c.capability ORDER BY c.capability) FILTER (WHERE c.capability IS NOT NULL),ARRAY[]::text[]) AS capabilities
      FROM lune_technicians t
      LEFT JOIN lune_partner_locations l ON l.id=t.location_id
      LEFT JOIN lune_technician_capabilities c ON c.technician_id=t.id
      WHERE t.partner_id=ANY($1::text[]) AND t.status='active'
      GROUP BY t.id,l.name ORDER BY t.name`,[ctx.ids]);
    res.json({technicians:rows});
  }));

  app.get('/api/admin/audit',requireDb,asyncRoute(async(req,res)=>{
    await requireAdmin(req);
    const {rows} = await pool.query(`SELECT a.id,a.action,a.object_type,a.object_id,a.metadata,a.created_at,u.email AS actor_email
      FROM lune_admin_audit a LEFT JOIN lune_users u ON u.id=a.user_id
      ORDER BY a.created_at DESC LIMIT 250`);
    res.json({audit:rows});
  }));
};
