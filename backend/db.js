require('dotenv').config();
const { Pool } = require('pg');

console.log('URL host:', process.env.DATABASE_URL?.split('@').pop());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW()')
  .then((r) => console.log('DB connected:', r.rows[0].now))
  .catch((e) => {
    console.error('DB error code:', e.code);
    console.error('DB error message:', e.message);
    if (e.errors) e.errors.forEach((x) => console.error(' -', x.code, x.address, x.port));
  });

module.exports = pool;