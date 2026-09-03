const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'purchasing_db',
  port: 3306
});

db.connect((err) => {
  if (err) {
    console.error('❌ Koneksi ke MySQL Laragon Gagal:', err);
  } else {
    console.log('✅ Terhubung ke Database MySQL Laragon!');
  }
});

module.exports = db;