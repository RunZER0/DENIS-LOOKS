const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

(async () => {
  try {
    const file = path.join(__dirname, '..', 'migrations', '001_lune_identity_and_persistence.sql');
    const sql = fs.readFileSync(file, 'utf8');
    await pool.query(sql);
    console.log('Lune migration 001 applied');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
