const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.STASHI_DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL (or STASHI_DATABASE_URL) is required.');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists lune_schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort();

    for (const name of files) {
      const exists = await client.query(
        'select 1 from lune_schema_migrations where name = $1',
        [name]
      );
      if (exists.rowCount) continue;

      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      console.log(`Applying ${name}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into lune_schema_migrations (name) values ($1)',
          [name]
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log('Lune database migrations are current.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
