const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { generateToken, authenticate, authorize } = require('../authUtils');

// ============================================
// PUBLIC ROUTES - NO AUTH REQUIRED
// ============================================

// LOGIN
router.post('/login', async (req, res) => {
  console.log(`[BACKEND] Menerima request login untuk: ${req.body.email}`);
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('[BACKEND] Gagal: Email/Username atau password kosong');
      return res.status(400).json({ message: 'Email/Username and password are required' });
    }

    // ✅ FIXED: Query yang lebih jelas
    // Cari user berdasarkan email ATAU username (user bisa login dengan salah satu)
    const query = 'SELECT * FROM users WHERE email = ? OR username = ?';
    const loginInput = email; // Bisa berupa email atau username
    
    console.log(`[BACKEND] Mencari user dengan: email='${loginInput}' OR username='${loginInput}'`);
    
    // ✅ FIXED: Kirim parameter yang benar
    const [results] = await db.query(query, [loginInput, loginInput]);

    console.log(`[BACKEND] Hasil query: ${results ? results.length + ' row(s)' : '0 rows'}`);

    if (!results || results.length === 0) {
      console.log(`[BACKEND] ❌ Gagal: User '${loginInput}' tidak ditemukan di database`);
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    const user = results[0];
    console.log(`[BACKEND] ✓ User ditemukan: ${user.username} (ID: ${user.id}, Role: ${user.role_id})`);
    
    // ✅ FIXED: Lebih verbose password checking
    console.log(`[BACKEND] Mencocokkan password...`);
    const passwordMatch = bcrypt.compareSync(password, user.password);

    if (!passwordMatch) {
      console.log(`[BACKEND] ❌ Gagal: Password salah untuk user '${user.username}'`);
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    console.log(`[BACKEND] ✓ Password cocok!`);

    // Generate Token
    const token = generateToken(user);
    console.log(`[BACKEND] ✓ Token generated untuk user: ${user.username}`);
    console.log(`[BACKEND] ✅ Login Berhasil! User: ${user.username}, Email: ${user.email}, Role ID: ${user.role_id}`);
    
    return res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role_id: user.role_id
      }
    });

  } catch (error) {
    console.error('[BACKEND] ❌ ERROR CATCH LOGIN:', error.message);
    console.error('[BACKEND] Stack:', error.stack);
    return res.status(500).json({ 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

// ============================================
// SETUP ADMIN - NO AUTH REQUIRED (untuk development)
// ============================================
router.post('/setup-admin', async (req, res) => {
  try {
    const email = 'admin@detmoldpackaging.com';
    const username = 'admin';
    const password = 'Kanayakan_21';
    const hashedPassword = bcrypt.hashSync(password, 10);

    const [results] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    
    if (results.length > 0) {
      return res.status(400).json({ 
        success: false, message: 'Admin user already exists', email: email 
      });
    }

    const [result] = await db.query(
      'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, 1)',
      [username, email, hashedPassword]
    );

    res.status(201).json({ 
      success: true, message: 'Admin user created successfully!',
      username: username, email: email, password: password, userId: result.insertId,
      warning: '⚠️ Change this password immediately in production!'
    });
  } catch (error) {
    console.error('Setup Admin Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// PROTECTED ROUTES - REQUIRE AUTH
// ============================================

// Get user profile dengan permissions
router.get('/profile', authenticate, async (req, res) => {
  try {
    console.log(`[BACKEND] Fetching profile untuk user ID: ${req.user.id}`);
    
    const query = `
      SELECT u.id, u.email, u.username, u.role_id, r.name as role, GROUP_CONCAT(p.name) as permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN role_permissions rp ON u.role_id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = ?
      GROUP BY u.id
    `;

    const [results] = await db.query(query, [req.user.id]);
    
    if (!results || results.length === 0) {
      console.log(`[BACKEND] User ID ${req.user.id} not found in profile query`);
      return res.status(404).json({ message: 'User not found' });
    }

    const user = results[0];
    console.log(`[BACKEND] ✓ Profile loaded: ${user.username}, Role: ${user.role}`);
    
    res.json({
      success: true,
      user: {
        id: user.id, 
        email: user.email, 
        username: user.username,
        role_id: user.role_id, 
        role: user.role
      },
      permissions: user.permissions ? user.permissions.split(',').map(p => p.trim()) : []
    });
  } catch (err) {
    console.error('Profile Error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ============================================
// USER MANAGEMENT ROUTES - SUPER ADMIN ONLY
// ============================================

router.get('/all', authenticate, authorize(['manage_users']), async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, u.email, u.created_at, r.name as role
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `;
    const [results] = await db.query(query);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ message: 'Database error' });
  }
});

router.post('/create', authenticate, authorize(['manage_users']), async (req, res) => {
  try {
    const { username, email, password, role_id } = req.body;
    if (!username || !email || !password || !role_id) {
      return res.status(400).json({ message: 'Semua field harus diisi' });
    }

    const [results] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (results.length > 0) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role_id]
    );

    res.status(201).json({ success: true, message: 'User created successfully', userId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Database error' });
  }
});

router.put('/update-role', authenticate, authorize(['manage_users']), async (req, res) => {
  try {
    const { userId, role_id } = req.body;
    await db.query('UPDATE users SET role_id = ? WHERE id = ?', [role_id, userId]);
    res.json({ success: true, message: 'User role updated' });
  } catch (err) {
    res.status(500).json({ message: 'Database error' });
  }
});

router.put('/reset-password', authenticate, authorize(['manage_users']), async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Database error' });
  }
});

router.delete('/delete', authenticate, authorize(['manage_users']), async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.body.userId]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Database error' });
  }
});

module.exports = router;