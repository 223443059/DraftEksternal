import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRole } from '../context/RoleContext';

// === KURS & HELPER UTILITY (KONVERSI & FORMATTING) ===
const EXCHANGE_RATE_IDR_TO_USD = 16000; // 1 USD = Rp 16.000 (dapat disesuaikan)

const usdFormatter = new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD', 
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatUSD = (number) => usdFormatter.format(number || 0);

const formatShortNumber = (val) => {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1).replace('.0', '')}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val ? val.toFixed(0) : '0'}`;
};

const getOrderTotal = (order) => {
  if (!order) return 0;
  const possibleKeys = [
    'totalCost', 'TotalCost', 'total_cost',
    'totalValue', 'TotalValue', 'total_value',
    'grandTotal', 'total', 'totalPrice', 'price', 'value',
    'totalNilai', 'TotalNilai', 'total_nilai', 'totalHarga', 'harga', 'nilai'
  ];

  let rawValue = undefined;
  for (const key of possibleKeys) {
    if (order[key] !== undefined && order[key] !== null && order[key] !== '') {
      rawValue = order[key];
      break;
    }
  }

  let totalIDR = 0;

  if ((rawValue === undefined || rawValue === 0) && order.items && Array.isArray(order.items)) {
    let calc = 0;
    order.items.forEach((item) => {
      let q = parseFloat(item.qty || item.quantity || 1);
      let p = item.unitPrice || item.price || item.hargaSatuan || item.harga || 0;
      if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, '')) || 0;
      calc += q * p;
    });
    totalIDR = calc;
  } else if (typeof rawValue === 'string') {
    let cleanText = rawValue.replace(/Rp/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
    totalIDR = parseFloat(cleanText) || 0;
  } else {
    totalIDR = parseFloat(rawValue) || 0;
  }

  // Konversi dari IDR ke USD
  return totalIDR / EXCHANGE_RATE_IDR_TO_USD;
};

const getOrderDate = (order) => order.date || order.tanggal || order.orderDate || order.tanggalPesanan || '';
const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || 'Others';
const getOrderStatus = (order) => order.status || order.statusPesanan || order.orderStatus || '';
const getOrderSupplier = (order) => order.supplier || order.namaSupplier || order.vendor || order.nama_supplier || 'Unknown Supplier';

// Helper untuk mendapatkan tahun dari order
const getYearFromOrder = (order) => {
  const dateStr = getOrderDate(order);
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
};

// Precision SVG Curve Path Generator
const generateSvgPath = (data, maxScale) => {
  if (!data || data.length === 0) return '';
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * 920 + 40;
    const y = 190 - (val / (maxScale || 1)) * 160;
    return { x, y };
  });

  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const cpsX = (point.x + a[i - 1].x) / 2;
    return `${acc} C ${cpsX},${a[i - 1].y} ${cpsX},${point.y} ${point.x},${point.y}`;
  }, '');
};

// Smooth Line Path Generator
const generateSmoothSvgPath = (points) => {
  if (!points || points.length === 0) return '';
  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const cpsX = (point.x + a[i - 1].x) / 2;
    return `${acc} C ${cpsX},${a[i - 1].y} ${cpsX},${point.y} ${point.x},${point.y}`;
  }, '');
};

// Rounded Top Bar Generator
const generateRoundedBar = (x, y, w, h, r) => {
  if (h <= 0) return `M ${x},${y} h ${w} v 0 h -${w} Z`;
  const radius = Math.min(r, h, w / 2);
  return `M ${x},${y + h} L ${x},${y + radius} A ${radius},${radius} 0 0,1 ${x + radius},${y} L ${x + w - radius},${y} A ${radius},${radius} 0 0,1 ${x + w},${y + radius} L ${x + w},${y + h} Z`;
};

export default function Analytics({ changePage, onLogout }) {
  const { hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  // === 1. STATE MANAGEMENT ===
  const [orders, setOrders] = useState([]);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // State untuk Filter Tahun Dinamis
  const [selectedYear, setSelectedYear] = useState('All');
  
  const profileRef = useRef(null);
  
  // Dark/Light Mode State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Supplier Analysis State
  const [selectedSupplier, setSelectedSupplier] = useState('');

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  const profile = useMemo(() => {
    const savedProfile = localStorage.getItem('appProfile');
    return savedProfile ? JSON.parse(savedProfile) : {
      name: 'Admin',
      email: 'admin@detpak.com',
      role: 'Administrator'
    };
  }, []);

  const handleNavigate = (page) => {
    if (changePage) changePage(page);
  };

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    } else if (typeof changePage === 'function') {
      changePage('login');
    }
  };

  // Load PO Data from LocalStorage
  useEffect(() => {
    try {
      const savedPOs =
        localStorage.getItem('dataPOV5') ||
        localStorage.getItem('dataPOV3') ||
        localStorage.getItem('dataPurchaseOrdersLadeuV3'); 

      if (savedPOs) {
        const parsedData = JSON.parse(savedPOs);
        setOrders(parsedData);
        
        if (parsedData && parsedData.length > 0) {
            const firstSupplier = getOrderSupplier(parsedData[0]);
            setSelectedSupplier(firstSupplier);
        }
      }
    } catch (e) {
      console.error('Failed to load PO data in Analytics', e);
    }
  }, []);

  // Handle outside click for profile popover
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // === MENGAMBIL DAFTAR TAHUN DINAMIS ===
  const availableYears = useMemo(() => {
    const years = new Set();
    orders.forEach((o) => {
      const yr = getYearFromOrder(o);
      if (yr) years.add(yr);
    });
    return ['All', ...Array.from(years).sort((a, b) => b - a)];
  }, [orders]);

  // === PENENTUAN TAHUN UNTUK YoY ===
  const comparisonYears = useMemo(() => {
    let current = new Date().getFullYear(); // Default tahun berjalan
    if (selectedYear !== 'All') {
      current = parseInt(selectedYear);
    } else if (availableYears.length > 1) {
      current = availableYears[1]; // Mengambil tahun paling baru jika 'All' terpilih
    }
    return { current, previous: current - 1 };
  }, [selectedYear, availableYears]);

  // === 2. GENERAL METRICS CALCULATION (IN USD) ===
  const analyticsStats = useMemo(() => {
    let totalSpend = 0;
    let completedCount = 0;
    let canceledCount = 0;
    let totalOrdersCount = 0;

    orders.forEach((o) => {
      const yr = getYearFromOrder(o);
      // Filter perhitungan berdasarkan pilihan dropdown
      if (selectedYear !== 'All' && yr !== parseInt(selectedYear)) return;

      const costUSD = getOrderTotal(o);
      const status = getOrderStatus(o).toLowerCase();

      totalSpend += costUSD;
      totalOrdersCount++;

      if (status.includes('selesai') || status.includes('paid') || status.includes('lunas') || status.includes('completed')) {
        completedCount++;
      }
      if (status.includes('batal') || status.includes('cancel')) {
        canceledCount++;
      }
    });

    const completionRate = totalOrdersCount > 0 ? Math.round((completedCount / totalOrdersCount) * 100) : 0;

    return { totalSpend, completionRate, canceledCount, totalOrdersCount };
  }, [orders, selectedYear]);

  // === 3. MAIN CHART CALCULATION (OVERALL YoY IN USD) ===
  const yoyChartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totalsPrev = new Array(12).fill(0);
    const totalsCurrent = new Array(12).fill(0);

    orders.forEach((order) => {
      const yr = getYearFromOrder(order);
      const costUSD = getOrderTotal(order);

      if (yr === comparisonYears.previous) totalsPrev[getOrderDate(order) ? new Date(getOrderDate(order)).getMonth() : 0] += costUSD;
      if (yr === comparisonYears.current) totalsCurrent[getOrderDate(order) ? new Date(getOrderDate(order)).getMonth() : 0] += costUSD;
    });

    const maxVal = Math.max(...totalsPrev, ...totalsCurrent, 100);
    return { months, totalsPrev, totalsCurrent, maxVal };
  }, [orders, comparisonYears]);

  // === 4. SUPPLIER DATA CALCULATION ===
  const supplierList = useMemo(() => {
    const names = orders.map(o => getOrderSupplier(o)).filter(Boolean);
    return [...new Set(names)].sort();
  }, [orders]);

  useEffect(() => {
    if (supplierList.length > 0 && !supplierList.includes(selectedSupplier)) {
      setSelectedSupplier(supplierList[0]);
    }
  }, [supplierList, selectedSupplier]);

  const supplierAnalysisData = useMemo(() => {
    const totalsPrev = new Array(12).fill(0);
    const totalsCurrent = new Array(12).fill(0);
    let totalYearPrev = 0;
    let totalYearCurrent = 0;

    if (selectedSupplier) {
      orders.forEach((order) => {
        if (getOrderSupplier(order) === selectedSupplier) {
          const yr = getYearFromOrder(order);
          const costUSD = getOrderTotal(order);
          const monthIdx = getOrderDate(order) ? new Date(getOrderDate(order)).getMonth() : 0;
          
          if (yr === comparisonYears.previous) {
              totalsPrev[monthIdx] += costUSD;
              totalYearPrev += costUSD;
          }
          if (yr === comparisonYears.current) {
              totalsCurrent[monthIdx] += costUSD;
              totalYearCurrent += costUSD;
          }
        }
      });
    }

    let overallYoy = 0;
    if (totalYearPrev > 0) {
      overallYoy = ((totalYearCurrent - totalYearPrev) / totalYearPrev) * 100;
    } else if (totalYearCurrent > 0) {
      overallYoy = 100; 
    }

    const monthlyYoy = totalsCurrent.map((valCurr, idx) => {
      const valPrev = totalsPrev[idx];
      if (valPrev === 0 && valCurr === 0) return 0;
      if (valPrev === 0 && valCurr > 0) return 100;
      return ((valCurr - valPrev) / valPrev) * 100;
    });

    const maxSpend = Math.max(...totalsPrev, ...totalsCurrent, 100); 
    
    return { 
        totalYearPrev, 
        totalYearCurrent, 
        overallYoy, 
        totalsPrev, 
        totalsCurrent, 
        monthlyYoy, 
        maxSpend,
        months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    };
  }, [orders, selectedSupplier, comparisonYears]);

  // === 5. CATEGORY CALCULATION ===
  const avgCategoryData = useMemo(() => {
    const catMap = {};

    orders.forEach((order) => {
      // Terapkan filter tahun pada data kategori
      const yr = getYearFromOrder(order);
      if (selectedYear !== 'All' && yr !== parseInt(selectedYear)) return;

      const cat = getOrderCategory(order);
      const costUSD = getOrderTotal(order);

      if (!catMap[cat]) {
        catMap[cat] = { totalCost: 0, count: 0 };
      }
      catMap[cat].totalCost += costUSD;
      catMap[cat].count += 1;
    });

    return Object.keys(catMap).map((catName) => ({
      category: catName,
      avgCost: catMap[catName].totalCost / catMap[catName].count,
      count: catMap[catName].count
    }));
  }, [orders, selectedYear]);

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* HEADER UTAMA */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
              <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage?.('dashboard')}>
                <img 
                  src="/images/logo.png" 
                  alt="Detpak Logo" 
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
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{profile.email}</p>
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

        <div className={`px-6 py-5 flex flex-col justify-center ${isDarkMode ? 'bg-[#0F172A]' : 'bg-white'}`}>
          <h2 className="text-[#DE5B54] text-[26px] font-bold tracking-[0.08em] uppercase mb-1.5 leading-none" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Packaging
          </h2>
          <p className={`text-[14px] font-bold tracking-[0.1em] uppercase leading-none ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Group <span className={`mx-1.5 font-light ${isDarkMode ? 'text-slate-700' : 'text-gray-300'}`}>|</span> PT Detpak Indonesia
          </p>
        </div>
      </header>
      
      {/* BODY CONTAINER */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => handleNavigate('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => handleNavigate('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => handleNavigate('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => handleNavigate('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => handleNavigate('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => handleNavigate('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button onClick={() => handleNavigate('userManagement')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-400 rounded-xl hover:bg-slate-800/80 hover:text-amber-300 transition-colors text-left cursor-pointer">
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Analytics</h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>In-depth analysis converted to USD (1 USD = Rp {EXCHANGE_RATE_IDR_TO_USD.toLocaleString('en-US')})</p>
            </div>
          </div>

          {/* 1. TOP KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-5">
            {/* NEW DYNAMIC SPEND CARD */}
            <div className={`p-5 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                 <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Spend (USD)</p>
                 <select 
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className={`text-xs font-bold uppercase rounded-md px-2 py-1 outline-none cursor-pointer transition-colors ${
                      isDarkMode 
                        ? 'bg-slate-800 text-slate-200 border border-slate-600 focus:border-slate-400' 
                        : 'bg-gray-100 text-gray-700 border border-gray-300 focus:border-gray-500'
                    }`}
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year}>
                        {year === 'All' ? '(All Time)' : year}
                      </option>
                    ))}
                  </select>
              </div>
              <p className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(analyticsStats.totalSpend)}</p>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>PO Completion Rate</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{analyticsStats.completionRate}%</p>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Completed Status</span>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Canceled POs</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{analyticsStats.canceledCount}</p>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{selectedYear === 'All' ? 'All Time' : selectedYear}</span>
              </div>
            </div>
          </div>

          {/* 2. CHART YoY (Dynamic Comparison Based on Dropdown) */}
          <div className={`p-6 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Spending Comparison in USD: {comparisonYears.current} vs {comparisonYears.previous} (YoY)</h3>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  <span className="w-3 h-3 rounded-full bg-slate-500"></span> {comparisonYears.previous} Spend ($)
                </div>
                <div className="flex items-center gap-1.5 text-red-500">
                  <span className="w-3 h-3 rounded-full bg-red-600"></span> {comparisonYears.current} Spend ($)
                </div>
              </div>
            </div>

            <div className="w-full h-64 relative">
              <svg viewBox="0 0 1000 240" className="w-full h-full overflow-visible">
                {/* Grid Lines */}
                {[4, 3, 2, 1, 0].map((step, i) => {
                  const y = 30 + i * 40;
                  const gridVal = (yoyChartData.maxVal * step) / 4;
                  return (
                    <g key={i}>
                      <line x1="40" y1={y} x2="960" y2={y} stroke={isDarkMode ? '#334155' : '#F3F4F6'} strokeDasharray="4 4" />
                      <text x="30" y={y + 4} textAnchor="end" className={`text-[10px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>
                        {formatShortNumber(gridVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Line Previous Year (Gray) */}
                <path
                  d={generateSvgPath(yoyChartData.totalsPrev, yoyChartData.maxVal)}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />

                {/* Line Current Year (Red with shadow) */}
                <path
                  d={generateSvgPath(yoyChartData.totalsCurrent, yoyChartData.maxVal)}
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0px 3px 4px rgba(220, 38, 38, 0.2))' }}
                />

                {/* Data Points & X-Axis Labels */}
                {yoyChartData.months.map((m, idx) => {
                  const x = (idx / 11) * 920 + 40;
                  const yCurrent = 190 - (yoyChartData.totalsCurrent[idx] / yoyChartData.maxVal) * 160;

                  return (
                    <g key={idx}>
                      <circle cx={x} cy={yCurrent} r="5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#DC2626" strokeWidth="3" />
                      <text x={x} y="222" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>
                        {m}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* 3. SECTION: SUPPLIER ANALYSIS (YoY) */}
          <div className={`p-6 rounded-2xl border shadow-xs space-y-6 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div>
               <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Supplier Analysis (YoY in USD)</h3>
               <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Select a supplier to compare USD spending between {comparisonYears.previous} and {comparisonYears.current}</p>
            </div>

            {/* Supplier Dropdown */}
            <div className="max-w-xs">
               <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Select Supplier</label>
               <select 
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className={`w-full text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2.5 outline-none transition-shadow ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
               >
                  {supplierList.length === 0 ? <option value="">No supplier data available</option> : null}
                  {supplierList.map((sup, idx) => (
                     <option key={idx} value={sup}>{sup}</option>
                  ))}
               </select>
            </div>

            {/* 4 Supplier Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
               <div className={`p-5 rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>SUPPLIER NAME</p>
                  <p className="text-lg font-black text-red-500 truncate">{selectedSupplier || '-'}</p>
               </div>
               <div className={`p-5 rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>{comparisonYears.current} TOTAL (USD)</p>
                  <p className="text-lg font-black text-red-500">{formatUSD(supplierAnalysisData.totalYearCurrent)}</p>
               </div>
               <div className={`p-5 rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>{comparisonYears.previous} TOTAL (USD)</p>
                  <p className={`text-lg font-black ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{formatUSD(supplierAnalysisData.totalYearPrev)}</p>
               </div>
               <div className={`p-5 rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50/50 border-gray-100'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>YoY CHANGE</p>
                  <div className={`flex items-center gap-1.5 text-lg font-black ${supplierAnalysisData.overallYoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                     {supplierAnalysisData.overallYoy >= 0 ? (
                        <i className="fa-solid fa-arrow-trend-up text-sm"></i>
                     ) : (
                        <i className="fa-solid fa-arrow-trend-down text-sm"></i>
                     )}
                     {Math.abs(supplierAnalysisData.overallYoy).toFixed(2)}%
                  </div>
               </div>
            </div>

            {/* Mixed Bar & Line Chart */}
            <div>
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                  <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Monthly Spending Comparison (YoY) - {selectedSupplier || 'Supplier'}</h4>
                  
                  {/* Legends */}
                  <div className={`flex flex-wrap items-center gap-4 text-[11px] font-semibold ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                     <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-slate-500' : 'bg-gray-400'}`}></div>
                        {comparisonYears.previous} ($)
                     </div>
                     <div className="flex items-center gap-1.5 text-red-500">
                        <div className="w-3 h-3 rounded bg-red-400"></div>
                        {comparisonYears.current} ($)
                     </div>
                     <div className="flex items-center gap-1.5 ml-2">
                        <div className="w-6 h-0.5 relative flex items-center justify-center bg-amber-500">
                           <div className="w-2.5 h-2.5 rounded-full absolute bg-white border-[2px] border-amber-500"></div>
                        </div>
                        <span className="text-amber-500">% YoY Change</span>
                     </div>
                  </div>
               </div>

               {/* SVG Mixed Chart */}
               <div className="w-full h-72 relative mt-4">
                  <svg viewBox="0 0 1000 280" className="w-full h-full overflow-visible font-sans">
                     <defs>
                        {/* Gradient yang lebih Solid dan Tegas untuk Batang */}
                        <linearGradient id="barPrev" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor={isDarkMode ? '#94A3B8' : '#9CA3AF'} stopOpacity="1"/>
                           <stop offset="100%" stopColor={isDarkMode ? '#475569' : '#6B7280'} stopOpacity="1"/>
                        </linearGradient>
                        <linearGradient id="barCurr" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor="#F87171" stopOpacity="1"/>
                           <stop offset="100%" stopColor="#DC2626" stopOpacity="1"/>
                        </linearGradient>
                        {/* Shadow untuk Garis YoY */}
                        <filter id="lineShadow" x="-10%" y="-10%" width="120%" height="120%">
                           <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.15"/>
                        </filter>
                     </defs>

                     {/* Left Y Axis (USD) & Grid Lines */}
                     {[100, 75, 50, 25, 0].map((pct, i) => {
                        const y = 30 + i * 50;
                        const val = (supplierAnalysisData.maxSpend * pct) / 100;
                        
                        // Membuat garis 0 (baseline) lebih solid dan tebal
                        const isZeroLine = pct === 0;
                        
                        return (
                           <g key={`grid-${i}`}>
                              <line 
                                x1="60" 
                                y1={y} 
                                x2="940" 
                                y2={y} 
                                stroke={isZeroLine ? (isDarkMode ? '#64748B' : '#9CA3AF') : (isDarkMode ? '#334155' : '#E5E7EB')} 
                                strokeDasharray={isZeroLine ? "0" : "4 4"} 
                                strokeWidth={isZeroLine ? "2" : "1"}
                              />
                              <text x="50" y={y + 4} textAnchor="end" className={`text-[10px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>
                                 {formatShortNumber(val)}
                              </text>
                           </g>
                        );
                     })}
                     <text x="50" y="15" textAnchor="end" className={`text-[10px] font-bold ${isDarkMode ? 'fill-slate-200' : 'fill-gray-800'}`}>Spend ($)</text>

                     {/* Right Y Axis (Percentage) */}
                     {[150, 100, 50, 0, -50].map((pct, i) => {
                        const y = 30 + i * 50;
                        return (
                           <g key={`pct-${i}`}>
                              <text x="950" y={y + 4} textAnchor="start" className={`text-[10px] ${isDarkMode ? 'fill-amber-500' : 'fill-amber-600'}`}>
                                 {pct}%
                              </text>
                           </g>
                        );
                     })}
                     <text x="950" y="15" textAnchor="start" className={`text-[10px] font-bold ${isDarkMode ? 'fill-amber-400' : 'fill-amber-600'}`}>% YoY Change</text>

                     {/* Zero line for percentage */}
                     <line x1="60" y1="180" x2="940" y2="180" stroke={isDarkMode ? '#475569' : '#D1D5DB'} strokeWidth="1.5" strokeDasharray="6 4" />

                     {/* Bars Loop dengan Conditional Centering agar selalu presisi di tengah */}
                     {supplierAnalysisData.months.map((m, idx) => {
                        const xCenter = 60 + (idx * (880 / 11));
                        
                        const barHeightPrev = (supplierAnalysisData.totalsPrev[idx] / supplierAnalysisData.maxSpend) * 200;
                        const barHeightCurr = (supplierAnalysisData.totalsCurrent[idx] / supplierAnalysisData.maxSpend) * 200;
                        
                        const hPrev = isNaN(barHeightPrev) ? 0 : barHeightPrev;
                        const hCurr = isNaN(barHeightCurr) ? 0 : barHeightCurr;
                        
                        const yPrev = 230 - hPrev;
                        const yCurr = 230 - hCurr;

                        // Pengaturan Lebar dan Jarak Batang
                        const barWidth = 20;
                        const gap = 4;
                        let xPrev, xCurr;

                        if (hPrev > 0 && hCurr > 0) {
                           // Jika ada data di kedua tahun, letakkan berdampingan simetris
                           xPrev = xCenter - barWidth - (gap / 2);
                           xCurr = xCenter + (gap / 2);
                        } else if (hPrev > 0 && hCurr === 0) {
                           // Jika hanya ada data tahun lalu, posisikan persis di atas tulisan bulan
                           xPrev = xCenter - (barWidth / 2);
                           xCurr = xCenter; 
                        } else if (hPrev === 0 && hCurr > 0) {
                           // Jika hanya ada data tahun ini, posisikan persis di atas tulisan bulan
                           xPrev = xCenter;
                           xCurr = xCenter - (barWidth / 2);
                        } else {
                           // Jika tidak ada data di keduanya
                           xPrev = xCenter - barWidth - (gap / 2);
                           xCurr = xCenter + (gap / 2);
                        }

                        return (
                           <g key={`bars-${idx}`}>
                              {/* Previous Year Bar */}
                              {hPrev > 0 && (
                                <path 
                                   d={generateRoundedBar(xPrev, yPrev, barWidth, hPrev, 4)} 
                                   fill="url(#barPrev)" 
                                />
                              )}
                              
                              {/* Current Year Bar */}
                              {hCurr > 0 && (
                                <path 
                                   d={generateRoundedBar(xCurr, yCurr, barWidth, hCurr, 4)} 
                                   fill="url(#barCurr)" 
                                />
                              )}
                              
                              {/* X Axis Label (Tulisan Bulan) */}
                              <text x={xCenter} y="250" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-600'}`}>
                                 {m}
                              </text>
                           </g>
                        );
                     })}

                     {/* Render The Smooth Percentage Line */}
                     {(() => {
                        const linePoints = supplierAnalysisData.months.map((m, idx) => {
                           const x = 60 + (idx * (880 / 11));
                           let yoy = supplierAnalysisData.monthlyYoy[idx];
                           
                           if (yoy > 150) yoy = 150;
                           if (yoy < -50) yoy = -50;
                           
                           const y = 230 - (yoy + 50);
                           return { x, y, yoyRaw: supplierAnalysisData.monthlyYoy[idx] };
                        });

                        return (
                           <g>
                              {/* Garis Persentase */}
                              <path 
                                 d={generateSmoothSvgPath(linePoints)} 
                                 fill="none" 
                                 stroke="#F59E0B" 
                                 strokeWidth="3" 
                                 strokeLinecap="round"
                                 strokeLinejoin="round"
                                 filter="url(#lineShadow)"
                              />
                              
                              {/* Titik Data pada Garis */}
                              {linePoints.map((pt, idx) => (
                                 <g key={`dot-${idx}`}>
                                    <circle 
                                       cx={pt.x} 
                                       cy={pt.y} 
                                       r="5" 
                                       fill={isDarkMode ? '#1E293B' : '#FFFFFF'} 
                                       stroke="#F59E0B" 
                                       strokeWidth="2.5" 
                                    />
                                    {pt.yoyRaw !== 0 && !isNaN(pt.yoyRaw) && (
                                        <text 
                                           x={pt.x} 
                                           y={pt.y - 14} 
                                           textAnchor="middle" 
                                           className={`text-[10px] font-bold ${isDarkMode ? 'fill-amber-400' : 'fill-amber-600'}`}
                                        >
                                            {pt.yoyRaw > 0 ? '+' : ''}{pt.yoyRaw.toFixed(0)}%
                                        </text>
                                    )}
                                 </g>
                              ))}
                           </g>
                        );
                     })()}
                  </svg>
               </div>
            </div>
          </div>

          {/* 4. BOTTOM SECTION: AVERAGE PO VALUE BY CATEGORY */}
          <div className="grid grid-cols-1 gap-6">
            <div className={`p-6 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Average PO Value by Category (USD)</h3>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Average Purchase Order transaction value per category in USD</p>
                </div>
              </div>

              {avgCategoryData.length === 0 ? (
                <div className={`h-48 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-700 text-slate-500' : 'bg-gray-50/50 border-gray-200 text-gray-400'}`}>
                  No category data available for selected year
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                  {avgCategoryData.map((item, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700 hover:border-red-500/50' : 'bg-gray-50 border-gray-200/80 hover:border-red-300'}`}>
                      <div>
                        <span className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{item.category}</span>
                        <p className={`text-xl font-bold mt-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(item.avgCost)}</p>
                      </div>
                      <div className={`mt-3 pt-3 border-t flex justify-between items-center text-xs ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-gray-200/60 text-gray-500'}`}>
                        <span>Total Orders:</span>
                        <span className={`font-bold ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{item.count} POs</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}