const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Secret JWT (sesuaikan dengan authUtils.js)
const SECRET_KEY = 'your-secret-key-change-in-production';

// =================================================================
// 1. MIDDLEWARE & KONFIGURASI CORS
// =================================================================
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '20mb' })); // import Excel dikirim per batch ratusan baris
// Middleware untuk memantau semua request yang masuk
app.use((req, res, next) => {
  console.log(`🌐 [INCOMING] ${req.method} ${req.url}`);
  next();
});
app.use(express.urlencoded({ extended: true }));

// =================================================================
// 2. KONFIGURASI DATABASE
// =================================================================
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'purchasing_db',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 20000
};

const pool = mysql.createPool(dbConfig);

pool.on('error', (err) => {
  console.error('❌ MySQL Pool Error:', err.code, err.message);
});

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

    // Generate JWT Token
    const token = generateToken(user);
    console.log('[LOGIN] ✓ JWT Token generated');

    console.log(`[LOGIN] ✅ Login BERHASIL! User: ${user.username}, Email: ${user.email}, Role ID: ${user.role_id}\n`);

    return res.status(200).json({
      success: true,
      message: 'Login berhasil!',
      token: token,
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
    const {
      name, code, supplier_code, contact_person, phone, email, address, city, tax_id, status,
      company, address2, address3, state_prov, postal_code, country, alamat_lengkap, currency_id, terms_id
    } = req.body;
    const randomSuffix = Math.floor(Math.random() * 900 + 100);
    const finalCode = supplier_code || code || `SUP-${Date.now().toString().slice(-6)}${randomSuffix}`;

    const [result] = await pool.query(
      `INSERT INTO suppliers
        (supplier_code, name, contact_person, phone, email, address, city, tax_id, status,
         company, address2, address3, state_prov, postal_code, country, alamat_lengkap, currency_id, terms_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalCode, name, contact_person || '', phone || '', email || '', address || '', city || '', tax_id || '', status || 'Active',
        company || '', address2 || '', address3 || '', state_prov || '', postal_code || '', country || '', alamat_lengkap || '', currency_id || '', terms_id || ''
      ]
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
  const {
    name, supplier_code, contact_person, phone, email, address, city, tax_id, status,
    company, address2, address3, state_prov, postal_code, country, alamat_lengkap, currency_id, terms_id
  } = req.body;
  try {
    await pool.query(
      `UPDATE suppliers SET
        supplier_code = ?, name = ?, contact_person = ?, phone = ?, email = ?, address = ?, city = ?, tax_id = ?, status = ?,
        company = ?, address2 = ?, address3 = ?, state_prov = ?, postal_code = ?, country = ?, alamat_lengkap = ?, currency_id = ?, terms_id = ?
       WHERE id = ?`,
      [
        supplier_code, name, contact_person || '', phone || '', email || '', address || '', city || '', tax_id || '', status || 'Active',
        company || '', address2 || '', address3 || '', state_prov || '', postal_code || '', country || '', alamat_lengkap || '', currency_id || '', terms_id || '',
        id
      ]
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
// Kolom tabel purchase_orders (satu baris tabel = satu baris Excel)
const PO_COLUMNS = [
  'main_class', 'class_code', 'product_group', 'sub_category',
  'type', 'pack_slip', 'receipt_date', 'po_number', 'po_line', 'po_rel', 'part',
  'description', 'qty_received', 'uom', 'price', 'amount', 'year',
  'spending_idr', 'spending_usd', 'currency', 'supplier', 'local_import'
];

// receipt_date dikirim sebagai 'YYYY-MM-DD' agar tidak bergeser sehari akibat zona waktu
const PO_SELECT = PO_COLUMNS
  .map((c) => (c === 'receipt_date' ? "DATE_FORMAT(receipt_date, '%Y-%m-%d') AS receipt_date" : c))
  .join(', ');

const poValues = (body) =>
  PO_COLUMNS.map((c) => (body[c] === '' || body[c] === undefined ? null : body[c]));

app.get('/api/purchase-orders', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, ${PO_SELECT} FROM purchase_orders ORDER BY id DESC`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Error GET purchase-orders:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/purchase-orders', async (req, res) => {
  if (!req.body?.po_number) {
    return res.status(400).json({ success: false, message: 'po_number wajib diisi' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO purchase_orders (${PO_COLUMNS.join(', ')}) VALUES (${PO_COLUMNS.map(() => '?').join(', ')})`,
      poValues(req.body)
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('❌ Error POST purchase-orders:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Import massal: satu request = satu batch baris, disimpan dalam satu transaksi (semua atau tidak sama sekali)
app.post('/api/purchase-orders/bulk', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'rows kosong' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ success: false, message: 'Maksimal 2000 baris per request' });
  }

  const valid = rows.filter((r) => r && r.po_number);
  if (valid.length === 0) {
    return res.status(400).json({ success: false, message: 'Tidak ada baris dengan po_number' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO purchase_orders (${PO_COLUMNS.join(', ')}) VALUES ?`,
      [valid.map(poValues)]
    );
    await conn.commit();
    return res.status(201).json({ success: true, inserted: valid.length, skipped: rows.length - valid.length });
  } catch (error) {
    await conn.rollback();
    console.error('❌ Error bulk purchase-orders:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
});

app.put('/api/purchase-orders/:id', async (req, res) => {
  if (!req.body?.po_number) {
    return res.status(400).json({ success: false, message: 'po_number wajib diisi' });
  }
  try {
    const [result] = await pool.query(
      `UPDATE purchase_orders SET ${PO_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...poValues(req.body), req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'PO tidak ditemukan' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Error PUT purchase-orders:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/purchase-orders/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'PO tidak ditemukan' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Error DELETE purchase-orders:', error.message);
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
// Mapping modul (checkbox di frontend) -> tabel & kolom tanggal untuk filter periode.
// 'suppliers' tidak difilter periode karena tabelnya memang tidak punya kolom tanggal.
// 'analytics' diarahkan ke purchase_orders karena tidak ada tabel analytics sendiri.
// ⚠️ 'reports.created_at' adalah asumsi — sesuaikan kalau nama kolom tanggalnya beda.
const CLEAR_DATA_CONFIG = {
  suppliers:      { table: 'suppliers',       dateColumn: null },
  purchaseOrders: { table: 'purchase_orders', dateColumn: 'receipt_date' },
  analytics:      { table: 'purchase_orders', dateColumn: 'receipt_date' },
  report:         { table: 'reports',         dateColumn: 'created_at' },
};

app.delete('/api/system/clear-data', async (req, res) => {
  const { modules, month, year } = req.body;
  if (!modules || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({ success: false, message: 'Pilih minimal satu modul.' });
  }

  const hasMonth = month !== undefined && month !== null && month !== '';
  const hasYear = year !== undefined && year !== null && year !== '';
  const monthNum = hasMonth ? Number(month) : null;
  const yearNum = hasYear ? Number(year) : null;

  if (hasMonth && (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12)) {
    return res.status(400).json({ success: false, message: 'Bulan tidak valid.' });
  }
  if (hasYear && (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100)) {
    return res.status(400).json({ success: false, message: 'Tahun tidak valid.' });
  }
  const useDateFilter = hasMonth && hasYear;

  // Dedupe tabel yang sama (mis. 'analytics' & 'purchaseOrders' sama-sama purchase_orders)
  const seenTables = new Set();
  const targets = [];
  for (const moduleName of modules) {
    const config = CLEAR_DATA_CONFIG[moduleName];
    if (!config || seenTables.has(config.table)) continue;
    seenTables.add(config.table);
    targets.push({ moduleName, ...config });
  }

  if (targets.length === 0) {
    return res.status(400).json({ success: false, message: 'Modul yang dipilih tidak dikenali.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    const deletedSummary = {};

    for (const { moduleName, table, dateColumn } of targets) {
      // Filter tanggal hanya dipakai kalau tabelnya punya kolom tanggal DAN user memang memilih bulan+tahun
      if (useDateFilter && dateColumn) {
        const [result] = await connection.query(
          `DELETE FROM ${table} WHERE MONTH(${dateColumn}) = ? AND YEAR(${dateColumn}) = ?`,
          [monthNum, yearNum]
        );
        deletedSummary[moduleName] = result.affectedRows;
      } else {
        const [result] = await connection.query(`DELETE FROM ${table}`);
        await connection.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
        deletedSummary[moduleName] = result.affectedRows;
      }
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
    return res.status(200).json({
      success: true,
      message: useDateFilter
        ? `Data pada periode ${monthNum}/${yearNum} berhasil dibersihkan dari modul terpilih.`
        : 'Data berhasil dibersihkan.',
      deletedRows: deletedSummary
    });
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
// 12. GLOBAL ERROR HANDLER (menangkap error tak terduga)
// =================================================================
app.use((err, req, res, next) => {
  console.error('🔥 UNCAUGHT ERROR:', err.stack || err.message);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('🔥 UNHANDLED PROMISE REJECTION:', reason);
});

// =================================================================
// 13. JALANKAN SERVER
// =================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Backend berjalan di port ${PORT}`);
  console.log(`📝 SECRET_KEY: ${SECRET_KEY}`);
});