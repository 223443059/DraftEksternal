const express = require('express');
const cors = require('cors');
<<<<<<< Updated upstream
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
=======
// UBAH: Gunakan bcryptjs agar konsisten dengan routes/users.js Anda
const bcrypt = require('bcryptjs'); 
>>>>>>> Stashed changes
const jwt = require('jsonwebtoken');

const app = express();

// Secret JWT (sesuaikan dengan authUtils.js)
const SECRET_KEY = 'your-secret-key-change-in-production';

// =================================================================
// 1. MIDDLEWARE
// =================================================================
app.use(cors({
<<<<<<< Updated upstream
  origin: true,
  credentials: true
=======
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://idws-n26010:5173', // TAMBAHKAN INI: Huruf kecil sesuai yang dibaca browser
    'http://IDWS-N26010:5173', // Biarkan huruf besar untuk jaga-jaga
    'http://10.62.11.106:5173',
    'http://idws-n26010.internal.detmold.com.au:5173',
    'http://IDWS-N26010.internal.detmold.com.au:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
>>>>>>> Stashed changes
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

<<<<<<< Updated upstream
=======
// ... (Sisa kode ke bawah tidak perlu diubah, sudah benar) ...
// Secret Key JWT
const SECRET_KEY = 'your-secret-key-change-in-production';

>>>>>>> Stashed changes
// =================================================================
// 2. KONFIGURASI DATABASE
// =================================================================
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'purchasing_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// =================================================================
// 3. HELPER FUNCTIONS
// =================================================================

// Generate JWT Token
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

// Middleware: Verify Token
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// =================================================================
// 4. ROUTE TESTING
// =================================================================
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Server Backend berjalan lancar!' });
});

// =================================================================
// 5. ENDPOINT USER MANAGEMENT & AUTH
// =================================================================

// LOGIN - FIXED VERSION WITH REAL JWT
app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log(`\n[LOGIN] Menerima request untuk: ${email}`);

  if (!email || !password) {
    console.log('[LOGIN] ❌ Email/Password kosong');
    return res.status(400).json({ success: false, message: 'Email/Username dan password wajib diisi.' });
  }

  try {
    // Query: cari user by email OR username dengan status active
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE (email = ? OR username = ?) AND status = "active"',
      [email, email]
    );

    console.log(`[LOGIN] Query result: ${rows.length} row(s) found`);

    if (rows.length === 0) {
      console.log(`[LOGIN] ❌ User '${email}' not found or inactive`);
      return res.status(401).json({ success: false, message: 'Email/Username atau password salah.' });
    }

    const user = rows[0];
    console.log(`[LOGIN] ✓ User found: ${user.username} (ID: ${user.id}, Role ID: ${user.role_id})`);

    // Verify password
    console.log('[LOGIN] Verifying password...');
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(`[LOGIN] ❌ Password mismatch for ${user.username}`);
      return res.status(401).json({ success: false, message: 'Email/Username atau password salah.' });
    }

    console.log('[LOGIN] ✓ Password valid!');

    // Generate JWT Token (REAL, not dummy!)
    const token = generateToken(user);
    console.log('[LOGIN] ✓ JWT Token generated');

    console.log(`[LOGIN] ✅ Login BERHASIL! User: ${user.username}, Email: ${user.email}, Role ID: ${user.role_id}\n`);

    return res.status(200).json({
      success: true,
      message: 'Login berhasil!',
      token: token,  // ✅ REAL JWT TOKEN (not dummy!)
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role_id: user.role_id 
      }
    });

  } catch (error) {
    console.error('[LOGIN] ❌ Error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET USER PROFILE - WITH TOKEN VERIFICATION
app.get('/api/users/profile', authenticate, async (req, res) => {
  try {
    console.log(`[PROFILE] Fetching profile for user ID: ${req.user.id}`);

    const [rows] = await pool.query(`
      SELECT u.id, u.username, u.email, u.role_id, u.status, r.name as role, GROUP_CONCAT(p.name) as permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN role_permissions rp ON u.role_id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = ? AND u.status = "active"
      GROUP BY u.id
    `, [req.user.id]);

    if (rows.length === 0) {
      console.log(`[PROFILE] ❌ User ID ${req.user.id} not found`);
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    const user = rows[0];
    const permissions = user.permissions ? user.permissions.split(',').map(p => p.trim()) : [];
    
    console.log(`[PROFILE] ✓ Profile loaded: ${user.username}, Role: ${user.role}`);

    return res.status(200).json({
      success: true,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role_id: user.role_id,
        role: user.role
      },
      permissions: permissions
    });
  } catch (error) {
    console.error('[PROFILE] Error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET ALL USERS
app.get('/api/users/all', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, username, email, role_id, IF(role_id = 1, 'Admin', 'User') AS role FROM users");
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// CREATE USER
app.post('/api/users/create', authenticate, async (req, res) => {
  const { username, email, password, role_id } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, email, password, role_id, status) VALUES (?, ?, ?, ?, "active")', [username, email, hashedPassword, role_id || 2]);
    return res.status(200).json({ success: true, message: 'User berhasil dibuat!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// UPDATE ROLE
app.put('/api/users/update-role', authenticate, async (req, res) => {
  const { userId, role_id } = req.body;
  try {
    await pool.query('UPDATE users SET role_id = ? WHERE id = ?', [role_id, userId]);
    return res.status(200).json({ success: true, message: 'Role berhasil diperbarui!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// RESET PASSWORD
app.put('/api/users/reset-password', authenticate, async (req, res) => {
  const { userId, newPassword } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    return res.status(200).json({ success: true, message: 'Password berhasil direset!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE USER
app.delete('/api/users/delete', authenticate, async (req, res) => {
  const { userId } = req.body;
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return res.status(200).json({ success: true, message: 'User berhasil dihapus!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 6. ENDPOINT SUPPLIERS
// =================================================================
app.get('/api/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY id DESC');
    return res.status(200).json(rows);
  } catch (error) {
    console.error('❌ Error Get Suppliers:', error.message);
    return res.status(200).json([]);
  }
});

app.post('/api/suppliers', async (req, res) => {
  console.log('📥 DATA SUPPLIER DITERIMA:', req.body);
  try {
    const { name, code, supplier_code, contact_person, phone, email, address, city, tax_id, status } = req.body;
    const randomSuffix = Math.floor(Math.random() * 900 + 100);
    const finalCode = supplier_code || code || `SUP-${Date.now().toString().slice(-6)}${randomSuffix}`;

    const [result] = await pool.query(
      'INSERT INTO suppliers (supplier_code, name, contact_person, phone, email, address, city, tax_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [finalCode, name, contact_person || '', phone || '', email || '', address || '', city || '', tax_id || '', status || 'Active']
    );

    console.log('✅ SUPPLIER BERHASIL DISIMPAN ID:', result.insertId);
    return res.status(201).json({ success: true, id: result.insertId, message: 'Supplier berhasil disimpan!' });
  } catch (error) {
    console.error('❌ Error Insert Supplier:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, supplier_code, contact_person, phone, email, address, city, tax_id, status } = req.body;
  try {
    await pool.query(
      'UPDATE suppliers SET supplier_code = ?, name = ?, contact_person = ?, phone = ?, email = ?, address = ?, city = ?, tax_id = ?, status = ? WHERE id = ?',
      [supplier_code, name, contact_person || '', phone || '', email || '', address || '', city || '', tax_id || '', status || 'Active', id]
    );
    console.log('✅ SUPPLIER BERHASIL DIUPDATE ID:', id);
    return res.status(200).json({ success: true, message: 'Supplier berhasil diupdate!' });
  } catch (error) {
    console.error('❌ Error Update Supplier:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
    console.log('✅ SUPPLIER BERHASIL DIHAPUS ID:', id);
    return res.status(200).json({ success: true, message: 'Supplier berhasil dihapus!' });
  } catch (error) {
    console.error('❌ Error Delete Supplier:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 7. ENDPOINT PURCHASE ORDERS
// =================================================================
// 1. GET: Ambil Data Purchase Orders beserta Nama Supplier
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT po.*, s.name AS supplier_name 
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      ORDER BY po.id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders', async (req, res) => {
  const { po_no, supplier_id, category, description, total_amount, order_status, order_date } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO purchase_orders (po_no, supplier_id, category, description, total_amount, order_status, order_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [po_no, supplier_id || null, category || 'Raw Material', description || '', total_amount || 0, order_status || 'Pending', order_date || new Date()]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 8. ENDPOINT SUPPLIER EVALUATIONS
// =================================================================
app.get('/api/supplier-evaluations', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT se.*, s.name AS supplier_name
      FROM supplier_evaluations se
      LEFT JOIN suppliers s ON se.supplier_id = s.id
      ORDER BY se.id DESC
    `);
    return res.status(200).json(rows);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/supplier-evaluations', async (req, res) => {
  const { supplier_id, weighted_score, rating_tier, evaluation_date, quality, delivery_on_time, cost_pricing, responsiveness_service, compliance_risk, sustainability } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO supplier_evaluations 
       (supplier_id, weighted_score, rating_tier, evaluation_date, quality, delivery_on_time, cost_pricing, responsiveness_service, compliance_risk, sustainability) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplier_id, weighted_score || 0, rating_tier || 'Unrated', evaluation_date || new Date(), quality || 0, delivery_on_time || 0, cost_pricing || 0, responsiveness_service || 0, compliance_risk || 0, sustainability || 0]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/supplier-evaluations/clear', async (req, res) => {
  const { period } = req.body;
  try {
    let query = 'DELETE FROM supplier_evaluations';
    if (period === 'today') {
      query += ' WHERE DATE(evaluation_date) = DATE(NOW())';
    } else if (period === 'month') {
      query += ' WHERE YEAR(evaluation_date) = YEAR(NOW()) AND MONTH(evaluation_date) = MONTH(NOW())';
    } else if (period === 'year') {
      query += ' WHERE YEAR(evaluation_date) = YEAR(NOW())';
    } else if (period !== 'all') {
      return res.status(400).json({ message: "Periode tidak valid." });
    }

    const [result] = await pool.query(query);
    if (period === 'all') {
      await pool.query("ALTER TABLE supplier_evaluations AUTO_INCREMENT = 1");
    }

    res.status(200).json({ 
      success: true,
      message: `${result.affectedRows} baris data berhasil dihapus.`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 9. ENDPOINT MARKET PRICES & OTD PERFORMANCE
// =================================================================
app.get('/api/market-prices', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM market_prices ORDER BY recorded_date DESC');
    return res.status(200).json(rows);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/market-prices', async (req, res) => {
  try {
    const { item_name, price, unit, change_percent, recorded_date } = req.body;
    const [result] = await pool.query(
      'INSERT INTO market_prices (item_name, price, unit, change_percent, recorded_date) VALUES (?, ?, ?, ?, ?)',
      [item_name, price, unit || 'USD / MT', change_percent || 0, recorded_date || new Date()]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/otd-performance', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM otd_performance ORDER BY id DESC');
    return res.status(200).json(rows);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/otd-performance', async (req, res) => {
  try {
    const { po_number, supplier_name, category, delivery_status, cycle_time_days, spend_impact, record_date } = req.body;
    const [result] = await pool.query(
      'INSERT INTO otd_performance (po_number, supplier_name, category, delivery_status, cycle_time_days, spend_impact, record_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [po_number, supplier_name, category, delivery_status || 'On-Time', cycle_time_days || 0, spend_impact || 0, record_date || new Date()]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 10. ENDPOINT DASHBOARD, ANALYTICS & REPORTS
// =================================================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [[{ totalSuppliers }]] = await pool.query('SELECT COUNT(*) AS totalSuppliers FROM suppliers');
    const [[{ totalPOs }]] = await pool.query('SELECT COUNT(*) AS totalPOs FROM purchase_orders');
    const [[{ totalSpend }]] = await pool.query('SELECT COALESCE(SUM(total_amount), 0) AS totalSpend FROM purchase_orders');
    const [[{ pendingPOs }]] = await pool.query('SELECT COUNT(*) AS pendingPOs FROM purchase_orders WHERE order_status = "Pending"');

    const [recentPOs] = await pool.query(`
      SELECT po.id, po.po_no, po.total_amount, po.order_status, po.order_date, s.name AS supplier_name 
      FROM purchase_orders po 
      LEFT JOIN suppliers s ON po.supplier_id = s.id 
      ORDER BY po.id DESC LIMIT 5
    `);

    return res.status(200).json({
      success: true,
      stats: { totalSuppliers, totalPOs, totalSpend, pendingPOs },
      recentPOs
    });
  } catch (error) {
    console.error('❌ Error Dashboard:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    const [topSuppliers] = await pool.query(`
      SELECT s.name AS supplier_name, COUNT(po.id) AS total_orders, COALESCE(SUM(po.total_amount), 0) AS total_spent
      FROM suppliers s
      LEFT JOIN purchase_orders po ON s.id = po.supplier_id
      GROUP BY s.id
      ORDER BY total_spent DESC
      LIMIT 10
    `);

    const [poStatusDist] = await pool.query(`
      SELECT order_status AS status, COUNT(*) AS count 
      FROM purchase_orders 
      GROUP BY order_status
    `);

    return res.status(200).json({ success: true, topSuppliers, poStatusDist });
  } catch (error) {
    console.error('❌ Error Analytics:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const [reportData] = await pool.query(`
      SELECT 
        po.id AS po_id,
        po.po_no,
        s.name AS supplier_name,
        po.category,
        po.total_amount,
        po.order_status AS status,
        po.order_date
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      ORDER BY po.order_date DESC
    `);

    return res.status(200).json({ success: true, data: reportData });
  } catch (error) {
    console.error('❌ Error Reports:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. POST: Simpan Riwayat Export ke Tabel 'reports'
app.post('/api/reports', async (req, res) => {
  const { report_name, generated_by, file_path } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO reports (report_name, generated_by, file_path) VALUES (?, ?, ?)',
      [report_name, generated_by, file_path]
    );
    res.status(201).json({ message: 'Report berhasil dicatat ke database', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================================================================
// 11. ENDPOINT CLEAR DATA OPERASIONAL
// =================================================================
app.delete('/api/system/clear-data', async (req, res) => {
  const { modules } = req.body;
  if (!modules || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({ success: false, message: 'Pilih minimal satu modul.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    const deletedSummary = {};

    for (const moduleName of modules) {
      if (moduleName === 'suppliers') {
        const [resSupp] = await connection.query('DELETE FROM suppliers');
        await connection.query('ALTER TABLE suppliers AUTO_INCREMENT = 1');
        deletedSummary.suppliers = resSupp.affectedRows;
      } else if (moduleName === 'purchaseOrders') {
        const [resPO] = await connection.query('DELETE FROM purchase_orders');
        await connection.query('ALTER TABLE purchase_orders AUTO_INCREMENT = 1');
        deletedSummary.purchaseOrders = resPO.affectedRows;
      }
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
    return res.status(200).json({ success: true, message: 'Data berhasil dibersihkan.', deletedRows: deletedSummary });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    console.error('❌ Error Clear Data:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// =================================================================
// 12. JALANKAN SERVER
// =================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Backend berjalan di port ${PORT}`);
  console.log(`📝 SECRET_KEY: ${SECRET_KEY}`);
});