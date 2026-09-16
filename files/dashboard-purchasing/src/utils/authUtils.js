const jwt = require('jsonwebtoken');
const db = require('./database');

const SECRET_KEY = 'your-secret-key-change-in-production';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role_id: user.role_id,
    },
    SECRET_KEY,
    { expiresIn: '24h' }
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

// ✅ PERBAIKAN: Ubah ke async/await untuk promise pool
const authorize = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      const query = `
        SELECT GROUP_CONCAT(p.name) as permissions
        FROM users u
        LEFT JOIN role_permissions rp ON u.role_id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = ?
        GROUP BY u.id
      `;

      // ✅ BENAR: Gunakan await untuk promise pool
      const [results] = await db.query(query, [req.user.id]);

      if (!results || results.length === 0) {
        return res.status(403).json({ message: 'Access denied - no permissions found' });
      }

      const userPermissions = results[0].permissions ? results[0].permissions.split(',').map(p => p.trim()) : [];
      const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));

      if (!hasPermission) {
        return res.status(403).json({ 
          message: 'Insufficient permissions',
          required: requiredPermissions,
          has: userPermissions 
        });
      }

      next();
    } catch (err) {
      console.error('Authorization error:', err);
      return res.status(500).json({ message: 'Database authorization error' });
    }
  };
};

module.exports = {
  SECRET_KEY,
  generateToken,
  verifyToken,
  authenticate,
  authorize
};