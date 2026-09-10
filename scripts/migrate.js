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
    const directory = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(directory).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
    await pool.query('CREATE TABLE IF NOT EXISTS lune_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows: legacyRows } = await pool.query("SELECT to_regclass('lune_users') AS users_table");
    if (legacyRows[0]?.users_table) {
      await pool.query("INSERT INTO lune_schema_migrations (name) VALUES ('001_lune_identity_and_persistence.sql'),('002_lune_operations.sql'),('003_lune_order_access.sql') ON CONFLICT (name) DO NOTHING");
    }
    for (const name of files) {
      const { rowCount } = await pool.query('SELECT 1 FROM lune_schema_migrations WHERE name=$1', [name]);
      if (rowCount) continue;
      await pool.query(fs.readFileSync(path.join(directory, name), 'utf8'));
      await pool.query('INSERT INTO lune_schema_migrations (name) VALUES ($1)', [name]);
      console.log(`Lune migration ${name} applied`);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
