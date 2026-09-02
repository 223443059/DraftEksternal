import React from 'react';
// 1. Import useRole dari context
import { useRole } from '../context/RoleContext';

export default function Navbar({ activePage, setActivePage, currentUser, onLogout }) {
  // 2. Ambil fungsi isSuperAdmin dari RoleContext
  const { isSuperAdmin } = useRole();

  // (Opsional) Tetap simpan variabel ini untuk sekedar menampilkan teks role di pojok kanan atas
  const role = (currentUser?.role || '').toLowerCase();
  
  // (Opsional) Logika lama jika menu Settings masih ingin ditampilkan untuk role 'admin' biasa
  const roleId = currentUser?.role_id || currentUser?.id_role;
  const isAdmin = role === 'admin' || role === 'super admin' || role === 'administrator' || roleId === 1;

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

        {/* 3. Render menu User Management HANYA jika isSuperAdmin() bernilai true */}
        {isSuperAdmin() && (
          <button
            style={buttonStyle(activePage === 'userManagement')}
            onClick={() => handleNavClick('userManagement')}
            className="admin-menu"
          >
            👥 User Management
          </button>
        )}

        {/* Menu Settings (ditampilkan untuk Admin biasa dan Super Admin) */}
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
          👤 {currentUser?.username || 'User'} ({role})
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
          onClick={onLogout}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}