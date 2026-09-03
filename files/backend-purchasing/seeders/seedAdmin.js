// backend-purchasing/seeders/seedAdmin.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const seedAdmin = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'purchasing_db'
  });

  try {
    console.log('🌱 Starting seeding...');

    // Insert roles
    await connection.execute(
      `INSERT INTO roles (id, name, description) VALUES 
       (1, 'super_admin', 'Full access to all features'),
       (2, 'user', 'Limited access - no user management')
       ON DUPLICATE KEY UPDATE name=name`
    );
    console.log('✅ Roles seeded');

    // Insert permissions
    const permissions = [
      ['view_dashboard', 'View dashboard'],
      ['view_suppliers', 'View suppliers'],
      ['view_purchase_orders', 'View purchase orders'],
      ['view_market_price', 'View market prices'],
      ['view_otd_performance', 'View OTD performance'],
      ['view_analytics', 'View analytics'],
      ['manage_users', 'Manage users - add, edit, delete'],
      ['manage_roles', 'Manage roles and permissions']
    ];

    for (const [name, description] of permissions) {
      await connection.execute(
        `INSERT INTO permissions (name, description) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE name=name`,
        [name, description]
      );
    }
    console.log('✅ Permissions seeded');

    // Assign permissions to super_admin
    await connection.execute(
      `INSERT INTO role_permissions (role_id, permission_id) 
       SELECT 1, id FROM permissions
       ON DUPLICATE KEY UPDATE role_id=1`
    );

    // Assign permissions to user (exclude manage_users & manage_roles)
    await connection.execute(
      `INSERT INTO role_permissions (role_id, permission_id) 
       SELECT 2, id FROM permissions 
       WHERE name NOT IN ('manage_users', 'manage_roles')
       ON DUPLICATE KEY UPDATE role_id=2`
    );
    console.log('✅ Role permissions seeded');

    // Insert admin user
    const hashedPassword = bcrypt.hashSync('Kanayakan_21', 10);
    await connection.execute(
      `INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE role_id=1`,
      ['admin', 'admin@detmoldpackaging.com', hashedPassword]
    );
    console.log('✅ Admin user seeded');
    console.log('📧 Username: admin');
    console.log('📧 Email: admin@detmoldpackaging.com');
    console.log('🔐 Password: Kanayakan_21');

    await connection.end();
    console.log('\n✨ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding error:', error);
    await connection.end();
    process.exit(1);
  }
};

seedAdmin();