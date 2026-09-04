import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRole } from '../context/RoleContext';

export default function Report({ changePage, onLogout }) {
  const { hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  // === EXCHANGE RATE SETTING ===
  const EXCHANGE_RATE = 15500;

  // === 1. STATE MANAGEMENT ===
  const [orders, setOrders] = useState([]);

  // Filter State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('All Statuses');
  const [filterSupplier, setFilterSupplier] = useState('All Suppliers');

  // Dark/Light Mode State (Disamakan dengan Dashboard)
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Profile & Clock State
  const [profile] = useState({ name: 'Ladeu Intern', email: 'intern@ladeu.com', role: 'Procurement Admin' });
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const profileRef = useRef(null);

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour12: true });

  const handleLogout = () => {
    setShowProfileCard(false);
    if (onLogout) {
      onLogout();
    } else if (changePage) {
      changePage('login');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // === 2. LOAD DATA FROM LOCAL STORAGE ===
  useEffect(() => {
    try {
      const savedPOs =
        localStorage.getItem('dataPOV5') ||
        localStorage.getItem('dataPOV3') ||
        localStorage.getItem('dataPurchaseOrdersLadeuV3') ||
        localStorage.getItem('purchaseOrders');
      if (savedPOs) {
        setOrders(JSON.parse(savedPOs));
      }
    } catch (e) {
      console.error('Failed to parse PO data in Report', e);
    }
  }, []);

  // === 3. HELPER GETTERS ===
  const getOrderTotalIDR = (order) => {
    const possibleKeys = [
      'totalNilai', 'TotalNilai', 'total_nilai', 
      'totalCost', 'TotalCost', 'total_cost', 
      'grandTotal', 'total', 'totalHarga', 'harga', 'nilai'
    ];
    let rawValue = 0;

    for (const key of possibleKeys) {
      if (order[key] !== undefined && order[key] !== null && order[key] !== '') {
        rawValue = order[key];
        break;
      }
    }

    if ((!rawValue || rawValue === 0) && order.items && Array.isArray(order.items)) {
      let calc = 0;
      order.items.forEach((item) => {
        let q = parseFloat(item.qty || item.quantity || 1);
        let p = item.hargaSatuan || item.price || item.harga || 0;
        if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, '')) || 0;
        calc += q * p;
      });
      if (calc > 0) return calc;
    }

    if (typeof rawValue === 'string') {
      let cleanText = rawValue.replace(/Rp|\$/gi, '').replace(/\s/g, '').replace(/,/g, '');
      return parseFloat(cleanText) || 0;
    }
    return parseFloat(rawValue) || 0;
  };

  const getOrderDate = (order) => order.date || order.tanggal || order.orderDate || order.tanggalPesanan || '-';
  const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || '-';
  const getOrderSupplier = (order) => order.supplier || order.supplierName || order.namaSupplier || '-';
  
  const getOrderStatus = (order) => {
      const status = order.status || order.statusPesanan || order.orderStatus || 'Pending';
      const statusMap = {
          'menunggu approval': 'Waiting for Approval',
          'disetujui': 'Approved',
          'diproses': 'Processing',
          'dikirim': 'Shipped',
          'selesai': 'Completed',
          'dibatalkan': 'Cancelled'
      };
      return statusMap[status.toLowerCase()] || status;
  };
  
  const getPoNumber = (order) => order.poNumber || order.noPO || order.nomorPO || '-';

  // === 4. FILTER LOGIC ===
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filterStatus !== 'All Statuses') {
        if (getOrderStatus(order).toLowerCase() !== filterStatus.toLowerCase()) {
          return false;
        }
      }

      if (filterSupplier !== 'All Suppliers') {
        if (getOrderSupplier(order) !== filterSupplier) {
          return false;
        }
      }

      const rawDate = getOrderDate(order);
      if (rawDate && rawDate !== '-') {
        const orderDate = new Date(rawDate);
        if (!isNaN(orderDate.getTime())) {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (orderDate < start) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (orderDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [orders, filterStatus, filterSupplier, startDate, endDate]);

  // === 5. EXPORT CSV FUNCTION ===
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      alert('No data to export!');
      return;
    }

    const headers = ['PO Number', 'Date', 'Supplier', 'Category', 'Status', 'Total Value (USD)'];
    const rows = filteredOrders.map((o) => {
      const idrValue = getOrderTotalIDR(o);
      const usdValue = idrValue / EXCHANGE_RATE;
      
      return [
        `"${getPoNumber(o)}"`,
        `"${getOrderDate(o)}"`,
        `"${getOrderSupplier(o)}"`,
        `"${getOrderCategory(o)}"`,
        `"${getOrderStatus(o)}"`,
        usdValue.toFixed(2)
      ];
    });

    const csvString = [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchase_Orders_Report_${new Date().toISOString().slice(0, 10)}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // === 6. FORMATTER & COLOR BADGES ===
  const formatUSD = (number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(number || 0);

  const totalReportValueIDR = useMemo(
    () => filteredOrders.reduce((sum, order) => sum + getOrderTotalIDR(order), 0),
    [filteredOrders]
  );

  const uniqueSuppliers = useMemo(
    () => ['All Suppliers', ...new Set(orders.map((o) => getOrderSupplier(o)).filter((s) => s && s !== '-'))],
    [orders]
  );

  const statusOptions = ['All Statuses', 'Waiting for Approval', 'Approved', 'Processing', 'Shipped', 'Completed', 'Cancelled'];

  const getStatusColor = (status) => {
    const s = status.toLowerCase();
    if (s.includes('completed')) {
      return isDarkMode ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold' : 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold';
    }
    if (s.includes('shipped') || s.includes('processing') || s.includes('approved')) {
      return isDarkMode ? 'bg-blue-950/80 text-blue-400 border border-blue-800 font-semibold' : 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold';
    }
    return isDarkMode ? 'bg-amber-950/80 text-amber-400 border border-amber-800 font-bold' : 'bg-amber-100 text-amber-800 border border-amber-300 font-bold';
  };

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* HEADER SECTION */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        {/* Row 1: Primary Navbar */}
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
            
            {/* LOGO DIPERBESAR (Ubah h-8 jadi h-12) */}
            <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage?.('dashboard')}>
              <img 
                src="/images/logo.png" 
                alt="Logo Detpak" 
                className="h-12 w-auto object-contain" 
              />
            </div>
            
            <nav className="hidden md:flex items-center h-full gap-3 text-lg font-semibold">
              <button onClick={() => changePage?.('dashboard')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Dashboard</button>
              <button onClick={() => changePage?.('marketPrice')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Market Price</button>
              <button onClick={() => changePage?.('supplierEvaluation')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Supplier Evaluation</button>
              <button onClick={() => changePage?.('otd')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>OTD Performance</button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            {/* Dark Mode Toggle Button */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className={`text-xl cursor-pointer transition-colors ${isDarkMode ? 'text-amber-400 hover:text-amber-300' : 'text-gray-600 hover:text-gray-900'}`} 
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
            
            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-lg text-base font-semibold ${isDarkMode ? 'bg-[#1E293B] text-slate-200 border-slate-700' : 'bg-[#F3F4F6] text-[#4A5568] border-gray-200'}`}>
              <i className="fa-regular fa-clock text-blue-500"></i>
              <span>{formattedTime}</span>
            </div>

            <div className="relative" ref={profileRef}>
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>
                Admin <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>
              
              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      AD
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{profile.name}</h4>
                      <p className="text-sm text-gray-400 truncate">{profile.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded">{profile.role}</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button onClick={() => { setShowProfileCard(false); changePage?.('settings'); }} className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <i className="fa-solid fa-user-gear text-gray-400 text-sm"></i> Manage Profile
                    </button>
                    <button onClick={() => { setShowProfileCard(false); handleLogout(); }} className="w-full text-left px-3 py-2 text-base text-red-500 hover:bg-red-500/10 rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer">
                      <i className="fa-solid fa-arrow-right-from-bracket text-red-500 text-sm"></i> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Subtitle Header */}
        <div className={`px-6 py-5 flex flex-col justify-center ${isDarkMode ? 'bg-[#0F172A]' : 'bg-white'}`}>
          <h2 className="text-[#DE5B54] text-[26px] font-bold tracking-[0.08em] uppercase mb-1.5 leading-none" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Packaging
          </h2>
          <p className={`text-[14px] font-bold tracking-[0.1em] uppercase leading-none ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Group <span className={`mx-1.5 font-light ${isDarkMode ? 'text-slate-700' : 'text-gray-300'}`}>|</span> PT Detpak Indonesia
          </p>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button
              onClick={() => changePage && changePage('dashboard')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer"
            >
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button
              onClick={() => changePage && changePage('suppliers')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer"
            >
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button
              onClick={() => changePage && changePage('purchaseOrders')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer"
            >
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button
              onClick={() => changePage && changePage('analytics')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer"
            >
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button
              onClick={() => changePage && changePage('report')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs"
            >
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button
              onClick={() => changePage && changePage('settings')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer"
            >
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button
                onClick={() => changePage && changePage('userManagement')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-400 rounded-xl hover:bg-slate-800/80 hover:text-amber-300 transition-colors text-left cursor-pointer"
              >
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* REPORT PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Report & Export</h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Pull Purchase Order reports based on specific criteria.</p>
            </div>
            <button
              onClick={handleExportCSV}
              className="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <i className="fa-solid fa-file-csv"></i> Export to CSV
            </button>
          </div>

          {/* FILTER PANEL */}
          <div className={`p-5 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              <i className="fa-solid fa-filter text-red-500"></i> Report Filter
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>PO Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Supplier</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`}
                >
                  {uniqueSuppliers.map((sup) => (
                    <option key={sup} value={sup}>
                      {sup}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* DATA SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className={`p-5 rounded-2xl border shadow-xs flex justify-between items-center ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total POs Found</div>
                <div className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {filteredOrders.length} <span className={`text-sm font-normal ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Transactions</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-red-600 text-white rounded-xl flex items-center justify-center text-xl shrink-0 font-bold">
                <i className="fa-solid fa-receipt"></i>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs flex justify-between items-center ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total Report Value</div>
                <div className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(totalReportValueIDR / EXCHANGE_RATE)}</div>
              </div>
              <div className="w-12 h-12 bg-[#2563EB] text-white rounded-xl flex items-center justify-center text-xl shrink-0 font-bold">
                $
              </div>
            </div>
          </div>

          {/* RESULTS TABLE */}
          <div className={`rounded-2xl border shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className={`border-b font-semibold text-xs uppercase ${isDarkMode ? 'bg-[#0F172A] border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                    <th className="py-4 px-6">PO Number</th>
                    <th className="py-4 px-6">Date</th>
                    <th className="py-4 px-6">Supplier</th>
                    <th className="py-4 px-6">Category</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6 text-right">Total (USD)</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-10 text-center text-gray-400">
                        No transaction data found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order, idx) => (
                      <tr key={idx} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                        <td className="py-4 px-6 font-bold text-red-500">{getPoNumber(order)}</td>
                        <td className={`py-4 px-6 text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{getOrderDate(order)}</td>
                        <td className={`py-4 px-6 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{getOrderSupplier(order)}</td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-md text-xs font-medium ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                            {getOrderCategory(order)}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs ${getStatusColor(getOrderStatus(order))}`}>
                            {getOrderStatus(order)}
                          </span>
                        </td>
                        <td className={`py-4 px-6 text-right font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {formatUSD(getOrderTotalIDR(order) / EXCHANGE_RATE)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}