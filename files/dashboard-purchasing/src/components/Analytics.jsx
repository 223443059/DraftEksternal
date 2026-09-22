import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRole } from '../context/RoleContext';
import { API_ENDPOINTS } from '../utils/api.config';

// === KURS & HELPER UTILITY (KONVERSI & FORMATTING) ===
// Kurs IDR per 1 USD berdasarkan tahun transaksi (disamakan dengan PurchaseOrders.jsx & Dashboard.jsx)
// Dipakai hanya sebagai fallback jika baris tidak punya Spending USD dari database.
const KURS_PER_TAHUN = {
  2023: 15331,
  2024: 15926,
  2025: 16557,
  2026: 17505
};

const getKurs = (year) => {
  const years = Object.keys(KURS_PER_TAHUN).map(Number);
  const y = parseInt(year, 10);
  if (Number.isNaN(y)) return KURS_PER_TAHUN[Math.max(...years)];
  const nearest = Math.min(Math.max(y, Math.min(...years)), Math.max(...years));
  return KURS_PER_TAHUN[nearest];
};

// Cache lokal hanya pelengkap: data PO ribuan baris bisa melewati kuota localStorage (~5 MB).
// Kalau gagal disimpan, cache lama dibuang agar tidak dipakai sebagai data basi.
const saveOrdersCache = (rows) => {
  try {
    localStorage.setItem('dataPO_Ladeu', JSON.stringify(rows));
  } catch (storageError) {
    try { localStorage.removeItem('dataPO_Ladeu'); } catch { /* abaikan */ }
    console.warn('Cache lokal PO tidak bisa disimpan (data terlalu besar), lanjut tanpa cache.');
  }
};

// Baris API (snake_case, kolom tabel purchase_orders) atau cache halaman lain (camelCase)
// -> bentuk objek yang dipakai Analytics
const toOrder = (po, suppliersMap = {}) => {
  const rawDate = po.receipt_date || po.receiptDate || po.order_date || po.date;
  const usd = po.spending_usd ?? po.spendingUsd ?? po.totalUsd;
  return {
    id: po.id,
    poNumber: po.po_number || po.poNumber || po.po_no,
    date: rawDate ? String(rawDate).split('T')[0] : '-',
    supplier: po.supplier_name || po.supplier || suppliersMap[po.supplier_id] || '-',
    supplier_id: po.supplier_id,
    totalCost: Number(po.spending_idr ?? po.spendingIdr ?? po.total_amount ?? po.totalCost ?? 0), // IDR
    totalUsd: usd === undefined || usd === null ? null : Number(usd),
    status: po.status || po.order_status || 'Pending',
    // Kategori dari Product Group (mis. "RM - Plastic"); 0/kosong = belum diklasifikasi
    category: [po.category, po.product_group, po.productGroup].find((v) => v && String(v) !== '0') || 'Others',
    notes: po.description || po.notes || '',
    items: po.items || []
  };
};

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
  // Spending USD dari tabel sudah memakai kurs per tahun -> pakai langsung
  if (Number.isFinite(order.totalUsd) && order.totalUsd > 0) return order.totalUsd;
  const possibleKeys = [
    'total_amount', 'totalAmount', 'TotalAmount',
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

  // Konversi dari IDR ke USD memakai kurs sesuai tahun order (bukan kurs flat)
  const year = getOrderDate(order) ? new Date(getOrderDate(order)).getFullYear() : undefined;
  return totalIDR / getKurs(year);
};

const getOrderDate = (order) => order.order_date || order.date || order.tanggal || order.orderDate || order.tanggalPesanan || '';
const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || 'Others';
const getOrderStatus = (order) => order.order_status || order.status || order.statusPesanan || order.orderStatus || '';
const getOrderSupplier = (order) => order.supplier_name || order.supplier || order.namaSupplier || order.vendor || order.nama_supplier || 'Unknown Supplier';

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

// Rounded Top Bar Generator (SUDAH DIPERBAIKI)
const generateRoundedBar = (x, y, w, h, r) => {
  if (h <= 0) return `M ${x},${y} h ${w} v 0 h -${w} Z`;
  
  // Proteksi: Jika tinggi batang lebih kecil dari radius, matikan radius agar SVG tidak meluber
  const radius = h < r ? 0 : Math.min(r, w / 2);
  
  // Jika radius 0, gambar kotak biasa (Rect)
  if (radius === 0) {
    return `M ${x},${y + h} L ${x},${y} L ${x + w},${y} L ${x + w},${y + h} Z`;
  }
  
  // Perbaikan bug Arc: Akhiri arc top-right di (y + radius), lalu sambung garis lurus ke bawah (y + h)
  return `M ${x},${y + h} L ${x},${y + radius} A ${radius},${radius} 0 0,1 ${x + radius},${y} L ${x + w - radius},${y} A ${radius},${radius} 0 0,1 ${x + w},${y + radius} L ${x + w},${y + h} Z`;
};

export default function Analytics({ changePage, onLogout }) {
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  // === 1. STATE MANAGEMENT ===
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [suppliersMap, setSuppliersMap] = useState({});
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [isAnalyticsMenuOpen, setIsAnalyticsMenuOpen] = useState(true);
  // State untuk Filter Tahun Dinamis
  const [selectedYear, setSelectedYear] = useState('All');
  const profileRef = useRef(null);
  
  // === 3. UI & PROFILE STATE ===
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : false;
  });

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // State untuk Supplier & Tab Baru
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierSearchRef = useRef(null);
  const [activeTab, setActiveTab] = useState('overview');

  // State untuk Compare Supplier
  const MAX_COMPARE_SUPPLIERS = 6;
  const COMPARE_SUPPLIER_COLORS = ['#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777'];
  const [compareSuppliers, setCompareSuppliers] = useState([]);
  const [compareSupplierSearch, setCompareSupplierSearch] = useState('');
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const compareSearchRef = useRef(null);
  
  // State untuk Category Breakdown
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Tab Navigation yang sudah digabung
  const analyticsTabs = [
    { id: 'overview', label: 'Overview & Trend', icon: 'fa-chart-line' },
    { id: 'supplier', label: 'Supplier Analysis', icon: 'fa-users' },
    { id: 'compareSupplier', label: 'Compare Supplier', icon: 'fa-scale-balanced' },
    { id: 'category', label: 'Category Breakdown', icon: 'fa-tags' },
  ];

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  const profile = useMemo(() => {
    if (user) {
      return {
        name: user.username || user.name || 'User',
        email: user.email || '-',
        role: user.role || (user.role_id === 1 ? 'Administrator' : 'User')
      };
    }
    const savedProfile = localStorage.getItem('appProfile');
    return savedProfile ? JSON.parse(savedProfile) : {
      name: 'Admin',
      email: 'admin@detpak.com',
      role: 'Administrator'
    };
  }, [user]);

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

  // Fetch Supplier list (Samakan dengan Dashboard)
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.SUPPLIERS);
        if (response.ok) {
          const data = await response.json();
          const map = {};
          (Array.isArray(data) ? data : []).forEach((s) => {
            const name = s.name || s.nama || s.perusahaan || s.supplier_name || s.supplier;
            if (s.id !== undefined && name) {
              map[s.id] = name;
            }
          });
          setSuppliersMap(map);
        }
      } catch (e) {
        console.error('Failed to fetch Supplier data:', e);
      }
    };
    fetchSuppliers();
  }, []);

  // Load PO Data
  useEffect(() => {
    const loadFromCache = () => {
      try {
        const savedPOs = localStorage.getItem('dataPO_Ladeu');
        if (savedPOs) {
          const parsedData = JSON.parse(savedPOs).map((po) => toOrder(po, suppliersMap));
          setOrders(parsedData);
          if (parsedData.length > 0) setSelectedSupplier(getOrderSupplier(parsedData[0]));
        }
      } catch (fallbackError) {}
    };

    const fetchOrdersFromBackend = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS);
        if (response.ok) {
          const data = await response.json();
          const formattedOrders = data.map((po) => toOrder(po, suppliersMap));

          setOrders(formattedOrders);
          if (formattedOrders.length > 0) {
            saveOrdersCache(formattedOrders);
            setSelectedSupplier(getOrderSupplier(formattedOrders[0]));
          }
        } else {
          loadFromCache();
        }
      } catch (e) {
        loadFromCache();
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrdersFromBackend();
  }, [suppliersMap]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
      if (supplierSearchRef.current && !supplierSearchRef.current.contains(event.target)) {
        setShowSupplierDropdown(false);
      }
      if (compareSearchRef.current && !compareSearchRef.current.contains(event.target)) {
        setShowCompareDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set();
    orders.forEach((o) => {
      const yr = getYearFromOrder(o);
      if (yr) years.add(yr);
    });
    return ['All', ...Array.from(years).sort((a, b) => b - a)];
  }, [orders]);

  const comparisonYears = useMemo(() => {
    let current = new Date().getFullYear(); 
    if (selectedYear !== 'All') {
      current = parseInt(selectedYear);
    } else if (availableYears.length > 1) {
      current = availableYears[1]; 
    }
    return { current, previous: current - 1 };
  }, [selectedYear, availableYears]);

  const analyticsStats = useMemo(() => {
    let totalSpend = 0, completedCount = 0, canceledCount = 0, totalOrdersCount = 0;
    orders.forEach((o) => {
      const yr = getYearFromOrder(o);
      if (selectedYear !== 'All' && yr !== parseInt(selectedYear)) return;

      const costUSD = getOrderTotal(o);
      const status = getOrderStatus(o).toLowerCase();

      totalSpend += costUSD;
      totalOrdersCount++;

      if (status.includes('selesai') || status.includes('paid') || status.includes('lunas') || status.includes('completed')) completedCount++;
      if (status.includes('batal') || status.includes('cancel')) canceledCount++;
    });

    const completionRate = totalOrdersCount > 0 ? Math.round((completedCount / totalOrdersCount) * 100) : 0;
    return { totalSpend, completionRate, canceledCount, totalOrdersCount };
  }, [orders, selectedYear]);

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

  const supplierList = useMemo(() => {
    const names = orders.map(o => getOrderSupplier(o)).filter(Boolean);
    return [...new Set(names)].sort();
  }, [orders]);

  const filteredSupplierList = useMemo(() => {
    const q = supplierSearchQuery.trim().toLowerCase();
    if (!q) return supplierList;
    return supplierList.filter((sup) => sup.toLowerCase().includes(q));
  }, [supplierList, supplierSearchQuery]);

  useEffect(() => {
    if (supplierList.length > 0 && !supplierList.includes(selectedSupplier)) {
      setSelectedSupplier(supplierList[0]);
    }
  }, [supplierList, selectedSupplier]);

  useEffect(() => {
    setSupplierSearchQuery(selectedSupplier || '');
  }, [selectedSupplier]);

  const handleSelectSupplier = (sup) => {
    setSelectedSupplier(sup);
    setSupplierSearchQuery(sup);
    setShowSupplierDropdown(false);
  };

  // === COMPARE SUPPLIER: helpers & data ===
  const compareSupplierOptions = useMemo(() => {
    const q = compareSupplierSearch.trim().toLowerCase();
    return supplierList.filter((sup) => !compareSuppliers.includes(sup) && (!q || sup.toLowerCase().includes(q)));
  }, [supplierList, compareSupplierSearch, compareSuppliers]);

  const handleAddCompareSupplier = (sup) => {
    setCompareSuppliers((prev) => (prev.includes(sup) || prev.length >= MAX_COMPARE_SUPPLIERS ? prev : [...prev, sup]));
    setCompareSupplierSearch('');
    setShowCompareDropdown(false);
  };

  const handleRemoveCompareSupplier = (sup) => {
    setCompareSuppliers((prev) => prev.filter((s) => s !== sup));
  };

  const compareSupplierData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const rows = compareSuppliers.map((sup, idx) => {
      let totalSpend = 0;
      let totalOrders = 0;
      const monthly = new Array(12).fill(0);

      orders.forEach((order) => {
        if (getOrderSupplier(order) !== sup) return;
        const yr = getYearFromOrder(order);
        if (selectedYear !== 'All' && yr !== parseInt(selectedYear)) return;

        const cost = getOrderTotal(order);
        totalSpend += cost;
        totalOrders += 1;

        const dateStr = getOrderDate(order);
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) monthly[d.getMonth()] += cost;
        }
      });

      return {
        name: sup,
        color: COMPARE_SUPPLIER_COLORS[idx % COMPARE_SUPPLIER_COLORS.length],
        totalSpend,
        totalOrders,
        avgPO: totalOrders > 0 ? totalSpend / totalOrders : 0,
        monthly
      };
    });

    const combinedTotal = rows.reduce((sum, r) => sum + r.totalSpend, 0);
    const maxSpend = Math.max(...rows.map((r) => r.totalSpend), 1);
    const maxMonthly = Math.max(...rows.flatMap((r) => r.monthly), 1);

    return { months, rows, combinedTotal, maxSpend, maxMonthly };
  }, [orders, compareSuppliers, selectedYear]);

  const supplierAnalysisData = useMemo(() => {
    const totalsPrev = new Array(12).fill(0);
    const totalsCurrent = new Array(12).fill(0);
    let totalYearPrev = 0, totalYearCurrent = 0;

    if (selectedSupplier) {
      orders.forEach((order) => {
        if (getOrderSupplier(order) === selectedSupplier) {
          const yr = getYearFromOrder(order);
          const costUSD = getOrderTotal(order);
          const monthIdx = getOrderDate(order) ? new Date(getOrderDate(order)).getMonth() : 0;
          if (yr === comparisonYears.previous) { totalsPrev[monthIdx] += costUSD; totalYearPrev += costUSD; }
          if (yr === comparisonYears.current) { totalsCurrent[monthIdx] += costUSD; totalYearCurrent += costUSD; }
        }
      });
    }

    let overallYoy = 0;
    if (totalYearPrev > 0) overallYoy = ((totalYearCurrent - totalYearPrev) / totalYearPrev) * 100;
    else if (totalYearCurrent > 0) overallYoy = 100; 

    const monthlyYoy = totalsCurrent.map((valCurr, idx) => {
      const valPrev = totalsPrev[idx];
      if (valPrev === 0 && valCurr === 0) return 0;
      if (valPrev === 0 && valCurr > 0) return 100;
      return ((valCurr - valPrev) / valPrev) * 100;
    });

    const maxSpend = Math.max(...totalsPrev, ...totalsCurrent, 100); 
    
    return { 
        totalYearPrev, totalYearCurrent, overallYoy, totalsPrev, totalsCurrent, monthlyYoy, maxSpend,
        months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    };
  }, [orders, selectedSupplier, comparisonYears]);

  const avgCategoryData = useMemo(() => {
    const catMap = {};
    orders.forEach((order) => {
      const yr = getYearFromOrder(order);
      if (selectedYear !== 'All' && yr !== parseInt(selectedYear)) return;

      const cat = getOrderCategory(order);
      const costUSD = getOrderTotal(order);

      // Satu PO bisa punya banyak baris (line) -> hitung jumlah PO unik, bukan jumlah baris
      if (!catMap[cat]) catMap[cat] = { totalCost: 0, poSet: new Set() };
      catMap[cat].totalCost += costUSD;
      catMap[cat].poSet.add(order.poNumber || `row-${order.id}`);
    });

    return Object.keys(catMap).map((catName) => {
      const count = catMap[catName].poSet.size;
      return {
        category: catName,
        avgCost: count > 0 ? catMap[catName].totalCost / count : 0,
        count
      };
    });
  }, [orders, selectedYear]);

  // === LOGIKA DATA BREAKDOWN KATEGORI ===
  const categoryBreakdownData = useMemo(() => {
    if (!selectedCategory) return [];
    
    return orders.filter(o => {
      const yr = getYearFromOrder(o);
      const isYearMatch = selectedYear === 'All' || yr === parseInt(selectedYear);
      const isCategoryMatch = getOrderCategory(o) === selectedCategory;
      return isYearMatch && isCategoryMatch;
    });
  }, [orders, selectedCategory, selectedYear]);

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>

      {/* TOP LOADING BAR (muncul selama data Purchase Orders masih di-fetch dari backend) */}
      {isLoading && (
        <>
          <style>{`
            @keyframes dpkLoadingBar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(400%); }
            }
          `}</style>
          <div className="fixed top-0 left-0 w-full h-[3px] z-[100] overflow-hidden bg-transparent">
            <div
              className="h-full w-1/4 bg-red-600 rounded-full"
              style={{ animation: 'dpkLoadingBar 1.1s linear infinite' }}
            />
          </div>
        </>
      )}

      {/* HEADER UTAMA */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
              <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage?.('dashboard')}>
                <img src="/images/logo.png" alt="Detpak Logo" className="h-12 w-auto object-contain" />
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
            >
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
            
            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-lg text-base font-semibold ${isDarkMode ? 'bg-[#1E293B] text-slate-200 border-slate-700' : 'bg-[#F3F4F6] text-[#4A5568] border-gray-200'}`}>
              <i className="fa-regular fa-clock text-blue-500"></i>
              <span>{formattedTime}</span>
            </div>

            <div className="relative" ref={profileRef}>
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:bg-gray-900'}`}>
                {profile.name} <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>
              
              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      {(profile.name || 'AD').substring(0, 2).toUpperCase()}
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
{/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 transition-colors duration-200 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
          <nav className="flex flex-col gap-2 px-4">
            
            {/* Navigasi Standard */}
            <button onClick={() => handleNavigate('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => handleNavigate('suppliers')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => handleNavigate('purchaseOrders')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            
            {/* PARENT: Analytics */}
            <div>
              <button 
                onClick={() => setIsAnalyticsMenuOpen((prev) => !prev)} 
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-white bg-[#004797] rounded-xl transition-colors text-left cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
                </div>
                <i className={`fa-solid fa-chevron-${isAnalyticsMenuOpen ? 'down' : 'right'} text-xs transition-transform duration-200`}></i>
              </button>

              {/* CHILD: Analytics Sub-menus */}
              {isAnalyticsMenuOpen && (
                <div className={`ml-4 pl-3 border-l-2 mt-1 flex flex-col gap-1 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  {analyticsTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left cursor-pointer ${
                        activeTab === tab.id
                          ? isDarkMode ? 'text-slate-200 bg-slate-800/50' : 'text-gray-800 bg-gray-100'
                          : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      <i className={`fa-solid ${tab.icon} w-4 text-center`}></i> {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Menu Lainnya */}
            <button onClick={() => handleNavigate('report')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => handleNavigate('settings')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button onClick={() => handleNavigate('userManagement')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-amber-400 hover:bg-slate-800/80 hover:text-amber-300' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'}`}>
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
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>In-depth analysis converted to USD</p>
            </div>
          </div>

          {/* OVERVIEW & TREND */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-5">
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
                    <path d={generateSvgPath(yoyChartData.totalsPrev, yoyChartData.maxVal)} fill="none" stroke="#64748B" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
                    <path d={generateSvgPath(yoyChartData.totalsCurrent, yoyChartData.maxVal)} fill="none" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0px 3px 4px rgba(220, 38, 38, 0.2))' }} />
                    {yoyChartData.months.map((m, idx) => {
                      const x = (idx / 11) * 920 + 40;
                      const yCurrent = 190 - (yoyChartData.totalsCurrent[idx] / yoyChartData.maxVal) * 160;
                      return (
                        <g key={idx}>
                          <circle cx={x} cy={yCurrent} r="5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#DC2626" strokeWidth="3" />
                          <text x={x} y="222" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>{m}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* SUPPLIER ANALYSIS (YoY) */}
          {activeTab === 'supplier' && (
          <div className={`p-6 rounded-2xl border shadow-xs space-y-6 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div>
               <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Supplier Analysis (YoY in USD)</h3>
               <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Select a supplier to compare USD spending between {comparisonYears.previous} and {comparisonYears.current}</p>
            </div>

            <div className="max-w-xs relative" ref={supplierSearchRef}>
               <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Select Supplier</label>
               <div className="relative">
                 <i className={`fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}></i>
                 <input
                   type="text"
                   value={supplierSearchQuery}
                   onChange={(e) => { setSupplierSearchQuery(e.target.value); setShowSupplierDropdown(true); }}
                   onFocus={() => setShowSupplierDropdown(true)}
                   placeholder="Search supplier..."
                   className={`w-full text-sm rounded-lg block p-2.5 pl-8 outline-none transition-shadow ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} border`}
                 />
               </div>
               {showSupplierDropdown && (
                 <div className={`absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border shadow-lg ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-white border-gray-200'}`}>
                   {filteredSupplierList.length === 0 ? (
                     <div className={`px-3 py-2 text-sm ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                       {supplierList.length === 0 ? 'No supplier data available' : `No suppliers match "${supplierSearchQuery}"`}
                     </div>
                   ) : (
                     filteredSupplierList.map((sup, idx) => (
                       <div
                         key={idx}
                         onClick={() => handleSelectSupplier(sup)}
                         className={`px-3 py-2 text-sm cursor-pointer transition-colors ${sup === selectedSupplier ? (isDarkMode ? 'bg-red-600/20 text-red-400' : 'bg-red-50 text-red-600') : (isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100')}`}
                       >
                         {sup}
                       </div>
                     ))
                   )}
                 </div>
               )}
            </div>

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
                     {supplierAnalysisData.overallYoy >= 0 ? <i className="fa-solid fa-arrow-trend-up text-sm"></i> : <i className="fa-solid fa-arrow-trend-down text-sm"></i>}
                     {Math.abs(supplierAnalysisData.overallYoy).toFixed(2)}%
                  </div>
               </div>
            </div>

            <div>
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                  <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Monthly Spending Comparison (YoY) - {selectedSupplier || 'Supplier'}</h4>
                  <div className={`flex flex-wrap items-center gap-4 text-[11px] font-semibold ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                     <div className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-slate-500' : 'bg-gray-400'}`}></div>{comparisonYears.previous} ($)</div>
                     <div className="flex items-center gap-1.5 text-red-500"><div className="w-3 h-3 rounded bg-red-400"></div>{comparisonYears.current} ($)</div>
                     <div className="flex items-center gap-1.5 ml-2">
                        <div className="w-6 h-0.5 relative flex items-center justify-center bg-amber-500"><div className="w-2.5 h-2.5 rounded-full absolute bg-white border-[2px] border-amber-500"></div></div>
                        <span className="text-amber-500">% YoY Change</span>
                     </div>
                  </div>
               </div>

               <div className="w-full h-72 relative mt-4">
                  <svg viewBox="0 0 1000 280" className="w-full h-full overflow-visible font-sans">
                     <defs>
                        <linearGradient id="barPrev" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor={isDarkMode ? '#94A3B8' : '#9CA3AF'} stopOpacity="1"/>
                           <stop offset="100%" stopColor={isDarkMode ? '#475569' : '#6B7280'} stopOpacity="1"/>
                        </linearGradient>
                        <linearGradient id="barCurr" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor="#F87171" stopOpacity="1"/>
                           <stop offset="100%" stopColor="#DC2626" stopOpacity="1"/>
                        </linearGradient>
                        <filter id="lineShadow" x="-10%" y="-10%" width="120%" height="120%">
                           <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.15"/>
                        </filter>
                     </defs>

                     {[100, 75, 50, 25, 0].map((pct, i) => {
                        const y = 30 + i * 50;
                        const val = (supplierAnalysisData.maxSpend * pct) / 100;
                        const isZeroLine = pct === 0;
                        return (
                           <g key={`grid-${i}`}>
                              <line x1="60" y1={y} x2="940" y2={y} stroke={isZeroLine ? (isDarkMode ? '#64748B' : '#9CA3AF') : (isDarkMode ? '#334155' : '#E5E7EB')} strokeDasharray={isZeroLine ? "0" : "4 4"} strokeWidth={isZeroLine ? "2" : "1"} />
                              <text x="50" y={y + 4} textAnchor="end" className={`text-[10px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>{formatShortNumber(val)}</text>
                           </g>
                        );
                     })}
                     <text x="50" y="15" textAnchor="end" className={`text-[10px] font-bold ${isDarkMode ? 'fill-slate-200' : 'fill-gray-800'}`}>Spend ($)</text>

                     {[150, 100, 50, 0, -50].map((pct, i) => (
                         <text key={`pct-${i}`} x="950" y={30 + i * 50 + 4} textAnchor="start" className={`text-[10px] ${isDarkMode ? 'fill-amber-500' : 'fill-amber-600'}`}>{pct}%</text>
                     ))}
                     <text x="950" y="15" textAnchor="start" className={`text-[10px] font-bold ${isDarkMode ? 'fill-amber-400' : 'fill-amber-600'}`}>% YoY Change</text>

                     <line x1="60" y1="180" x2="940" y2="180" stroke={isDarkMode ? '#475569' : '#D1D5DB'} strokeWidth="1.5" strokeDasharray="6 4" />

                     {supplierAnalysisData.months.map((m, idx) => {
                        const xCenter = 60 + (idx * (880 / 11));
                        const hPrev = isNaN((supplierAnalysisData.totalsPrev[idx] / supplierAnalysisData.maxSpend) * 200) ? 0 : (supplierAnalysisData.totalsPrev[idx] / supplierAnalysisData.maxSpend) * 200;
                        const hCurr = isNaN((supplierAnalysisData.totalsCurrent[idx] / supplierAnalysisData.maxSpend) * 200) ? 0 : (supplierAnalysisData.totalsCurrent[idx] / supplierAnalysisData.maxSpend) * 200;
                        const yPrev = 230 - hPrev, yCurr = 230 - hCurr, barWidth = 20, gap = 4;
                        let xPrev = xCenter - barWidth - (gap / 2), xCurr = xCenter + (gap / 2);
                        if (hPrev > 0 && hCurr === 0) { xPrev = xCenter - (barWidth / 2); xCurr = xCenter; } 
                        else if (hPrev === 0 && hCurr > 0) { xPrev = xCenter; xCurr = xCenter - (barWidth / 2); }

                        return (
                           <g key={`bars-${idx}`}>
                              {hPrev > 0 && <path d={generateRoundedBar(xPrev, yPrev, barWidth, hPrev, 4)} fill="url(#barPrev)" />}
                              {hCurr > 0 && <path d={generateRoundedBar(xCurr, yCurr, barWidth, hCurr, 4)} fill="url(#barCurr)" />}
                              <text x={xCenter} y="250" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-600'}`}>{m}</text>
                           </g>
                        );
                     })}

                     {(() => {
                        const linePoints = supplierAnalysisData.months.map((m, idx) => {
                           let yoy = supplierAnalysisData.monthlyYoy[idx];
                           if (yoy > 150) yoy = 150; if (yoy < -50) yoy = -50;
                           return { x: 60 + (idx * (880 / 11)), y: 230 - (yoy + 50), yoyRaw: supplierAnalysisData.monthlyYoy[idx] };
                        });
                        return (
                           <g>
                              <path d={generateSmoothSvgPath(linePoints)} fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#lineShadow)" />
                              {linePoints.map((pt, idx) => (
                                 <g key={`dot-${idx}`}>
                                    <circle cx={pt.x} cy={pt.y} r="5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#F59E0B" strokeWidth="2.5" />
                                    {pt.yoyRaw !== 0 && !isNaN(pt.yoyRaw) && <text x={pt.x} y={pt.y - 14} textAnchor="middle" className={`text-[10px] font-bold ${isDarkMode ? 'fill-amber-400' : 'fill-amber-600'}`}>{pt.yoyRaw > 0 ? '+' : ''}{pt.yoyRaw.toFixed(0)}%</text>}
                                 </g>
                              ))}
                           </g>
                        );
                     })()}
                  </svg>
               </div>
            </div>
          </div>
          )}

          {/* CATEGORY BREAKDOWN */}
          {activeTab === 'category' && (
          <div className="grid grid-cols-1 gap-6">
            <div className={`p-6 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              
              {!selectedCategory ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Average PO Value by Category (USD)</h3>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Click on any category to view its breakdown details</p>
                    </div>
                  </div>

                  {avgCategoryData.length === 0 ? (
                    <div className={`h-48 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-700 text-slate-500' : 'bg-gray-50/50 border-gray-200 text-gray-400'}`}>
                      No category data available for selected year
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                      {avgCategoryData.map((item, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedCategory(item.category)}
                          className={`p-4 cursor-pointer rounded-xl border flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-md ${isDarkMode ? 'bg-[#0F172A] border-slate-700 hover:border-blue-500' : 'bg-gray-50 border-gray-200/80 hover:border-blue-500 hover:bg-blue-50/50'}`}
                        >
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
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <button 
                        onClick={() => setSelectedCategory(null)}
                        className={`mb-2 text-sm font-semibold flex items-center gap-2 transition-colors ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                      >
                        <i className="fa-solid fa-arrow-left"></i> Back to Categories
                      </button>
                      <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Breakdown: {selectedCategory}
                      </h3>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Showing all POs under {selectedCategory} for {selectedYear === 'All' ? 'All Time' : selectedYear}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200/60 dark:border-slate-700">
                    <table className={`w-full text-left text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                      <thead className={`text-xs uppercase bg-gray-50 dark:bg-slate-800/50 border-b ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
                        <tr>
                          <th className="px-4 py-3 font-semibold">PO Number</th>
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Supplier</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold text-right">Value (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryBreakdownData.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="text-center py-6">No data found.</td>
                          </tr>
                        ) : (
                          categoryBreakdownData.map((order, i) => (
                            <tr key={i} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/30' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <td className="px-4 py-3 font-medium">{order.poNumber || '-'}</td>
                              <td className="px-4 py-3">{order.date || '-'}</td>
                              <td className="px-4 py-3">{getOrderSupplier(order)}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                                  {getOrderStatus(order) || 'Pending'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-red-500">
                                {formatUSD(getOrderTotal(order))}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
          )}

          {/* COMPARE SUPPLIER */}
          {activeTab === 'compareSupplier' && (
          <div className={`p-6 rounded-2xl border shadow-xs space-y-6 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div>
              <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Compare Supplier (USD)</h3>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                Pilih hingga {MAX_COMPARE_SUPPLIERS} supplier untuk dibandingkan spend-nya {selectedYear === 'All' ? '(All Time)' : `di tahun ${selectedYear}`}.
              </p>
            </div>

            {/* PICKER */}
            <div className="max-w-md relative" ref={compareSearchRef}>
              <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Tambah Supplier</label>
              <div className="relative">
                <i className={`fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}></i>
                <input
                  type="text"
                  value={compareSupplierSearch}
                  onChange={(e) => { setCompareSupplierSearch(e.target.value); setShowCompareDropdown(true); }}
                  onFocus={() => setShowCompareDropdown(true)}
                  disabled={compareSuppliers.length >= MAX_COMPARE_SUPPLIERS}
                  placeholder={compareSuppliers.length >= MAX_COMPARE_SUPPLIERS ? `Maksimal ${MAX_COMPARE_SUPPLIERS} supplier` : 'Cari & tambah supplier...'}
                  className={`w-full text-sm rounded-lg block p-2.5 pl-8 outline-none transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} border`}
                />
              </div>
              {showCompareDropdown && compareSuppliers.length < MAX_COMPARE_SUPPLIERS && (
                <div className={`absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border shadow-lg ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-white border-gray-200'}`}>
                  {compareSupplierOptions.length === 0 ? (
                    <div className={`px-3 py-2 text-sm ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      {supplierList.length === 0 ? 'No supplier data available' : 'No matching suppliers'}
                    </div>
                  ) : (
                    compareSupplierOptions.map((sup, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleAddCompareSupplier(sup)}
                        className={`px-3 py-2 text-sm cursor-pointer transition-colors ${isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {sup}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* SELECTED PILLS */}
            {compareSupplierData.rows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {compareSupplierData.rows.map((row) => (
                  <span
                    key={row.name}
                    className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold border ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }}></span>
                    {row.name}
                    <button
                      onClick={() => handleRemoveCompareSupplier(row.name)}
                      className={`ml-1 rounded-full w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {compareSupplierData.rows.length === 0 ? (
              <div className={`h-48 flex items-center justify-center text-sm text-center px-6 border border-dashed rounded-xl ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-700 text-slate-500' : 'bg-gray-50/50 border-gray-200 text-gray-400'}`}>
                Belum ada supplier dipilih. Cari &amp; tambahkan minimal 2 supplier di atas untuk mulai membandingkan.
              </div>
            ) : (
              <>
                {/* SUMMARY TABLE */}
                <div className="overflow-x-auto rounded-lg border border-gray-200/60 dark:border-slate-700">
                  <table className={`w-full text-left text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                    <thead className={`text-xs uppercase bg-gray-50 dark:bg-slate-800/50 border-b ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
                      <tr>
                        <th className="px-4 py-3 font-semibold">Supplier</th>
                        <th className="px-4 py-3 font-semibold text-right">Total Spend (USD)</th>
                        <th className="px-4 py-3 font-semibold text-right">Total Orders</th>
                        <th className="px-4 py-3 font-semibold text-right">Avg PO Value</th>
                        <th className="px-4 py-3 font-semibold text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...compareSupplierData.rows].sort((a, b) => b.totalSpend - a.totalSpend).map((row) => (
                        <tr key={row.name} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/30' : 'border-gray-100 hover:bg-gray-50'}`}>
                          <td className="px-4 py-3 font-semibold">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }}></span>
                              {row.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-red-500">{formatUSD(row.totalSpend)}</td>
                          <td className="px-4 py-3 text-right">{row.totalOrders.toLocaleString('en-US')}</td>
                          <td className="px-4 py-3 text-right">{formatUSD(row.avgPO)}</td>
                          <td className="px-4 py-3 text-right">
                            {compareSupplierData.combinedTotal > 0 ? ((row.totalSpend / compareSupplierData.combinedTotal) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TOTAL SPEND BAR COMPARISON */}
                <div>
                  <h4 className={`font-bold text-sm mb-4 ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Total Spend Comparison</h4>
                  <div className="space-y-3">
                    {[...compareSupplierData.rows].sort((a, b) => b.totalSpend - a.totalSpend).map((row) => {
                      const pct = compareSupplierData.maxSpend > 0 ? (row.totalSpend / compareSupplierData.maxSpend) * 100 : 0;
                      return (
                        <div key={row.name}>
                          <div className="flex items-center justify-between mb-1 text-xs font-semibold">
                            <span className={isDarkMode ? 'text-slate-300' : 'text-gray-700'}>{row.name}</span>
                            <span className={isDarkMode ? 'text-slate-400' : 'text-gray-500'}>{formatUSD(row.totalSpend)}</span>
                          </div>
                          <div className={`w-full h-3 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: row.color }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* MONTHLY TREND MULTI-LINE CHART */}
                <div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                    <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                      Monthly Trend {selectedYear === 'All' ? '(All Time, gabungan per bulan)' : `(${selectedYear})`}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                      {compareSupplierData.rows.map((row) => (
                        <div key={row.name} className="flex items-center gap-1.5" style={{ color: row.color }}>
                          <span className="w-3 h-3 rounded" style={{ backgroundColor: row.color }}></span>{row.name}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="w-full h-64 relative">
                    <svg viewBox="0 0 1000 240" className="w-full h-full overflow-visible">
                      {[4, 3, 2, 1, 0].map((step, i) => {
                        const y = 30 + i * 40;
                        const gridVal = (compareSupplierData.maxMonthly * step) / 4;
                        return (
                          <g key={i}>
                            <line x1="40" y1={y} x2="960" y2={y} stroke={isDarkMode ? '#334155' : '#F3F4F6'} strokeDasharray="4 4" />
                            <text x="30" y={y + 4} textAnchor="end" className={`text-[10px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>
                              {formatShortNumber(gridVal)}
                            </text>
                          </g>
                        );
                      })}
                      {compareSupplierData.rows.map((row) => (
                        <path
                          key={row.name}
                          d={generateSvgPath(row.monthly, compareSupplierData.maxMonthly)}
                          fill="none"
                          stroke={row.color}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      ))}
                      {compareSupplierData.months.map((m, idx) => {
                        const x = (idx / 11) * 920 + 40;
                        return (
                          <text key={idx} x={x} y="222" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>{m}</text>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </main>
      </div>
    </div>
  );
}