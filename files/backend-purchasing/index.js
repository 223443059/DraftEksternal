const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Secret Key JWT
const SECRET_KEY = 'your-secret-key-change-in-production';

// =================================================================
// 1. KONEKSI DATABASE (Diubah ke Pool agar tidak putus/crash)
// =================================================================
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

db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Koneksi ke MySQL Laragon Gagal:', err);
  } else {
    console.log('✅ Terhubung ke Database MySQL Laragon!');
    connection.release(); // Lepaskan kembali ke pool setelah test koneksi
  }
});

// Export db untuk digunakan di routes
module.exports = db;

// =================================================================
// 2. AUTH MIDDLEWARE
// =================================================================
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
    },
    SECRET_KEY,
    { expiresIn: '7d' }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (error) {
    return null;
  }
};

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
};

const authorize = (requiredPermissions) => {
  return (req, res, next) => {
    const query = `
      SELECT GROUP_CONCAT(p.name) as permissions
      FROM users u
      LEFT JOIN role_permissions rp ON u.role_id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = ?
      GROUP BY u.id
    `;

    db.query(query, [req.user.id], (err, results) => {
      if (err || !results.length) {
        return res.status(403).json({ message: 'Access denied - no permissions found' });
      }

      const userPermissions = results[0].permissions ? results[0].permissions.split(',') : [];
      const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));

      if (!hasPermission) {
        return res.status(403).json({ 
          message: 'Insufficient permissions',
          required: requiredPermissions,
          has: userPermissions 
        });
      }

      next();
    });
  };
};

// =================================================================
// 3. TEST ROUTES
// =================================================================
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running' });
});

// =================================================================
// 4. IMPORT & MOUNT USERS ROUTER
// =================================================================
const usersRouter = require('./routes/users');
app.use('/api/users', usersRouter);

// =================================================================
// 5. SYSTEM ROUTES (Diperbaiki)
// =================================================================
app.delete('/api/system/clear-data', authenticate, async (req, res) => {
  try {
    const promiseDb = db.promise();

    // Nonaktifkan foreign key checks sementara
    await promiseDb.query('SET FOREIGN_KEY_CHECKS = 0');

    // MENGGUNAKAN DELETE FROM BUKAN TRUNCATE
    // Truncate seringkali ditolak oleh InnoDB jika ada Foreign Key
    await promiseDb.query('DELETE FROM suppliers');
    await promiseDb.query('DELETE FROM purchase_orders');
    await promiseDb.query('DELETE FROM market_prices');

    // (Opsional) Reset ID auto-increment kembali ke 1 layaknya efek Truncate
    await promiseDb.query('ALTER TABLE suppliers AUTO_INCREMENT = 1');
    await promiseDb.query('ALTER TABLE purchase_orders AUTO_INCREMENT = 1');
    await promiseDb.query('ALTER TABLE market_prices AUTO_INCREMENT = 1');

    // Aktifkan kembali foreign key checks
    await promiseDb.query('SET FOREIGN_KEY_CHECKS = 1');

    return res.status(200).json({
      success: true,
      message: 'Data operasional berhasil dibersihkan'
    });
  } catch (err) {
    // Tambahkan catch error handling di sini agar backend tidak crash
    db.promise().query('SET FOREIGN_KEY_CHECKS = 1').catch((e) => console.error("Gagal mereset FK:", e));
    
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus data: ' + err.message
    });
  }
});

// =================================================================
// 6. LEGACY ROUTE - BACKWARD COMPATIBILITY
// =================================================================
app.post('/api/login', (req, res) => {
  const { username, email, password } = req.body;
  
  const loginIdentifier = username || email; 

  const sql = `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE (u.username = ? OR u.email = ?) AND u.status = 'active'`;

  db.query(sql, [loginIdentifier, loginIdentifier], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: 'Username atau password salah / akun tidak aktif' });
    
    const user = results[0];
    
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (!isMatch) return res.status(401).json({ error: 'Username atau password salah' });
      
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role_name, roleId: user.role_id },
        SECRET_KEY,
        { expiresIn: '24h' }
      );
      
      res.json({ success: true, message: 'Login berhasil', token, user: { id: user.id, username: user.username, email: user.email, role: user.role_name }});
    });
  });
});

app.get('/api/users-legacy', authenticate, (req, res) => {
  const sql = `SELECT u.id, u.username, u.email, u.status, u.role_id, r.name as role FROM users u JOIN roles r ON u.role_id = r.id`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// =================================================================
// 7. START SERVER
// =================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server Backend berjalan di http://localhost:${PORT}`);
  console.log(`📝 Endpoint login: http://localhost:${PORT}/api/login`);
});