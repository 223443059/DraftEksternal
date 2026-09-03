const jwt = require('jsonwebtoken');
const db = require('./database');

// Secret Key JWT
const SECRET_KEY = 'your-secret-key-change-in-production';

// ============================================
// GENERATE TOKEN
// ============================================
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

// ============================================
// VERIFY TOKEN
// ============================================
const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (error) {
    return null;
  }
};

// ============================================
// AUTHENTICATE MIDDLEWARE
// ============================================
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

// ============================================
// AUTHORIZE MIDDLEWARE
// ============================================
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

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  authorize,
  SECRET_KEY
};