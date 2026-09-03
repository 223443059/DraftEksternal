import React from 'react';
import { useRole } from '../context/RoleContext';

export default function Navbar({ activePage, setActivePage, currentUser, onLogout }) {
  // Ambil data & helper dari RoleContext (dengan fallback aman)
  const roleContext = useRole() || {};
  const { user: contextUser, logoutUser, isAdmin: checkIsAdmin, isSuperAdmin: checkIsSuperAdmin } = roleContext;

  // Gunakan data dari props jika ada, atau ambil otomatis dari Context
  const user = currentUser || contextUser;
  const handleLogout = onLogout || logoutUser;

  // Cek status Admin secara komprehensif (Context / Role Name / Role ID)
  const roleName = (user?.role || user?.role_name || '').toLowerCase();
  const roleId = user?.role_id || user?.id_role;
  
  const isAdmin = 
    (typeof checkIsAdmin === 'function' && checkIsAdmin()) ||
    (typeof checkIsSuperAdmin === 'function' && checkIsSuperAdmin()) ||
    roleName === 'admin' || 
    roleName === 'super admin' || 
    roleName === 'administrator' || 
    roleId === 1;

  const navbarStyle = {
    backgroundColor: '#2c3e50',
    padding: '15px 30px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff',
    borderBottom: '3px solid #3498db'
  };

  const navLinksStyle = {
    display: 'flex',
    gap: '15px',
    alignItems: 'center'
  };

  const buttonStyle = (isActive) => ({
    padding: '10px 15px',
    backgroundColor: isActive ? '#3498db' : 'transparent',
    color: '#fff',
    border: '1px solid #3498db',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  });

  const userInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  };

  const handleNavClick = (page) => {
    setActivePage(page);
  };

  return (
    <nav style={navbarStyle}>
      <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
        📦 Purchasing System
      </div>

      <div style={navLinksStyle}>
        <button
          style={buttonStyle(activePage === 'dashboard')}
          onClick={() => handleNavClick('dashboard')}
        >
          Dashboard
        </button>

        <button
          style={buttonStyle(activePage === 'purchaseOrders')}
          onClick={() => handleNavClick('purchaseOrders')}
        >
          Purchase Orders
        </button>

        <button
          style={buttonStyle(activePage === 'suppliers')}
          onClick={() => handleNavClick('suppliers')}
        >
          Suppliers
        </button>

        <button
          style={buttonStyle(activePage === 'analytics')}
          onClick={() => handleNavClick('analytics')}
        >
          Analytics
        </button>

        <button
          style={buttonStyle(activePage === 'report')}
          onClick={() => handleNavClick('report')}
        >
          Report
        </button>

        {/* Render menu User Management HANYA jika Admin / Super Admin */}
        {isAdmin && (
          <button
            style={buttonStyle(activePage === 'userManagement')}
            onClick={() => handleNavClick('userManagement')}
            className="admin-menu"
          >
            👥 User Management
          </button>
        )}

        {/* Menu Settings */}
        {isAdmin && (
          <button
            style={buttonStyle(activePage === 'settings')}
            onClick={() => handleNavClick('settings')}
          >
            ⚙️ Settings
          </button>
        )}
      </div>

      <div style={userInfoStyle}>
        <span style={{ fontSize: '14px' }}>
          👤 {user?.username || 'User'} ({user?.role || user?.role_name || roleName || 'Guest'})
        </span>
        <button
          style={{
            padding: '8px 15px',
            backgroundColor: '#e74c3c',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}