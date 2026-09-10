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
    for (const name of files) {
      await pool.query(fs.readFileSync(path.join(directory, name), 'utf8'));
      console.log(`Lune migration ${name} applied`);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
