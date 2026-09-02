import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard.jsx';
import Suppliers from './components/Suppliers.jsx';
import Analytics from './components/Analytics.jsx'; 
import Report from './components/Report.jsx';
import PurchaseOrders from './components/PurchaseOrders.jsx';
import Settings from './components/Settings.jsx';
import CreatePOModal from './components/CreatePOModal.jsx';
import Login from './components/Login.jsx';
import SupplierEvaluation from "./components/SupplierEvaluation.jsx";
import MarketPrice from "./components/MarketPrice.jsx"; 
import OTD from "./components/OTD.jsx";
import UserManagement from "./components/UserManagement.jsx";
import Navbar from './components/Navbar.jsx';

// 1. TAMBAHKAN IMPORT ROLE PROVIDER DI SINI
import { RoleProvider } from './context/RoleContext';

const DEFAULT_INITIAL_ORDERS = [];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn_Ladeu') === 'true';
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.error("Gagal membaca data user:", error);
      return null;
    }
  });

  const [activePage, setActivePage] = useState('dashboard');

  const [orders, setOrders] = useState(() => {
    try {
      const savedOrders = 
        localStorage.getItem('dataPO_Ladeu') || 
        localStorage.getItem('dataPOV5');
      return savedOrders ? JSON.parse(savedOrders) : DEFAULT_INITIAL_ORDERS;
    } catch (error) {
      console.error("Gagal memuat data PO:", error);
      return DEFAULT_INITIAL_ORDERS;
    }
  });

  useEffect(() => {
    try {
      const serialized = JSON.stringify(orders);
      localStorage.setItem('dataPO_Ladeu', serialized);
      localStorage.setItem('dataPOV5', serialized);
    } catch (error) {
      console.error("Gagal menyimpan data PO:", error);
    }
  }, [orders]);

  const handleLoginSuccess = (userData) => {
    localStorage.setItem('isLoggedIn_Ladeu', 'true');
    if (userData) {
      setCurrentUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    }
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn_Ladeu');
    localStorage.removeItem('user'); 
    localStorage.removeItem('token'); 
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActivePage('dashboard'); 
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderContent = () => {
    switch (activePage) {
      case 'suppliers':
        return <Suppliers changePage={setActivePage} onLogout={handleLogout} />;
      case 'analytics':
        return <Analytics changePage={setActivePage} orders={orders} onLogout={handleLogout} />;
      case 'report':
        return <Report changePage={setActivePage} orders={orders} onLogout={handleLogout} />;
      case 'purchaseOrders':
        return <PurchaseOrders changePage={setActivePage} orders={orders} setOrders={setOrders} onLogout={handleLogout} />;
      case 'settings':
        return <Settings changePage={setActivePage} onLogout={handleLogout} userRole={currentUser?.role} />;
      case 'createPOModal':
        return (
          <CreatePOModal 
            isOpen={true}
            onClose={() => setActivePage('purchaseOrders')}
            changePage={setActivePage} 
            orders={orders} 
            setOrders={setOrders} 
          />
        );
      case 'supplierEvaluation':
        return <SupplierEvaluation changePage={setActivePage} onLogout={handleLogout} />;
      case 'marketPrice':
        return <MarketPrice changePage={setActivePage} onLogout={handleLogout} />;
      case 'otd':
        return <OTD changePage={setActivePage} onLogout={handleLogout} />;
      
      case 'userManagement': {
        // Proteksi Halaman User Management
        const role = (currentUser?.role || '').toLowerCase();
        const roleId = currentUser?.role_id || currentUser?.id_role;
        const isAdminUser = role === 'admin' || role === 'super admin' || role === 'administrator' || roleId === 1;

        if (isAdminUser) {
          return <UserManagement changePage={setActivePage} onLogout={handleLogout} />;
        } else {
          return (
            <div style={{ textAlign: 'center', padding: '50px', color: '#ffffff' }}>
              <h2>Akses Ditolak 🛑</h2>
              <p>Anda tidak memiliki izin untuk melihat halaman User Management.</p>
              <button onClick={() => setActivePage('dashboard')} style={{ padding: '10px 20px', marginTop: '15px', cursor: 'pointer' }}>
                Kembali ke Dashboard
              </button>
            </div>
          );
        }
      }

      case 'dashboard':
      default:
        return <Dashboard changePage={setActivePage} orders={orders} onLogout={handleLogout} />;
    }
  };

  return (
    // 2. BUNGKUS APLIKASI DENGAN ROLE PROVIDER DI SINI
    <RoleProvider>
      <Navbar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        currentUser={currentUser} 
        onLogout={handleLogout}
      />
      {renderContent()}
    </RoleProvider>
  );
}