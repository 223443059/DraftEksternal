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

// 1. IMPOR KOMPONEN OTD (Dashboard Excel-like)
import OTD from "./components/OTD.jsx";

const DEFAULT_INITIAL_ORDERS = [];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn_Ladeu') === 'true';
  });

  const [activePage, setActivePage] = useState('dashboard');

  const [orders, setOrders] = useState(() => {
    try {
      const savedOrders = 
        localStorage.getItem('dataPO_Ladeu') || 
        localStorage.getItem('dataPOV5');

      return savedOrders ? JSON.parse(savedOrders) : DEFAULT_INITIAL_ORDERS;
    } catch (error) {
      console.error("Gagal memuat data PO dari penyimpanan lokal:", error);
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

  const handleLoginSuccess = () => {
    localStorage.setItem('isLoggedIn_Ladeu', 'true');
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn_Ladeu');
    setIsLoggedIn(false);
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
        return <Settings changePage={setActivePage} onLogout={handleLogout} />;
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
      
      // 2. TAMBAHKAN CASE OTD DI SINI
      case 'otd':
        return <OTD changePage={setActivePage} onLogout={handleLogout} />;

      case 'dashboard':
      default:
        return <Dashboard changePage={setActivePage} orders={orders} onLogout={handleLogout} />;
    }
  };

  return <>{renderContent()}</>;
}