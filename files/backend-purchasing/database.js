const mysql = require('mysql2/promise'); // Gunakan /promise

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'purchasing_db',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test koneksi
(async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Terhubung ke Database MySQL Laragon!');
    connection.release();
  } catch (err) {
    console.error('❌ Database Connection Error:', err.message);
  }
})();

module.exports = db;