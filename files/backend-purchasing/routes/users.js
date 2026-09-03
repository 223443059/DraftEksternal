const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { generateToken, authenticate, authorize } = require('../authUtils');

// ============================================
// PUBLIC ROUTES - NO AUTH REQUIRED
// ============================================

// LOGIN
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    if (!results.length) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = results[0];
    const passwordMatch = bcrypt.compareSync(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);
    res.json({
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
  });
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

    // Cek apakah admin sudah ada
    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err });
      }

      if (results.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Admin user already exists',
          email: email 
        });
      }

      // Insert admin user
      db.query(
        'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, 1)',
        [username, email, hashedPassword],
        (err, result) => {
          if (err) {
            return res.status(500).json({ message: 'Failed to create admin', error: err });
          }

          res.status(201).json({ 
            success: true,
            message: 'Admin user created successfully!',
            username: username,
            email: email,
            password: password,
            userId: result.insertId,
            warning: '⚠️ Change this password immediately in production!'
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// PROTECTED ROUTES - REQUIRE AUTH
// ============================================

// Get user profile dengan permissions
router.get('/profile', authenticate, (req, res) => {
  const query = `
    SELECT u.id, u.email, u.username, u.role_id, r.name as role, GROUP_CONCAT(p.name) as permissions
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN role_permissions rp ON u.role_id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
    WHERE u.id = ?
    GROUP BY u.id
  `;

  db.query(query, [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    
    if (!results.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = results[0];
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
  });
});

// ============================================
// USER MANAGEMENT ROUTES - SUPER ADMIN ONLY
// ============================================

// Get all users - super admin only
router.get('/all', authenticate, authorize(['manage_users']), (req, res) => {
  const query = `
    SELECT u.id, u.username, u.email, u.created_at, r.name as role
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ success: true, data: results });
  });
});

// Create user - super admin only
router.post('/create', authenticate, authorize(['manage_users']), (req, res) => {
  const { username, email, password, role_id } = req.body;

  if (!username || !email || !password || !role_id) {
    return res.status(400).json({ message: 'Username, email, password, and role are required' });
  }

  // Check if email or username already exists
  db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    
    if (results.length > 0) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const query = 'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)';

    db.query(query, [username, email, hashedPassword, role_id], (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err });
      }

      res.status(201).json({ 
        success: true, 
        message: 'User created successfully',
        userId: result.insertId 
      });
    });
  });
});

// Update user role - super admin only
router.put('/update-role', authenticate, authorize(['manage_users']), (req, res) => {
  const { userId, role_id } = req.body;

  if (!userId || !role_id) {
    return res.status(400).json({ message: 'userId and role_id are required' });
  }

  db.query('UPDATE users SET role_id = ? WHERE id = ?', [role_id, userId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ success: true, message: 'User role updated' });
  });
});

// Reset password - super admin only
router.put('/reset-password', authenticate, authorize(['manage_users']), (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ message: 'userId and newPassword are required' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ success: true, message: 'Password reset successfully' });
  });
});

// Delete user - super admin only
router.delete('/delete', authenticate, authorize(['manage_users']), (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ success: true, message: 'User deleted successfully' });
  });
});

// ============================================
// RESET ADMIN (DELETE & RECREATE)
// ============================================
router.post('/reset-admin', async (req, res) => {
  try {
    const email = 'admin@detmoldpackaging.com';
    
    // Delete admin lama
    db.query('DELETE FROM users WHERE email = ?', [email], (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to delete old admin', error: err });
      }

      // Create admin baru
      const username = 'admin';
      const password = 'Kanayakan_21';
      const hashedPassword = bcrypt.hashSync(password, 10);

      db.query(
        'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, 1)',
        [username, email, hashedPassword],
        (err, result) => {
          if (err) {
            return res.status(500).json({ message: 'Failed to create admin', error: err });
          }

          res.status(201).json({ 
            success: true,
            message: 'Admin reset successfully!',
            username: username,
            email: email,
            password: password,
            userId: result.insertId
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;