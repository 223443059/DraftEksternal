import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../hooks/useTheme';
import { API_ENDPOINTS } from '../utils/api.config';

// === CONVERSION RATE ===
const KURS_IDR_TO_USD = 15500;

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

export default function Dashboard({ changePage, activePage = 'dashboard', onLogout }) {
  // === 1. STATE MANAGEMENT ===
  const [orders, setOrders] = useState([]);
  const [suppliersMap, setSuppliersMap] = useState({});
  const [supplierParetoTab, setSupplierParetoTab] = useState('top20');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState('All'); 

  // User and permission from RoleContext
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');
  
  // Dark/Light Mode State
  const [isDarkMode, setIsDarkMode] = useTheme();

  // Drill-down 3 Level State (Pie Chart)
  const [drillLevel, setDrillLevel] = useState(0); 
  const [selectedGroup, setSelectedGroup] = useState(null); 
  const [selectedSubCategory, setSelectedSubCategory] = useState(null); 

  // Bar Chart Drill-down State
  const [barChartGroup, setBarChartGroup] = useState(null); 

  // Pareto Category Modal State
  const [showCategoryPareto, setShowCategoryPareto] = useState(false);
  const [selectedCategoryForPareto, setSelectedCategoryForPareto] = useState(null);

  // Profile Fallback & Notification State
  const [showProfileCard, setShowProfileCard] = useState(false);
  const profileRef = useRef(null);

  // Real-time Clock for Header
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  // Fetch Supplier list
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
        console.error('Failed to fetch Supplier data from database:', e);
      }
    };
    fetchSuppliers();
  }, []);

  // Fetch Purchase Orders
  useEffect(() => {
    // Baris API (snake_case, kolom tabel purchase_orders) atau cache PurchaseOrders.jsx (camelCase)
    // -> bentuk objek yang dipakai Dashboard
    const toOrder = (po) => {
      const rawDate = po.receipt_date || po.receiptDate || po.po_date || po.order_date || po.date;
      return {
        id: po.id,
        poNumber: po.po_number || po.poNumber || po.po_no,
        date: rawDate ? String(rawDate).split('T')[0] : '-',
        supplier: po.supplier_name || po.supplier || suppliersMap[po.supplier_id] || '-',
        supplier_id: po.supplier_id,
        totalCost: Number(po.spending_idr ?? po.spendingIdr ?? po.total_amount ?? po.totalCost ?? 0),
        status: po.status || po.order_status || 'Pending',
        // Kategori dari Product Group (mis. "RM - Plastic", "SP - Spare Parts"); 0/kosong = belum diklasifikasi
        category: [po.category, po.product_group, po.productGroup].find((v) => v && String(v) !== '0') || 'Other',
        origin: po.local_import || po.localImport || po.origin || '',
        notes: po.description || po.notes || '',
        description: po.description || po.notes || '',
        part: po.part || '',
        items: po.items || []
      };
    };

    const loadFromLocalCache = () => {
      try {
        const cached = localStorage.getItem('dataPO_Ladeu');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOrders(parsed.map(toOrder));
          }
        }
      } catch (e) {
        console.error('Failed to read PO cache from localStorage:', e);
      }
    };

    const fetchOrdersFromBackend = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS);
        if (response.ok) {
          const data = await response.json();
          const formattedOrders = data.map(toOrder);
          setOrders(formattedOrders);
          
          if (formattedOrders.length > 0) {
            saveOrdersCache(formattedOrders);
          }
        } else {
          loadFromLocalCache();
        }
      } catch (e) {
        console.error('Failed to fetch Purchase Orders from database:', e);
        loadFromLocalCache();
      }
    };

    loadFromLocalCache();
    fetchOrdersFromBackend();
  }, [suppliersMap]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (onLogout) onLogout();
    else if (changePage) changePage('login');
  };

  // === 2. DATA HELPER GETTERS ===
  const getOrderTotal = (order) => {
    if (!order) return 0;
    const possibleKeys = [
      'totalCost', 'TotalCost', 'total_cost',
      'totalNilai', 'TotalNilai', 'total_nilai',
      'grandTotal', 'total', 'totalHarga', 'harga', 'nilai'
    ];

    let rawValue = undefined;
    for (const key of possibleKeys) {
      if (order[key] !== undefined && order[key] !== null && order[key] !== '') {
        rawValue = order[key];
        break;
      }
    }

    if ((rawValue === undefined || rawValue === 0) && order.items && Array.isArray(order.items) && order.items.length > 0) {
      let calc = 0;
      order.items.forEach((item) => {
        let q = parseFloat(item.qty || item.quantity || 1);
        let p = item.hargaSatuan || item.price || item.harga || 0;
        if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9]/g, '')) || 0;
        calc += q * p;
      });
      if (calc > 0) return calc;
    }

    if (typeof rawValue === 'string') {
      let cleanText = rawValue.replace(/Rp/gi, '').replace(/\s/g, '').replace(/\./g, '');
      cleanText = cleanText.replace(/,/g, '.');
      return parseFloat(cleanText) || 0;
    }

    return parseFloat(rawValue) || 0;
  };

  const getOrderDate = (order) => order.date || order.tanggal || order.orderDate || order.tanggalPesanan || '-';
  const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || 'Other';
  // Nama item = kolom Description di halaman Purchase Orders (kalau kosong: Part)
  const getOrderItemName = (order) => {
    const desc = String(order.description || order.notes || '').replace(/\s+/g, ' ').trim();
    if (desc) return desc;
    const part = String(order.part || '').replace(/\s+/g, ' ').trim();
    return part || 'No Description';
  };
  const getOrderSupplier = (order) => order.supplier || order.supplierName || order.namaSupplier || '-';
  const getOrderStatus = (order) => order.status || order.statusPesanan || order.orderStatus || 'Pending';
  const getPoNumber = (order) => order.poNumber || order.noPO || order.nomorPO || '-';

  const getOrderOrigin = (order) => {
    if (order.origin) return order.origin;
    if (order.asal) return order.asal;
    if (order.isImport) return 'Import';
    if (order.isLocal) return 'Local';

    const str = (getOrderSupplier(order) + ' ' + (order.notes || '') + ' ' + (order.category || '')).toLowerCase();
    if (str.includes('import') || str.includes('impor') || str.includes('overseas')) {
      return 'Import';
    }
    return 'Local';
  };

  // === USD FORMATTER HELPERS ===
  const formatUSD = (numberInIDR) => {
    const amountInUSD = (numberInIDR || 0) / KURS_IDR_TO_USD;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amountInUSD);
  };

  const formatShortUSD = (valInIDR) => {
    if (!valInIDR || valInIDR === 0) return '$0';
    const val = valInIDR / KURS_IDR_TO_USD;
    if (val >= 1_000_000_000) {
      const v = (val / 1_000_000_000).toFixed(1);
      return '$' + (v.endsWith('.0') ? v.slice(0, -2) : v) + 'B';
    }
    if (val >= 1_000_000) {
      const v = (val / 1_000_000).toFixed(1);
      return '$' + (v.endsWith('.0') ? v.slice(0, -2) : v) + 'M';
    }
    if (val >= 1_000) {
      const v = (val / 1_000).toFixed(1);
      return '$' + (v.endsWith('.0') ? v.slice(0, -2) : v) + 'K';
    }
    return '$' + val.toFixed(0);
  };

  const normalizeCategory = (cat) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('raw') || c.startsWith('rm')) return 'Raw Material';
    if (c.includes('consumable')) return 'Consumable Material';
    if (c.includes('sparepart') || c.includes('spare') || c.startsWith('sp')) return 'Sparepart';
    if (c.includes('maintenance')) return 'Maintenance';
    return cat || 'Other';
  };

  const getParentCategory = (normCat) => {
    if (['Raw Material', 'Consumable Material'].includes(normCat)) return 'Direct';
    if (['Sparepart', 'Maintenance'].includes(normCat)) return 'Indirect';
    return 'Other';
  };

  const availableYears = useMemo(() => {
    const years = new Set();
    orders.forEach((o) => {
      const dateStr = getOrderDate(o);
      if (dateStr && dateStr !== '-') {
        const d = new Date(dateStr);
        if (!isNaN(d.getFullYear())) {
          years.add(d.getFullYear());
        }
      }
    });
    return ['All', ...Array.from(years).sort((a, b) => b - a)];
  }, [orders]);

  const yearFilteredOrders = useMemo(() => {
    if (selectedYear === 'All') return orders;
    return orders.filter((o) => {
      const dateStr = getOrderDate(o);
      if (dateStr && dateStr !== '-') {
        const d = new Date(dateStr);
        return !isNaN(d.getFullYear()) && d.getFullYear().toString() === selectedYear.toString();
      }
      return false;
    });
  }, [orders, selectedYear]);

  // === BAR CHART DATA (DIRECT VS INDIRECT / DRILL-DOWN) ===
  const barChartData = useMemo(() => {
    const catMap = {};
    let maxVal = 0;

    if (!barChartGroup) {
      // Group spend into Direct and Indirect
      yearFilteredOrders.forEach((order) => {
        const normCat = normalizeCategory(getOrderCategory(order));
        const parentCat = getParentCategory(normCat);
        const cost = getOrderTotal(order);
        catMap[parentCat] = (catMap[parentCat] || 0) + cost;
      });
    } else {
      yearFilteredOrders.forEach((order) => {
        const normCat = normalizeCategory(getOrderCategory(order));
        const parentCat = getParentCategory(normCat);
        const rawCat = getOrderCategory(order);

        if (normCat === barChartGroup || parentCat === barChartGroup || rawCat === barChartGroup) {
          if (Array.isArray(order.items) && order.items.length > 0) {
            order.items.forEach(item => {
              const name = (item.name || item.namaBarang || item.nama || 'Unnamed Item').trim();
              let q = parseFloat(item.qty || item.quantity || 1);
              let p = item.hargaSatuan || item.price || item.harga || 0;
              if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9]/g, '')) || 0;
              const cost = q * p;
              catMap[name] = (catMap[name] || 0) + cost;
            });
          } else {
            const name = getOrderItemName(order);
            const cost = getOrderTotal(order);
            catMap[name] = (catMap[name] || 0) + cost;
          }
        }
      });
    }

    const categories = Object.keys(catMap)
      .filter(key => catMap[key] > 0)
      .sort((a, b) => catMap[b] - catMap[a])
      .slice(0, 20)
      .map(catName => ({
        name: catName,
        value: catMap[catName]
      }));
    
    const currentMax = categories.length > 0 ? categories[0].value : 1_400_000_000;
    maxVal = Math.max(currentMax, 100_000);

    return { categories, maxVal };
  }, [yearFilteredOrders, barChartGroup]);

  // DATA PARETO CATEGORY
  const [categoryChartView, setCategoryChartView] = useState('bar');

  const categoryParetoData = useMemo(() => {
    const { categories: top10Categories } = barChartData;
    const grandTotalSpend = top10Categories.reduce((acc, c) => acc + c.value, 0);

    let runningSum = 0;
    const items = top10Categories.map((cat) => {
      runningSum += cat.value;
      const cumPercent = grandTotalSpend > 0 ? (runningSum / grandTotalSpend) * 100 : 0;
      const indPercent = grandTotalSpend > 0 ? (cat.value / grandTotalSpend) * 100 : 0;
      return {
        name: cat.name,
        totalCost: cat.value,
        cumCost: runningSum,
        indPercent: parseFloat(indPercent.toFixed(1)),
        cumPercent: Math.min(Math.round(cumPercent), 100)
      };
    });

    return { items, grandTotalSpend };
  }, [barChartData]);

  // CATEGORY PARETO COMPUTATION FOR MODAL
  const computeCategoryParetoData = (categoryName) => {
    const categoryOrders = yearFilteredOrders.filter(
      order => {
        const normCat = normalizeCategory(getOrderCategory(order));
        const parentCat = getParentCategory(normCat);
        return parentCat === categoryName || normCat === categoryName || getOrderCategory(order) === categoryName;
      }
    );
   
    if (categoryOrders.length === 0) return null;
   
    const itemMap = {};
    categoryOrders.forEach(order => {
      const itemName = getOrderSupplier(order) !== '-' ? getOrderSupplier(order) : (order.notes || 'Unknown Item');
      if (!itemMap[itemName]) {
        itemMap[itemName] = 0;
      }
      itemMap[itemName] += getOrderTotal(order);
    });
   
    let items = Object.entries(itemMap).map(([name, totalCost]) => ({
      name,
      totalCost,
      percent: 0,
      cumPercent: 0
    }));
   
    items.sort((a, b) => b.totalCost - a.totalCost);
   
    const grandTotal = items.reduce((sum, item) => sum + item.totalCost, 0);
    let cumTotal = 0;
   
    items = items.map((item) => {
      cumTotal += item.totalCost;
      return {
        ...item,
        percent: grandTotal > 0 ? (item.totalCost / grandTotal) * 100 : 0,
        cumPercent: grandTotal > 0 ? (cumTotal / grandTotal) * 100 : 0
      };
    });
   
    return {
      categoryName,
      items,
      grandTotal,
      itemCount: items.length
    };
  };

  const renderCategoryParetoModal = () => {
    if (!showCategoryPareto || !selectedCategoryForPareto) return null;
   
    const paretoData = computeCategoryParetoData(selectedCategoryForPareto);
    if (!paretoData) return null;
   
    const { items, grandTotal, categoryName } = paretoData;
   
    const svgWidth = 800;
    const svgHeight = 400;
    const padLeft = 70;
    const padRight = 60;
    const padTop = 50;
    const padBottom = 100;
    const chartW = svgWidth - padLeft - padRight;
    const chartH = svgHeight - padTop - padBottom;
   
    const maxBarVal = Math.max(...items.map(d => d.totalCost), 1);
    const numBars = items.length;
    const step = chartW / numBars;
    const barW = Math.max(step * 0.6, 15);
   
    const linePoints = items.map((item, i) => {
      const cx = padLeft + (i + 0.5) * step;
      const cy = padTop + chartH - (item.cumPercent / 100) * chartH;
      return { cx, cy, cumPercent: item.cumPercent };
    });
   
    const pathString = linePoints.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.cx},${pt.cy}` : `${acc} L ${pt.cx},${pt.cy}`;
    }, '');
   
    const line80Y = padTop + chartH - (80 / 100) * chartH;
   
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className={`rounded-2xl shadow-2xl w-full max-w-6xl border my-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
          <div className={`p-6 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800 bg-[#0F172A]' : 'border-gray-200 bg-gray-50'}`}>
            <div>
              <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                📊 Pareto Analysis: {categoryName}
              </h2>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                80/20 Pareto Principle - Identify items contributing to 80% of total spend
              </p>
            </div>
            <button
              onClick={() => {
                setShowCategoryPareto(false);
                setSelectedCategoryForPareto(null);
              }}
              className={`text-2xl hover:opacity-70 transition-opacity cursor-pointer ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}
            >
              ✕
            </button>
          </div>
   
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs font-semibold uppercase ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total Items</p>
                <p className={`text-2xl font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{items.length}</p>
              </div>
              <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs font-semibold uppercase ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total Spend</p>
                <p className={`text-2xl font-bold mt-2 text-red-600`}>{formatUSD(grandTotal)}</p>
              </div>
              <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs font-semibold uppercase ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>80% Threshold</p>
                <p className={`text-2xl font-bold mt-2 text-blue-600`}>{formatUSD(grandTotal * 0.8)}</p>
              </div>
            </div>
   
            <div className={`p-6 rounded-lg border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
              <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Pareto Diagram</h3>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto min-w-[700px]">
                  {[0, 25, 50, 75, 100].map((pct) => {
                    const y = padTop + chartH - (pct / 100) * chartH;
                    return (
                      <g key={`grid-${pct}`}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={svgWidth - padRight}
                          y2={y}
                          stroke={isDarkMode ? '#334155' : '#E5E7EB'}
                          strokeDasharray="3 3"
                          opacity="0.5"
                        />
                        <text
                          x={padLeft - 8}
                          y={y + 3}
                          textAnchor="end"
                          className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}
                        >
                          {formatShortUSD((pct / 100) * maxBarVal)}
                        </text>
                        <text
                          x={svgWidth - padRight + 8}
                          y={y + 3}
                          textAnchor="start"
                          className="text-[11px] font-medium fill-blue-500"
                        >
                          {pct}%
                        </text>
                      </g>
                    );
                  })}
   
                  <line
                    x1={padLeft}
                    y1={line80Y}
                    x2={svgWidth - padRight}
                    y2={line80Y}
                    stroke="#EF4444"
                    strokeDasharray="5 5"
                    strokeWidth="2"
                    opacity="0.7"
                  />
                  <text
                    x={svgWidth - padRight + 8}
                    y={line80Y - 5}
                    textAnchor="start"
                    className="text-[11px] font-bold fill-red-500"
                  >
                    80%
                  </text>
   
                  {items.map((item, i) => {
                    const x = padLeft + (i + 0.5) * step - barW / 2;
                    const barHeight = (item.totalCost / maxBarVal) * chartH;
                    const y = padTop + chartH - barHeight;
   
                    return (
                      <g key={`bar-${i}`}>
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={barHeight}
                          fill="#DC2626"
                          opacity="0.7"
                          rx="3"
                        />
                      </g>
                    );
                  })}
   
                  <path
                    d={pathString}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
   
                  {linePoints.map((pt, i) => (
                    <circle
                      key={`dot-${i}`}
                      cx={pt.cx}
                      cy={pt.cy}
                      r="4"
                      fill="#3B82F6"
                      stroke="white"
                      strokeWidth="2"
                    />
                  ))}
   
                  {items.map((item, i) => {
                    if (i % Math.max(1, Math.floor(items.length / 8)) !== 0 && i !== 0) return null;
                    return (
                      <text
                        key={`label-${i}`}
                        x={padLeft + (i + 0.5) * step}
                        y={svgHeight - padBottom + 20}
                        textAnchor="middle"
                        className={`text-[10px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}
                      >
                        {item.name.substring(0, 10)}
                      </text>
                    );
                  })}
   
                  <text
                    x={padLeft - 40}
                    y={padTop - 10}
                    textAnchor="middle"
                    className={`text-[12px] font-bold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-700'}`}
                  >
                    Spend ($)
                  </text>
                  <text
                    x={svgWidth - padRight + 40}
                    y={padTop - 10}
                    textAnchor="middle"
                    className="text-[12px] font-bold fill-blue-500"
                  >
                    Cumulative %
                  </text>
                </svg>
              </div>
            </div>
   
            <div className={`p-6 rounded-lg border overflow-x-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
              <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Itemized Breakdown</h3>
              <table className={`w-full text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'}`}>
                    <th className="text-left py-2 px-3 font-semibold">#</th>
                    <th className="text-left py-2 px-3 font-semibold">Item / Supplier</th>
                    <th className="text-right py-2 px-3 font-semibold">Spend</th>
                    <th className="text-right py-2 px-3 font-semibold">% of Total</th>
                    <th className="text-right py-2 px-3 font-semibold">Cumulative %</th>
                    <th className="text-center py-2 px-3 font-semibold">Vital Few?</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const isVitalFew = item.cumPercent <= 80;
                    return (
                      <tr
                        key={i}
                        className={`border-b transition-colors ${
                          isVitalFew
                            ? isDarkMode
                              ? 'bg-red-900/20 border-slate-800'
                              : 'bg-red-50 border-gray-100'
                            : isDarkMode
                            ? 'border-slate-800'
                            : 'border-gray-100'
                        }`}
                      >
                        <td className="py-3 px-3 font-semibold text-center">{i + 1}</td>
                        <td className={`py-3 px-3 font-medium ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>
                          {item.name}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-red-600">
                          {formatUSD(item.totalCost)}
                        </td>
                        <td className="py-3 px-3 text-right">{item.percent.toFixed(1)}%</td>
                        <td className={`py-3 px-3 text-right font-semibold ${
                          isVitalFew ? 'text-red-600' : 'text-blue-600'
                        }`}>
                          {item.cumPercent.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isVitalFew ? (
                            <span className="text-lg">🔴</span>
                          ) : (
                            <span className="text-lg">🔵</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const filteredTotalCost = useMemo(() => {
    return yearFilteredOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
  }, [yearFilteredOrders]);

  const kpiStats = useMemo(() => {
    let totalCost = 0;
    let pendingPayment = 0;
    let paidCost = 0;
    let importCount = 0; 

    yearFilteredOrders.forEach((o) => {
      const cost = getOrderTotal(o);
      totalCost += cost;

      const st = getOrderStatus(o).toLowerCase();
      if (st.includes('selesai') || st.includes('paid') || st.includes('lunas') || st.includes('completed')) {
        paidCost += cost;
      } else {
        pendingPayment += cost;
      }

      if (getOrderOrigin(o).toLowerCase().includes('import') || getOrderOrigin(o).toLowerCase().includes('impor')) importCount++;
    });

    const totalOrders = yearFilteredOrders.length;
    const avgPaid = totalCost > 0 ? Math.round((paidCost / totalCost) * 100) : 0;

    return { totalCost, totalOrders, pendingPayment, avgPaid, importCount };
  }, [yearFilteredOrders]);

  const pendingOrders = useMemo(() => {
    return yearFilteredOrders.filter((o) => {
      const st = getOrderStatus(o).toLowerCase();
      return !(st.includes('selesai') || st.includes('paid') || st.includes('lunas') || st.includes('completed'));
    });
  }, [yearFilteredOrders]);

  const monthlyStats = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTotals = new Array(12).fill(0);

    yearFilteredOrders.forEach((order) => {
      const rawDate = getOrderDate(order);
      if (rawDate && rawDate !== '-') {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          monthlyTotals[d.getMonth()] += getOrderTotal(order);
        }
      }
    });

    const maxVal = Math.max(...monthlyTotals, 1_600_000_000);
    return { months, monthlyTotals, maxVal };
  }, [yearFilteredOrders]);

  const paretoSupplierData = useMemo(() => {
    const supMap = {};
    let grandTotalSpend = 0;

    yearFilteredOrders.forEach((order) => {
      const sup = getOrderSupplier(order);
      const cost = getOrderTotal(order);
      if (sup && sup !== '-') {
        supMap[sup] = (supMap[sup] || 0) + cost;
        grandTotalSpend += cost;
      }
    });

    const sortedDesc = Object.keys(supMap)
      .map((supName) => ({ name: supName, totalCost: supMap[supName] }))
      .sort((a, b) => b.totalCost - a.totalCost);

    let selected = [];
    if (supplierParetoTab === 'lowest20') {
      selected = sortedDesc.slice(-20);
    } else {
      const top20 = sortedDesc.slice(0, 20);
      const otherCost = sortedDesc.slice(20).reduce((acc, curr) => acc + curr.totalCost, 0);
      selected = [...top20];
      if (otherCost > 0) {
        selected.push({ name: 'Others (Rest)', totalCost: otherCost });
      }
    }

    let runningSum = 0;
    const items = selected.map((item) => {
      runningSum += item.totalCost;
      const cumPercent = grandTotalSpend > 0 ? (runningSum / grandTotalSpend) * 100 : 0;
      const indPercent = grandTotalSpend > 0 ? (item.totalCost / grandTotalSpend) * 100 : 0;
      return {
        ...item,
        cumCost: runningSum,
        indPercent: parseFloat(indPercent.toFixed(1)),
        cumPercent: Math.min(Math.round(cumPercent), 100)
      };
    });

    return { items, grandTotalSpend };
  }, [yearFilteredOrders, supplierParetoTab]);

  const filteredOrders = useMemo(() => {
    if (selectedCategory === 'All') return yearFilteredOrders;
    return yearFilteredOrders.filter((o) => getParentCategory(normalizeCategory(getOrderCategory(o))) === selectedCategory || normalizeCategory(getOrderCategory(o)) === selectedCategory);
  }, [yearFilteredOrders, selectedCategory]);

  const generateSvgLinePath = (data, width, height, maxScale) => {
    if (!data || data.length === 0) return '';
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 60) + 40;
      const y = height - 30 - (val / maxScale) * (height - 60);
      return { x, y };
    });
    return points.reduce((acc, point, i, a) => {
      if (i === 0) return `M ${point.x},${point.y}`;
      const cpsX = (point.x + a[i - 1].x) / 2;
      return `${acc} C ${cpsX},${a[i - 1].y} ${cpsX},${point.y} ${point.x},${point.y}`;
    }, '');
  };

  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('selesai') || s.includes('paid') || s.includes('lunas') || s.includes('completed')) {
      return isDarkMode ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold' : 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold';
    }
    if (s.includes('dikirim') || s.includes('proses') || s.includes('shipped') || s.includes('processing')) {
      return isDarkMode ? 'bg-blue-950/80 text-blue-400 border border-blue-800 font-semibold' : 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold';
    }
    if (s.includes('unpaid') || s.includes('partial') || s.includes('pending')) {
      return isDarkMode ? 'bg-amber-950/80 text-amber-400 border border-amber-800 font-bold' : 'bg-amber-100 text-amber-800 border border-amber-300 font-bold';
    }
    return isDarkMode ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-gray-100 text-gray-600 border border-gray-200';
  };

  const getOriginBadgeClass = (origin) => {
    const o = (origin || '').toLowerCase();
    if (o.includes('import') || o.includes('impor')) {
      return isDarkMode ? 'bg-purple-950/80 text-purple-400 border border-purple-800 font-bold' : 'bg-purple-100 text-purple-700 border border-purple-300 font-bold';
    }
    return isDarkMode ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800 font-medium' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium';
  };

  // === DATA UNTUK PIE CHART 1 (DIRECT/INDIRECT DRILL DOWN) ===
  const pieChartData = useMemo(() => {
    const catMap = {};
    let grandTotal = 0;

    if (drillLevel === 0) {
      yearFilteredOrders.forEach((order) => {
        const cat = getParentCategory(normalizeCategory(getOrderCategory(order)));
        const cost = getOrderTotal(order);
        catMap[cat] = (catMap[cat] || 0) + cost;
        grandTotal += cost;
      });
    } else if (drillLevel === 1 && selectedGroup) {
      yearFilteredOrders.forEach((order) => {
        const normCat = normalizeCategory(getOrderCategory(order));
        if (getParentCategory(normCat) === selectedGroup) {
          const cost = getOrderTotal(order);
          catMap[normCat] = (catMap[normCat] || 0) + cost;
          grandTotal += cost;
        }
      });
    }

    const colorPalette = {
      'Direct': '#DC2626',
      'Indirect': '#2563EB',
      'Other': '#64748B',
      'Raw Material': '#3B82F6',
      'Consumable Material': '#06B6D4',
      'Sparepart': '#F59E0B',
      'Maintenance': '#EA580C',
    };
    
    const fallbackColors = ['#DC2626', '#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#64748B', '#14B8A6'];

    const categories = Object.keys(catMap)
      .filter(key => catMap[key] > 0)
      .sort((a, b) => catMap[b] - catMap[a])
      .map((catName, idx) => {
        const cost = catMap[catName];
        const percentage = grandTotal > 0 ? ((cost / grandTotal) * 100).toFixed(1) : 0;
        return {
          name: catName,
          value: cost,
          percentage: parseFloat(percentage),
          color: colorPalette[catName] || fallbackColors[idx % fallbackColors.length]
        };
      });

    return { categories, grandTotal };
  }, [yearFilteredOrders, drillLevel, selectedGroup]);

  // === DATA UNTUK PIE CHART 2 (IMPORT VS LOCAL) ===
  const originPieChartData = useMemo(() => {
    const originMap = { 'Local': 0, 'Import': 0 };
    let grandTotal = 0;

    yearFilteredOrders.forEach((order) => {
      const cost = getOrderTotal(order);
      const origin = getOrderOrigin(order);
      if (origin.toLowerCase().includes('import') || origin.toLowerCase().includes('impor')) {
        originMap['Import'] += cost;
      } else {
        originMap['Local'] += cost;
      }
      grandTotal += cost;
    });

    const categories = Object.keys(originMap)
      .filter(key => originMap[key] > 0)
      .map((originName) => {
        const cost = originMap[originName];
        const percentage = grandTotal > 0 ? ((cost / grandTotal) * 100).toFixed(1) : 0;
        return {
          name: originName,
          value: cost,
          percentage: parseFloat(percentage),
          color: originName === 'Import' ? '#A855F7' : '#10B981' // Purple for Import, Emerald for Local
        };
      });

    return { categories, grandTotal };
  }, [yearFilteredOrders]);


  // === FUNGSI HELPER UNTUK MENGGAMBAR SVG PIE CHART (Bisa dipakai ulang) ===
  const renderGenericPieChart = (data, totalValue, onSliceClick = null, isClickable = false) => {
    if (!data || data.length === 0 || totalValue === 0) {
      return (
        <div className="h-72 flex items-center justify-center text-gray-400 text-sm relative">
          No data available in this category for the selected year.
        </div>
      );
    }

    let cumulativeAngle = 0;
    const radius = 80;
    const innerRadius = 50; 
    const cx = 220;
    const cy = 125;
    const maxLabels = 8;
    
    const slices = data.map((cat, index) => {
      const sliceAngle = (cat.value / totalValue) * 360;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + sliceAngle;
      const middleAngle = startAngle + sliceAngle / 2;
      
      cumulativeAngle += sliceAngle;

      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;
      const midRad = ((middleAngle - 90) * Math.PI) / 180;

      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);

      const x1_in = cx + innerRadius * Math.cos(startRad);
      const y1_in = cy + innerRadius * Math.sin(startRad);
      const x2_in = cx + innerRadius * Math.cos(endRad);
      const y2_in = cy + innerRadius * Math.sin(endRad);

      const largeArcFlag = sliceAngle > 180 ? 1 : 0;
      
      const pathData = sliceAngle >= 359.9
        ? `M ${cx - radius},${cy} A ${radius},${radius} 0 1,0 ${cx + radius},${cy} A ${radius},${radius} 0 1,0 ${cx - radius},${cy}`
        : `M ${x1_in},${y1_in} L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag},1 ${x2},${y2} L ${x2_in},${y2_in} A ${innerRadius},${innerRadius} 0 ${largeArcFlag},0 ${x1_in},${y1_in} Z`;

      const lx1 = cx + (radius + 4) * Math.cos(midRad);
      const ly1 = cy + (radius + 4) * Math.sin(midRad);
      const lx2 = cx + (radius + 24) * Math.cos(midRad);
      const ly2 = cy + (radius + 24) * Math.sin(midRad);
      
      const isRight = Math.cos(midRad) >= 0;
      const lx3 = lx2 + (isRight ? 30 : -30);
      const ly3 = ly2;

      return {
        ...cat,
        pathData,
        lx1, ly1, lx2, ly2, lx3, ly3,
        textX: lx3 + (isRight ? 6 : -6),
        textY: ly3 + 4,
        textAnchor: isRight ? 'start' : 'end',
        showLabel: index < maxLabels && sliceAngle > 5 
      };
    });

    return (
      <div className="w-full flex flex-col items-center mt-2">
        <div className="w-full h-72 relative">
          <svg viewBox="0 0 440 250" className="w-full h-full overflow-visible">
            {slices.map((slice, i) => (
              <path
                key={i}
                d={slice.pathData}
                fill={slice.color}
                stroke={isDarkMode ? '#1E293B' : '#FFFFFF'}
                strokeWidth="2.5"
                className={`transition-all duration-200 ${isClickable ? 'cursor-pointer hover:opacity-85 hover:-translate-y-1' : ''}`}
                onClick={() => isClickable && onSliceClick && onSliceClick(slice.name)}
              />
            ))}

            {slices.map((slice, i) => (
              slice.showLabel && (
                <g key={`label-${i}`}>
                  <polyline
                    points={`${slice.lx1},${slice.ly1} ${slice.lx2},${slice.ly2} ${slice.lx3},${slice.ly3}`}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="1.8"
                  />
                  <text
                    x={slice.textX}
                    y={slice.textY}
                    textAnchor={slice.textAnchor}
                    fill={slice.color}
                    className="text-[11px] font-bold"
                  >
                    {formatShortUSD(slice.value)} ({slice.percentage}%)
                  </text>
                </g>
              )
            ))}
          </svg>
        </div>

        <div className={`w-full mt-4 pt-4 border-t max-h-[350px] overflow-y-auto scrollbar-thin ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs mb-2">
            {data.map((cat, i) => (
              <div key={i} className="flex items-center gap-2 max-w-[180px]" title={`${cat.name}: ${formatUSD(cat.value)}`}>
                <span className="w-3 h-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: cat.color }}></span>
                <span className={`font-semibold truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{cat.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };


  const renderDrilldownPieChart = () => {
    const { categories, grandTotal } = pieChartData;

    const handleSliceClick = (sliceName) => {
      if (drillLevel === 0) {
        setSelectedGroup(sliceName);
        setDrillLevel(1);
      }
    };

    return (
      <div className="w-full flex flex-col">
        {/* NAVIGASI BREADCRUMB (MAX LEVEL 1) */}
        <div className={`flex items-center gap-2 mb-2 mt-2 text-xs font-semibold p-2 rounded-lg border self-start ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
          <button 
            onClick={() => { setDrillLevel(0); setSelectedGroup(null); }}
            className={`hover:text-red-500 transition-colors cursor-pointer ${drillLevel === 0 ? 'text-red-500 font-bold' : isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}
          >
            <i className="fa-solid fa-house mr-1"></i> Main
          </button>
          
          {drillLevel === 1 && (
            <>
              <span className={isDarkMode ? 'text-slate-600' : 'text-gray-300'}>/</span>
              <span className="text-red-500 font-bold">{selectedGroup}</span>
            </>
          )}
        </div>
        
        {renderGenericPieChart(categories, grandTotal, handleSliceClick, drillLevel === 0)}
      </div>
    );
  };

  const renderOriginPieChart = () => {
    const { categories, grandTotal } = originPieChartData;
    return renderGenericPieChart(categories, grandTotal, null, false);
  };

  const renderCategoryBarChart = () => {
    const { categories: top10Categories, maxVal } = barChartData; 
    const barColors = ['#DC2626', '#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C'];
    const ticks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

    return (
      <div className="w-full">
        <div className="relative pl-36 pr-14 pb-10 pt-4 max-h-[500px] overflow-y-auto overflow-x-hidden scrollbar-thin">
          <div className="absolute inset-0 left-36 right-14 bottom-10 flex justify-between pointer-events-none">
            {ticks.map((_, i) => (
              <div key={i} className={`h-full border-r border-dotted ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}></div>
            ))}
          </div>
          <div className="space-y-4 relative z-10">
            {top10Categories.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data available</div>
            ) : (
              top10Categories.map((cat, idx) => {
                const pct = Math.min((cat.value / maxVal) * 100, 100);
                return (
                  <div 
                    key={cat.name} 
                    className={`flex items-center h-7 text-xs sm:text-sm ${!barChartGroup ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                    onClick={() => {
                      if (!barChartGroup) {
                        setBarChartGroup(cat.name);
                        setCategoryChartView('pareto');
                      }
                    }}
                  >
                    <span className={`w-36 -ml-36 pr-4 text-right font-semibold truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`} title={cat.name}>
                      {cat.name}
                    </span>
                    <div className="flex-1 flex items-center h-full relative">
                      <div 
                        className="h-full rounded-r-lg transition-all duration-500 shadow-xs" 
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: barColors[idx % barColors.length] }}
                      ></div>
                      <span className={`ml-3 font-bold whitespace-nowrap text-xs sm:text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>
                        {formatShortUSD(cat.value)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className={`pl-36 pr-14 flex justify-between text-xs font-medium pt-3 border-t ${isDarkMode ? 'text-slate-500 border-slate-800' : 'text-gray-400 border-gray-100'}`}>
          {ticks.map((t, i) => (
            <span key={i} className="-translate-x-1/2">{t === 0 ? '$0' : formatShortUSD(t)}</span>
          ))}
        </div>
      </div>
    );
  };
  const renderSupplierParetoChart = () => {
    const { items } = paretoSupplierData;

    if (!items || items.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          No supplier spend data available for Pareto analysis.
        </div>
      );
    }

    const svgWidth = 720;
    const svgHeight = 320;
    const padLeft = 85; 
    const padRight = 65;
    const padTop = 45;
    const padBottom = 80;
    const chartW = svgWidth - padLeft - padRight;
    const chartH = svgHeight - padTop - padBottom;

    const maxBarVal = Math.max(...items.map((d) => d.totalCost), 1);
    const numBars = items.length;
    const step = chartW / numBars;
    const barW = Math.max(step * 0.55, 12);

    const linePoints = items.map((item, i) => {
      const cx = padLeft + (i + 0.5) * step;
      const cy = padTop + chartH - (item.cumPercent / 100) * chartH;
      return { cx, cy, percent: item.cumPercent, name: item.name };
    });

    const pathString = linePoints.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.cx},${pt.cy}` : `${acc} L ${pt.cx},${pt.cy}`;
    }, '');

    return (
      <div className="w-full flex flex-col gap-6">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 flex flex-col items-center">
            <div className="w-full overflow-x-auto scrollbar-thin">
              <div className="min-w-[650px] relative">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible select-none">
                  {[0, 20, 40, 60, 80, 100].map((pct) => {
                    const y = padTop + chartH - (pct / 100) * chartH;
                    return (
                      <g key={pct}>
                        <line 
                          x1={padLeft} 
                          y1={y} 
                          x2={svgWidth - padRight} 
                          y2={y} 
                          stroke={isDarkMode ? '#334155' : '#E2E8F0'} 
                          strokeDasharray="3 3" 
                        />
                        <text 
                          x={padLeft - 8} 
                          y={y + 3} 
                          textAnchor="end" 
                          className={`text-[10px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}
                        >
                          {formatShortUSD((pct / 100) * maxBarVal)}
                        </text>
                        <text 
                          x={svgWidth - padRight + 8} 
                          y={y + 3} 
                          textAnchor="start" 
                          className={`text-[10px] font-medium ${isDarkMode ? 'fill-purple-400' : 'fill-purple-600'}`}
                        >
                          {pct}%
                        </text>
                      </g>
                    );
                  })}
                  
                  <text 
                    x={-(padTop + chartH / 2)} 
                    y={15} 
                    transform="rotate(-90)" 
                    textAnchor="middle" 
                    className={`text-[11px] font-bold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}
                  >
                    TOTAL SPEND (USD)
                  </text>
                  <text 
                    x={padTop + chartH / 2} 
                    y={-(svgWidth - 18)} 
                    transform="rotate(90)" 
                    textAnchor="middle" 
                    className={`text-[11px] font-bold ${isDarkMode ? 'fill-purple-300' : 'fill-purple-700'}`}
                  >
                    CUMULATIVE PERCENTAGE (%)
                  </text>
                  {items.map((item, i) => {
                    const cx = padLeft + (i + 0.5) * step;
                    const xBar = cx - barW / 2;
                    const hBar = (item.totalCost / maxBarVal) * chartH;
                    const yBar = padTop + chartH - hBar;

                    return (
                      <g key={i} className="group cursor-pointer">
                        <rect
                          x={xBar}
                          y={yBar}
                          width={barW}
                          height={hBar}
                          fill={isDarkMode ? '#3B82F6' : '#60A5FA'}
                          stroke={isDarkMode ? '#1D4ED8' : '#2563EB'}
                          strokeWidth="1.5"
                          rx="3"
                          className="transition-all duration-300 group-hover:opacity-80"
                        />
                        <text
                          x={cx}
                          y={padTop + chartH + 16}
                          textAnchor="end"
                          transform={`rotate(-35, ${cx}, ${padTop + chartH + 16})`}
                          className={`text-[10px] font-semibold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-700'}`}
                        >
                          {item.name.length > 14 ? item.name.substring(0, 12) + '...' : item.name}
                        </text>
                      </g>
                    );
                  })}
                  <path 
                    d={pathString} 
                    fill="none" 
                    stroke="#A855F7" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                  {linePoints.map((pt, i) => (
                    <g key={i}>
                      <circle 
                        cx={pt.cx} 
                        cy={pt.cy} 
                        r="4.5" 
                        fill={isDarkMode ? '#0F172A' : '#FFFFFF'} 
                        stroke="#A855F7" 
                        strokeWidth="2.5" 
                      />
                      <text
                        x={pt.cx}
                        y={pt.cy - 9}
                        textAnchor="middle"
                        className={`text-[10px] font-extrabold ${isDarkMode ? 'fill-purple-300' : 'fill-purple-800'}`}
                      >
                        {pt.percent}%
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 w-full">
            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`p-3 border-b font-bold text-xs uppercase tracking-wider text-center ${isDarkMode ? 'bg-slate-800 text-purple-400 border-slate-700' : 'bg-purple-100 text-purple-900 border-gray-200'}`}>
                Pareto Spend Analysis Table
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b text-[11px] font-bold ${isDarkMode ? 'border-slate-800 text-slate-400 bg-slate-900/50' : 'border-gray-200 text-gray-600 bg-white'}`}>
                      <th className="py-2.5 px-3">SUPPLIER</th>
                      <th className="py-2.5 px-2 text-right">SPEND</th>
                      <th className="py-2.5 px-2 text-right">CUMULATIVE (%)</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/60 text-slate-300' : 'divide-gray-200 text-gray-700'}`}>
                    {items.map((item, idx) => (
                      <tr key={idx} className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-purple-50/50'}>
                        <td className="py-2 px-3 font-semibold truncate max-w-[120px]" title={item.name}>
                          {item.name}
                        </td>
                        <td className="py-2 px-2 text-right font-medium">
                          {formatShortUSD(item.totalCost)}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-purple-500">
                          {item.cumPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCategoryParetoChart = () => {
    const { items } = categoryParetoData;

    if (!items || items.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          No category spend data available for Pareto analysis.
        </div>
      );
    }

    const svgWidth = 720;
    const svgHeight = 320;
    const padLeft = 85; 
    const padRight = 65;
    const padTop = 45;
    const padBottom = 80;
    const chartW = svgWidth - padLeft - padRight;
    const chartH = svgHeight - padTop - padBottom;

    const maxBarVal = Math.max(...items.map((d) => d.totalCost), 1);
    const numBars = items.length;
    const step = chartW / numBars;
    const barW = Math.max(step * 0.55, 12);

    const linePoints = items.map((item, i) => {
      const cx = padLeft + (i + 0.5) * step;
      const cy = padTop + chartH - (item.cumPercent / 100) * chartH;
      return { cx, cy, percent: item.cumPercent, name: item.name };
    });

    const pathString = linePoints.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.cx},${pt.cy}` : `${acc} L ${pt.cx},${pt.cy}`;
    }, '');

    return (
      <div className="w-full flex flex-col gap-6">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 flex flex-col items-center">
            <div className="w-full overflow-x-auto scrollbar-thin">
              <div className="min-w-[650px] relative">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible select-none">
                  {[0, 20, 40, 60, 80, 100].map((pct) => {
                    const y = padTop + chartH - (pct / 100) * chartH;
                    return (
                      <g key={pct}>
                        <line 
                          x1={padLeft} 
                          y1={y} 
                          x2={svgWidth - padRight} 
                          y2={y} 
                          stroke={isDarkMode ? '#334155' : '#E2E8F0'} 
                          strokeDasharray="3 3" 
                        />
                        <text 
                          x={padLeft - 8} 
                          y={y + 3} 
                          textAnchor="end" 
                          className={`text-[10px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}
                        >
                          {formatShortUSD((pct / 100) * maxBarVal)}
                        </text>
                        <text 
                          x={svgWidth - padRight + 8} 
                          y={y + 3} 
                          textAnchor="start" 
                          className={`text-[10px] font-medium ${isDarkMode ? 'fill-purple-400' : 'fill-purple-600'}`}
                        >
                          {pct}%
                        </text>
                      </g>
                    );
                  })}
                  
                  <text 
                    x={-(padTop + chartH / 2)} 
                    y={15} 
                    transform="rotate(-90)" 
                    textAnchor="middle" 
                    className={`text-[11px] font-bold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}
                  >
                    TOTAL SPEND (USD)
                  </text>
                  <text 
                    x={padTop + chartH / 2} 
                    y={-(svgWidth - 18)} 
                    transform="rotate(90)" 
                    textAnchor="middle" 
                    className={`text-[11px] font-bold ${isDarkMode ? 'fill-purple-300' : 'fill-purple-700'}`}
                  >
                    CUMULATIVE PERCENTAGE (%)
                  </text>
                  {items.map((item, i) => {
                    const cx = padLeft + (i + 0.5) * step;
                    const xBar = cx - barW / 2;
                    const hBar = (item.totalCost / maxBarVal) * chartH;
                    const yBar = padTop + chartH - hBar;

                    return (
                      <g key={i} className="group cursor-pointer">
                        <rect
                          x={xBar}
                          y={yBar}
                          width={barW}
                          height={hBar}
                          fill={isDarkMode ? '#3B82F6' : '#60A5FA'}
                          stroke={isDarkMode ? '#1D4ED8' : '#2563EB'}
                          strokeWidth="1.5"
                          rx="3"
                          className="transition-all duration-300 group-hover:opacity-80"
                        />
                        <text
                          x={cx}
                          y={padTop + chartH + 16}
                          textAnchor="end"
                          transform={`rotate(-35, ${cx}, ${padTop + chartH + 16})`}
                          className={`text-[10px] font-semibold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-700'}`}
                        >
                          <title>{item.name}</title>
                          {item.name.length > 14 ? item.name.substring(0, 12) + '...' : item.name}
                        </text>
                      </g>
                    );
                  })}
                  <path 
                    d={pathString} 
                    fill="none" 
                    stroke="#A855F7" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                  {linePoints.map((pt, i) => (
                    <g key={i}>
                      <circle 
                        cx={pt.cx} 
                        cy={pt.cy} 
                        r="4.5" 
                        fill={isDarkMode ? '#0F172A' : '#FFFFFF'} 
                        stroke="#A855F7" 
                        strokeWidth="2.5" 
                      />
                      <text
                        x={pt.cx}
                        y={pt.cy - 9}
                        textAnchor="middle"
                        className={`text-[10px] font-extrabold ${isDarkMode ? 'fill-purple-300' : 'fill-purple-800'}`}
                      >
                        {pt.percent}%
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 w-full">
            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`p-3 border-b font-bold text-xs uppercase tracking-wider text-center ${isDarkMode ? 'bg-slate-800 text-purple-400 border-slate-700' : 'bg-purple-100 text-purple-900 border-gray-200'}`}>
                Pareto Spend Analysis Table
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b text-[11px] font-bold ${isDarkMode ? 'border-slate-800 text-slate-400 bg-slate-900/50' : 'border-gray-200 text-gray-600 bg-white'}`}>
                      <th className="py-2.5 px-3">DESCRIPTION</th>
                      <th className="py-2.5 px-2 text-right">SPEND</th>
                      <th className="py-2.5 px-2 text-right">CUMULATIVE (%)</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/60 text-slate-300' : 'divide-gray-200 text-gray-700'}`}>
                    {items.map((item, idx) => (
                      <tr key={idx} className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-purple-50/50'}>
                        <td className="py-2 px-3 font-semibold truncate max-w-[260px]" title={item.name}>
                          {item.name}
                        </td>
                        <td className="py-2 px-2 text-right font-medium">
                          {formatShortUSD(item.totalCost)}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-purple-500">
                          {item.cumPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // === TAB NAVIGATION ===
  const [activeTab, setActiveTab] = useState('overview');
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarDashboardOpen');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('sidebarDashboardOpen', isDashboardMenuOpen);
  }, [isDashboardMenuOpen]);

  const dashboardTabs = [
    { id: 'overview', label: 'Overview', icon: 'fa-gauge-high' },
    { id: 'category', label: 'Category', icon: 'fa-chart-pie' },
    { id: 'supplier', label: 'Supplier', icon: 'fa-users' },
    { id: 'transactions', label: 'Transactions', icon: 'fa-table-list' },
  ];

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* MAIN HEADER */}
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
              <button onClick={() => changePage?.('dashboard')} className="bg-[#004797] text-white px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all shadow-xs">Dashboard</button>
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
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:bg-gray-900'}`}>
                {user?.username || 'Admin'} <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>

              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      {(user?.username || 'AD').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user?.username || 'Admin'}</h4>
                      <p className="text-sm text-gray-400 truncate">{user?.email || 'admin@detmoldpackaging.com'}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded">{user?.role || 'Administrator'}</span>
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
      
      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 transition-colors duration-200 ${
          isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'
        }`}>
          <nav className="flex flex-col gap-2 px-4">
            
            {/* PARENT: Dashboard */}
            <div>
              <button 
                onClick={() => {
                  if (activePage === 'dashboard') {
                    setIsDashboardMenuOpen((prev) => !prev);
                  } else {
                    changePage && changePage('dashboard');
                    setIsDashboardMenuOpen(true);
                  }
                }} 
                className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold rounded-xl transition-colors text-left cursor-pointer ${
                  activePage === 'dashboard' 
                    ? 'bg-[#004797] text-white' 
                    : isDarkMode 
                      ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
                </div>
                <i className={`fa-solid fa-chevron-${isDashboardMenuOpen ? 'down' : 'right'} text-xs transition-transform`}></i>
              </button>

              {/* CHILD: Dashboard Sub-menus */}
              {activePage === 'dashboard' && isDashboardMenuOpen && (
                <div className={`ml-4 pl-3 border-l-2 mt-1 flex flex-col gap-1 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  {dashboardTabs.map((tab) => (
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
            <button onClick={() => changePage && changePage('suppliers')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${activePage === 'suppliers' ? 'bg-[#E31837] text-white font-bold' : isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'}`}>
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage && changePage('purchaseOrders')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${activePage === 'purchaseOrders' ? 'bg-[#E31837] text-white font-bold' : isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'}`}>
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage && changePage('analytics')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${activePage === 'analytics' ? 'bg-[#E31837] text-white font-bold' : isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'}`}>
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage && changePage('report')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${activePage === 'report' ? 'bg-[#E31837] text-white font-bold' : isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'}`}>
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => changePage && changePage('settings')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${activePage === 'settings' ? 'bg-[#E31837] text-white font-bold' : isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'}`}>
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button
                onClick={() => changePage && changePage('userManagement')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                  activePage === 'userManagement' 
                    ? 'bg-[#E31837] text-white font-bold' 
                    : isDarkMode
                      ? 'text-amber-400 hover:bg-slate-800/80 hover:text-amber-300 font-medium'
                      : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-medium'
                }`}
              >
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div>
            <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Dashboard Overview</h1>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Expenditure analysis and order origin monitoring (Local vs Import).</p>
          </div>

          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center text-xl shrink-0 font-bold">
                    $
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Cost</p>
                      <select 
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className={`text-sm font-bold uppercase rounded-md px-2 py-1 outline-none cursor-pointer transition-colors ${
                          isDarkMode 
                            ? 'bg-slate-800 text-slate-200 border border-slate-600 focus:border-slate-400' 
                            : 'bg-gray-100 text-gray-700 border border-gray-300 focus:border-gray-500'
                        }`}
                      >
                        {availableYears.map(year => (
                          <option key={year} value={year} className="text-sm py-1">
                            {year === 'All' ? '(All Time)' : `(${year})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(filteredTotalCost)}</p>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shrink-0">
                    <i className="fa-solid fa-box-archive"></i>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Orders</p>
                    <div className="flex items-baseline gap-2">
                      <p className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{kpiStats.totalOrders}</p>
                      {kpiStats.importCount > 0 && (
                        <span className="text-xs font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                          {kpiStats.importCount} Import
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div onClick={() => setShowPendingModal(true)} className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 cursor-pointer hover:border-red-500 transition-all group ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center text-xl shrink-0">
                    <i className="fa-solid fa-file-invoice-dollar"></i>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Pending Payment</p>
                    <p className="text-2xl font-black text-red-500">{formatUSD(kpiStats.pendingPayment)}</p>
                    <button className="text-[11px] font-semibold text-red-500 group-hover:underline mt-0.5 inline-block cursor-pointer focus:outline-none">Click for details & origin →</button>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-[#2563EB] text-white flex items-center justify-center text-xl shrink-0">
                    <i className="fa-solid fa-chart-pie"></i>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Average % Paid</p>
                    <p className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{kpiStats.avgPaid}%</p>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <h3 className={`font-bold text-center text-sm mb-6 ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Total Cost by Month Name (USD)</h3>
                <div className="w-full h-64 relative">
                  <svg viewBox="0 0 1000 240" className="w-full h-full overflow-visible">
                    {[1_600_000_000, 1_200_000_000, 800_000_000, 400_000_000, 0].map((labelVal, i) => {
                      const y = 30 + i * 40;
                      return (
                        <g key={i}>
                          <line x1="40" y1={y} x2="960" y2={y} stroke={isDarkMode ? '#334155' : '#E5E7EB'} strokeDasharray="4 4" />
                          <text x="30" y={y + 4} textAnchor="end" className={`text-[10px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>
                            {labelVal === 0 ? '$0' : formatShortUSD(labelVal)}
                          </text>
                        </g>
                      );
                    })}
                    <path d={generateSvgLinePath(monthlyStats.monthlyTotals, 1000, 240, monthlyStats.maxVal)} fill="none" stroke="#DC2626" strokeWidth="3.5" />
                    {monthlyStats.monthlyTotals.map((val, idx) => {
                      const x = (idx / 11) * 920 + 40;
                      const y = 210 - (val / monthlyStats.maxVal) * 180;
                      return (
                        <g key={idx}>
                          <circle cx={x} cy={y} r="5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#DC2626" strokeWidth="3" />
                          {val > 0 && <text x={x} y={y - 10} textAnchor="middle" className={`text-[11px] font-bold ${isDarkMode ? 'fill-slate-200' : 'fill-gray-800'}`}>{formatShortUSD(val)}</text>}
                          <text x={x} y="232" textAnchor="middle" className={`text-[11px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>{monthlyStats.months[idx]}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </>
          )}

          {activeTab === 'category' && (
            <div className="flex flex-col gap-6">
              {/* GRID UNTUK 2 PIE CHART (CATEGORY DRILLDOWN & ORIGIN IMPORT/LOCAL) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* PIE CHART 1: CATEGORY DRILLDOWN */}
                <div className={`p-6 rounded-2xl border shadow-xs flex flex-col justify-between min-h-[480px] ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-full text-left mb-2">
                    <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total Spend by Category</h3>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {drillLevel === 0 ? 'Click on a main slice (Direct / Indirect) to view sub-categories.' : `Category breakdown for ${selectedGroup}.`}
                    </p>
                  </div>
                  {renderDrilldownPieChart()}
                </div>

                {/* PIE CHART 2: IMPORT VS LOCAL */}
                <div className={`p-6 rounded-2xl border shadow-xs flex flex-col justify-between min-h-[480px] ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-full text-left mb-2">
                    <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total Spend by Origin</h3>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Comparison between Import and Local spend.
                    </p>
                  </div>
                  {renderOriginPieChart()}
                </div>
              </div>

              {/* BAR CHART / PARETO CATEGORY */}
              <div className={`p-6 rounded-2xl border shadow-xs flex flex-col ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {barChartGroup ? `Top 20 Items in ${barChartGroup}` : 'Total Spend by Direct & Indirect Category'}
                      </h3>
                      {barChartGroup && (
                        <button 
                          onClick={() => {
                            setBarChartGroup(null);
                            setCategoryChartView('bar');
                          }}
                          className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md hover:bg-red-200 transition-colors cursor-pointer font-semibold flex items-center"
                        >
                          <i className="fa-solid fa-arrow-left mr-1"></i> Back
                        </button>
                      )}
                    </div>
                    {!barChartGroup && (
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Click on any bar to view its Pareto analysis.</p>
                    )}
                  </div>
                </div>
                {barChartGroup && categoryChartView === 'pareto' ? renderCategoryParetoChart() : renderCategoryBarChart()}
              </div>
            </div>
          )}

          {activeTab === 'supplier' && (
            <div className="flex flex-col gap-6">
              <div className={`p-6 rounded-2xl border shadow-xs flex flex-col ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 border-b pb-4 border-slate-700/50">
                  <div>
                    <h3 className={`font-bold text-lg uppercase tracking-wide ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {supplierParetoTab === 'lowest20' ? 'LOWEST 20 SPEND BY SUPPLIER' : 'TOP 20 SPEND BY SUPPLIER'}
                    </h3>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {supplierParetoTab === 'lowest20'
                        ? '20 suppliers with the lowest spend along with their cumulative percentages.'
                        : 'Supplier spend distribution analysis with cumulative percentage curve (80/20 Pareto Principle).'}
                    </p>
                  </div>
                  <div className={`flex p-1 rounded-xl shrink-0 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-gray-100'}`}>
                    <button 
                      onClick={() => setSupplierParetoTab('top20')} 
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${supplierParetoTab === 'top20' ? 'bg-red-600 text-white shadow-xs' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      Top 20
                    </button>
                    <button 
                      onClick={() => setSupplierParetoTab('lowest20')} 
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${supplierParetoTab === 'lowest20' ? 'bg-orange-600 text-white shadow-xs' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      Lowest 20
                    </button>
                  </div>
                </div>
                
                {renderSupplierParetoChart()}
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className={`rounded-2xl border shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Transaction & Payment Details</h3>
                <div className="flex gap-2">
                  {['All', 'Direct', 'Indirect'].map((cat) => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${selectedCategory === cat ? 'bg-red-600 text-white font-semibold' : isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className={`border-b font-semibold text-xs uppercase ${isDarkMode ? 'bg-[#0F172A] border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                      <th className="py-4 px-6">Date</th>
                      <th className="py-4 px-6">PO No.</th>
                      <th className="py-4 px-6">Supplier Name</th>
                      <th className="py-4 px-6">Category</th>
                      <th className="py-4 px-6">Origin</th>
                      <th className="py-4 px-6">Total Cost</th>
                      <th className="py-4 px-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                    {filteredOrders.length === 0 ? (
                      <tr><td colSpan="7" className="py-10 text-center text-gray-400">No transactions found.</td></tr>
                    ) : (
                      filteredOrders.map((order, idx) => {
                        const origin = getOrderOrigin(order);
                        return (
                          <tr key={order.poNumber || order.noPO || idx} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                            <td className={`py-4 px-6 text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{getOrderDate(order)}</td>
                            <td className="py-4 px-6 font-bold text-red-500 hover:underline cursor-pointer">{getPoNumber(order)}</td>
                            <td className={`py-4 px-6 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{getOrderSupplier(order)}</td>
                            <td className="py-4 px-6"><span className={`px-3 py-1 rounded-md text-xs font-medium ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>{normalizeCategory(getOrderCategory(order))}</span></td>
                            <td className="py-4 px-6"><span className={`px-2.5 py-1 rounded-full text-xs ${getOriginBadgeClass(origin)}`}>{origin.toLowerCase().includes('import') || origin.toLowerCase().includes('impor') ? '🚢 Import' : '📦 Local'}</span></td>
                            <td className={`py-4 px-6 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(getOrderTotal(order))}</td>
                            <td className="py-4 px-6"><span className={`px-3 py-1 rounded-full text-xs ${getStatusBadgeClass(getOrderStatus(order))}`}>{getOrderStatus(order)}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {showPendingModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] border ${isDarkMode ? 'bg-[#1E293B] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
            <div className={`p-5 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800 bg-[#0F172A]' : 'border-gray-200 bg-gray-50'}`}>
              <h3 className="font-bold text-lg">Pending Invoice Details ({pendingOrders.length})</h3>
              <button onClick={() => setShowPendingModal(false)} className="text-gray-400 hover:text-gray-200 text-lg cursor-pointer"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {pendingOrders.length === 0 ? (
                <p className="text-center text-gray-400 py-6">No pending payments.</p>
              ) : (
                pendingOrders.map((po, i) => (
                  <div key={i} className={`p-4 rounded-xl border flex justify-between items-center transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div>
                      <span className="font-bold text-red-500 text-sm block">{getPoNumber(po)}</span>
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{getOrderSupplier(po)} • {getOrderDate(po)}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(getOrderTotal(po))}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded-full ${getOriginBadgeClass(getOrderOrigin(po))}`}>{getOrderOrigin(po)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {renderCategoryParetoModal()}
    </div>
  );
}