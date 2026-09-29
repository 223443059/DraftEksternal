import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../hooks/useTheme';
import { API_ENDPOINTS } from '../utils/api.config';
import AppLayout, { pendingTabHandoff } from './AppLayout'; // header + sidebar + bar menu atas (dipakai bersama semua halaman)

// === CONVERSION RATE ===
// Kurs IDR per 1 USD berdasarkan tahun transaksi (disamakan dengan PurchaseOrders.jsx)
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

// Filter tahun Dashboard disimpan di variabel level modul (di luar komponen), bukan localStorage:
// tetap sama saat pindah ke halaman lain lalu kembali, dan kembali ke 'All' kalau halaman di-refresh / browser ditutup.
const DEFAULT_YEAR_BY_TAB = { overview: 'All', category: 'All', supplier: 'All' };
let dashboardYearByTab = { ...DEFAULT_YEAR_BY_TAB };

export default function Dashboard({ changePage, activePage = 'dashboard', onLogout }) {
  // === 1. STATE MANAGEMENT ===
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [suppliersMap, setSuppliersMap] = useState({});
  const [supplierParetoTab, setSupplierParetoTab] = useState('top20');
  const [supplierCategoryGroup, setSupplierCategoryGroup] = useState(null);
  const [supplierOriginFilter, setSupplierOriginFilter] = useState(null); // 'Import' | 'Local' | null (klik slice di Total Spend by Origin)
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingModalReady, setPendingModalReady] = useState(false);
  // Tab awal bisa dititipkan dari sidebar (menu gabungan Dashboard/Analytics); dibaca sekali lalu dikosongkan
  const [activeTab, setActiveTab] = useState(() => {
    const target = pendingTabHandoff.dashboard;
    pendingTabHandoff.dashboard = null;
    return target || 'overview';
  });
  // Filter tahun terpisah per tab: mengganti tahun di satu tab tidak mengubah tab lain
  const [yearByTab, setYearByTab] = useState(() => dashboardYearByTab);
  useEffect(() => { dashboardYearByTab = yearByTab; }, [yearByTab]);
  const selectedYear = yearByTab[activeTab] ?? 'All';
  const setSelectedYear = (value) => setYearByTab((prev) => ({ ...prev, [activeTab]: value }));
  const [hoveredCategorySlice, setHoveredCategorySlice] = useState(null);
  const [hoveredOriginSlice, setHoveredOriginSlice] = useState(null);
  const [hoveredMonth, setHoveredMonth] = useState(null);

  // User and permission from RoleContext
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');
  
  // Dark/Light Mode State
  const [isDarkMode, setIsDarkMode] = useTheme();

  // Drill-down 3 Level State (Pie Chart)
  const [drillLevel, setDrillLevel] = useState(0); 
  const [selectedGroup, setSelectedGroup] = useState(null); 
  const [selectedSubCategory, setSelectedSubCategory] = useState(null); 

  // Dropdown filter Direct/Indirect yang dibuka dari box "Total Spending" (reuse drillLevel/selectedGroup
  // yang sama dengan drill-down pie chart Category, supaya chart Category & Origin ikut kefilter bareng)
  const [showSpendFilterMenu, setShowSpendFilterMenu] = useState(false);
  const spendFilterRef = useRef(null);

  useEffect(() => {
    const handleClickOutsideSpendFilter = (e) => {
      if (spendFilterRef.current && !spendFilterRef.current.contains(e.target)) {
        setShowSpendFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideSpendFilter);
    return () => document.removeEventListener('mousedown', handleClickOutsideSpendFilter);
  }, []);

  // Bar Chart Drill-down State
  const [barChartGroup, setBarChartGroup] = useState(null); 

  // Filter kategori spesifik (mis. RM-Board / Paper / RM-Plastic) yang diklik dari box "Total Spend Direct & Indirect".
  // Kalau terisi, chart "Total Spend by Category" & "Total Spend by Origin" di atasnya ikut kefilter ke kategori ini saja.
  const [pieCategoryFilter, setPieCategoryFilter] = useState(null);
  const [originFilter, setOriginFilter] = useState(null); // 'Import' | 'Local' | null (klik slice di Total Spend by Origin)

  // Slice utama (Direct / Indirect) yang diklik di pie "Total Spend by Category" -> sub-kategorinya tampil sebagai popup
  const [subPopupGroup, setSubPopupGroup] = useState(null);
  useEffect(() => { setSubPopupGroup(null); }, [selectedYear, pieCategoryFilter, originFilter]);
  useEffect(() => {
    if (!subPopupGroup) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSubPopupGroup(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subPopupGroup]);

  // Slice Import / Local yang diklik di pie "Total Spend by Origin" -> datanya tampil sebagai popup
  const [originPopup, setOriginPopup] = useState(null);
  useEffect(() => { setOriginPopup(null); }, [selectedYear, pieCategoryFilter]);
  useEffect(() => {
    if (!originPopup) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOriginPopup(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [originPopup]);

  // Slice Import / Local yang diklik di pie "Total Spend by Origin" pada tab Supplier -> popup datanya
  const [supplierOriginPopup, setSupplierOriginPopup] = useState(null);
  useEffect(() => { setSupplierOriginPopup(null); }, [selectedYear, supplierCategoryGroup]);
  useEffect(() => {
    if (!supplierOriginPopup) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSupplierOriginPopup(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [supplierOriginPopup]);

  // Klik kategori di box "Total Spend Direct & Indirect": buka Top 20 item kategori itu (seperti sebelumnya)
  // SEKALIGUS filter pie chart Category & Origin. Klik kategori yang sama lagi = toggle off (reset semua).
  const selectCategoryFilter = (catName) => {
    setSubPopupGroup(null);
    if (pieCategoryFilter === catName) {
      setBarChartGroup(null);
      setCategoryChartView('bar');
      setPieCategoryFilter(null);
    } else {
      setBarChartGroup(catName);
      setCategoryChartView('pareto');
      setPieCategoryFilter(catName);
      setDrillLevel(0);
      setSelectedGroup(null);
    }
  };

  const resetCategoryFilter = () => {
    setSubPopupGroup(null);
    setBarChartGroup(null);
    setCategoryChartView('bar');
    setPieCategoryFilter(null);
    setOriginFilter(null);
  };

  // Pareto Category Modal State
  const [showCategoryPareto, setShowCategoryPareto] = useState(false);
  const [selectedCategoryForPareto, setSelectedCategoryForPareto] = useState(null);

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
    const toOrder = (po) => {
      const rawDate = po.receipt_date || po.receiptDate || po.po_date || po.order_date || po.date;
      const usd = po.spending_usd ?? po.spendingUsd ?? po.totalUsd;
      return {
        id: po.id,
        poNumber: po.po_number || po.poNumber || po.po_no,
        date: rawDate ? String(rawDate).split('T')[0] : '-',
        supplier: po.supplier_name || po.supplier || suppliersMap[po.supplier_id] || '-',
        supplier_id: po.supplier_id,
        totalCost: Number(po.spending_idr ?? po.spendingIdr ?? po.total_amount ?? po.totalCost ?? 0),
        totalUsd: usd === undefined || usd === null ? null : Number(usd),
        status: po.status || po.order_status || 'Pending',
        category: [po.category, po.product_group, po.productGroup].find((v) => v && String(v) !== '0') || 'Other',
        subcategory: [po.subcategory, po.sub_category, po.subCategory].find((v) => v && String(v) !== '0') || null,
        origin: po.local_import || po.localImport || po.origin || '',
        notes: po.description || po.notes || '',
        description: po.description || po.notes || '',
        part: po.part || '',
        items: po.items || []
      };
    };

    const fetchOrdersFromBackend = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS);
        if (response.ok) {
          const data = await response.json();
          const formattedOrders = data.map(toOrder);
          setOrders(formattedOrders);
        } else {
          console.error('Failed to fetch PO data from server, status:', response.status);
          setOrders([]);
        }
      } catch (e) {
        console.error('Failed to fetch Purchase Orders from database:', e);
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrdersFromBackend();
  }, [suppliersMap]);

  // Modal Pending Payment: begitu dibuka, tampilkan garis loading dulu selama 1 frame
  // sebelum me-render list (yang bisa ribuan baris), supaya klik terasa instan/cepat
  // dan browser tidak sempat "freeze" saat merender semuanya sekaligus.
  useEffect(() => {
    if (showPendingModal) {
      setPendingModalReady(false);
      const t = setTimeout(() => setPendingModalReady(true), 30);
      return () => clearTimeout(t);
    }
    setPendingModalReady(false);
  }, [showPendingModal]);

  // === 2. DATA HELPER GETTERS ===
  const getOrderTotal = (order) => {
    if (!order) return 0;
    if (Number.isFinite(order.totalUsd) && order.totalUsd > 0) return order.totalUsd;

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

    let totalIDR = 0;

    if ((rawValue === undefined || rawValue === 0) && order.items && Array.isArray(order.items) && order.items.length > 0) {
      let calc = 0;
      order.items.forEach((item) => {
        let q = parseFloat(item.qty || item.quantity || 1);
        let p = item.hargaSatuan || item.price || item.harga || 0;
        if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9]/g, '')) || 0;
        calc += q * p;
      });
      totalIDR = calc;
    } else if (typeof rawValue === 'string') {
      let cleanText = rawValue.replace(/Rp/gi, '').replace(/\s/g, '').replace(/\./g, '');
      cleanText = cleanText.replace(/,/g, '.');
      totalIDR = parseFloat(cleanText) || 0;
    } else {
      totalIDR = parseFloat(rawValue) || 0;
    }

    const year = order.date ? new Date(order.date).getFullYear() : undefined;
    return totalIDR / getKurs(year);
  };

  const getOrderDate = (order) => order.date || order.tanggal || order.orderDate || order.tanggalPesanan || '-';
  const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || 'Other';
  const getOrderSubcategory = (order) => order.subcategory || order.sub_category || order.subCategory || 'General';
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

  // Kelompok asal untuk pie Origin & filter Pareto: 'Import' atau 'Local'
  const getOriginBucket = (order) => {
    const o = String(getOrderOrigin(order)).toLowerCase();
    return o.includes('import') || o.includes('impor') ? 'Import' : 'Local';
  };

  // === USD FORMATTER HELPERS ===
  const formatUSD = (amountInUSD) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amountInUSD || 0);
  };

  const formatUSDNoDecimal = (amountInUSD) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amountInUSD || 0);
  };

  const formatShortUSD = (valInUSD) => {
    if (!valInUSD || valInUSD === 0) return '$0';
    const val = valInUSD;
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
    const detailMap = {}; // baris detail (PO) per item, untuk popup saat bar Pareto diklik
    const pushDetail = (name, row) => {
      if (!detailMap[name]) detailMap[name] = [];
      detailMap[name].push(row);
    };
    let maxVal = 0;
    const scopedOrders = originFilter
      ? yearFilteredOrders.filter((order) => getOriginBucket(order) === originFilter)
      : yearFilteredOrders;

    if (!barChartGroup) {
      scopedOrders.forEach((order) => {
        const normCat = normalizeCategory(getOrderCategory(order));
        const parentCat = getParentCategory(normCat);
        const cost = getOrderTotal(order);
        catMap[parentCat] = (catMap[parentCat] || 0) + cost;
      });
    } else {
      scopedOrders.forEach((order) => {
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
              pushDetail(name, { po: getPoNumber(order), date: getOrderDate(order), supplier: getOrderSupplier(order), status: getOrderStatus(order), qty: Number.isFinite(q) ? q : null, cost });
            });
          } else {
            const name = getOrderItemName(order);
            const cost = getOrderTotal(order);
            catMap[name] = (catMap[name] || 0) + cost;
            pushDetail(name, { po: getPoNumber(order), date: getOrderDate(order), supplier: getOrderSupplier(order), status: getOrderStatus(order), qty: null, cost });
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
        value: catMap[catName],
        rows: [...(detailMap[catName] || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      }));
    
    const currentMax = categories.length > 0 ? categories[0].value : 1;
    maxVal = Math.max(currentMax, 1);

    return { categories, maxVal };
  }, [yearFilteredOrders, barChartGroup, originFilter]);

  // FILTER BOX KATEGORI (Product Group dinamis) untuk panel "Total Spend Direct & Indirect"
  const categoryFilterList = useMemo(() => {
    const map = {};
    yearFilteredOrders.forEach((order) => {
      const cat = getOrderCategory(order) || 'Other';
      const cost = getOrderTotal(order);
      map[cat] = (map[cat] || 0) + cost;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total }));
  }, [yearFilteredOrders]);

  // DATA PARETO CATEGORY
  const [categoryChartView, setCategoryChartView] = useState('bar');

  // Item Pareto yang diklik -> detailnya tampil sebagai popup
  const [paretoDetailName, setParetoDetailName] = useState(null);
  useEffect(() => { setParetoDetailName(null); }, [barChartGroup, originFilter, selectedYear]);
  useEffect(() => {
    if (!paretoDetailName) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setParetoDetailName(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paretoDetailName]);

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
        rows: cat.rows || [],
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

  // === PERBANDINGAN DENGAN TAHUN SEBELUMNYA (untuk panel Key Highlights) ===
  const prevYearStats = useMemo(() => {
    if (selectedYear === 'All') return null;
    const prevYear = parseInt(selectedYear, 10) - 1;
    if (Number.isNaN(prevYear)) return null;
    let totalCost = 0;
    let pendingPayment = 0;
    let paidCost = 0;
    let totalOrders = 0;
    orders.forEach((o) => {
      const dateStr = getOrderDate(o);
      if (!dateStr || dateStr === '-') return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime()) || d.getFullYear() !== prevYear) return;
      const cost = getOrderTotal(o);
      totalCost += cost;
      totalOrders += 1;
      const st = getOrderStatus(o).toLowerCase();
      if (st.includes('selesai') || st.includes('paid') || st.includes('lunas') || st.includes('completed')) {
        paidCost += cost;
      } else {
        pendingPayment += cost;
      }
    });
    if (totalOrders === 0) return { year: prevYear, hasData: false };
    const avgPaid = totalCost > 0 ? Math.round((paidCost / totalCost) * 100) : 0;
    return { year: prevYear, hasData: true, totalCost, totalOrders, pendingPayment, avgPaid };
  }, [orders, selectedYear]);

  const pendingOrders = useMemo(() => {
    return yearFilteredOrders.filter((o) => {
      const st = getOrderStatus(o).toLowerCase();
      return !(st.includes('selesai') || st.includes('paid') || st.includes('lunas') || st.includes('completed'));
    });
  }, [yearFilteredOrders]);

  const monthlyStats = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // null = belum ada data sama sekali untuk bulan itu (bar tidak digambar, garis putus di sini)
    const monthlyTotals = new Array(12).fill(null);
    const monthlyOrders = new Array(12).fill(null);

    yearFilteredOrders.forEach((order) => {
      const rawDate = getOrderDate(order);
      if (rawDate && rawDate !== '-') {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const m = d.getMonth();
          monthlyTotals[m] = (monthlyTotals[m] || 0) + getOrderTotal(order);
          monthlyOrders[m] = (monthlyOrders[m] || 0) + 1;
        }
      }
    });

    // Bulatkan batas atas sumbu ke angka "cantik" supaya 4 garis grid di kiri (cost) dan kanan (orders) sejajar
    const niceMax = (v) => {
      if (!v || v <= 0) return 1;
      const pow = Math.pow(10, Math.floor(Math.log10(v)));
      const n = v / pow;
      const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
      return step * pow;
    };

    const validValues = monthlyTotals.filter((v) => v !== null);
    const validOrders = monthlyOrders.filter((v) => v !== null);
    const maxVal = niceMax(Math.max(...validValues, 1));
    const maxOrders = niceMax(Math.max(...validOrders, 1));
    return { months, monthlyTotals, monthlyOrders, maxVal, maxOrders };
  }, [yearFilteredOrders]);

  // Supplier Pareto yang diklik -> detail PO-nya tampil sebagai popup (sama seperti Pareto di Spend by Category)
  const [supplierDetailName, setSupplierDetailName] = useState(null);
  useEffect(() => { setSupplierDetailName(null); }, [supplierCategoryGroup, supplierOriginFilter, supplierParetoTab, selectedYear]);
  useEffect(() => {
    if (!supplierDetailName) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSupplierDetailName(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [supplierDetailName]);

  const paretoSupplierData = useMemo(() => {
    const supMap = {};
    const supRows = {}; // baris detail (PO) per supplier, untuk popup saat bar diklik
    let grandTotalSpend = 0;

    const baseOrders = (supplierCategoryGroup
      ? yearFilteredOrders.filter((order) => (getOrderCategory(order) || 'Other') === supplierCategoryGroup)
      : yearFilteredOrders
    ).filter((order) => !supplierOriginFilter || getOriginBucket(order) === supplierOriginFilter);

    baseOrders.forEach((order) => {
      const sup = getOrderSupplier(order);
      const cost = getOrderTotal(order);
      if (sup && sup !== '-') {
        supMap[sup] = (supMap[sup] || 0) + cost;
        grandTotalSpend += cost;
        if (!supRows[sup]) supRows[sup] = [];
        supRows[sup].push({
          po: getPoNumber(order),
          date: getOrderDate(order),
          category: getOrderCategory(order) || 'Other',
          origin: getOriginBucket(order),
          status: getOrderStatus(order),
          cost
        });
      }
    });

    const sortedDesc = Object.keys(supMap)
      .map((supName) => ({
        name: supName,
        totalCost: supMap[supName],
        rows: [...(supRows[supName] || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    let selected = [];
    if (supplierParetoTab === 'lowest20') {
      selected = sortedDesc.slice(-20);
    } else {
      selected = sortedDesc.slice(0, 20);
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
  }, [yearFilteredOrders, supplierParetoTab, supplierCategoryGroup, supplierOriginFilter]);

  // PIE CHART ORIGIN (Local vs Import) untuk tab Spend by Supplier
  const supplierOriginPieData = useMemo(() => {
    const originMap = { Local: 0, Import: 0 };
    let grandTotal = 0;
    const baseOrders = supplierCategoryGroup
      ? yearFilteredOrders.filter((order) => (getOrderCategory(order) || 'Other') === supplierCategoryGroup)
      : yearFilteredOrders;

    baseOrders.forEach((order) => {
      const cost = getOrderTotal(order);
      const origin = getOrderOrigin(order).toLowerCase();
      if (origin.includes('import') || origin.includes('impor')) originMap.Import += cost;
      else originMap.Local += cost;
      grandTotal += cost;
    });

    const categories = Object.keys(originMap)
      .filter((k) => originMap[k] > 0)
      .map((name) => ({
        name,
        value: originMap[name],
        percentage: parseFloat(((originMap[name] / grandTotal) * 100).toFixed(1)),
        color: name === 'Import' ? '#A855F7' : '#10B981'
      }));
    return { categories, grandTotal };
  }, [yearFilteredOrders, supplierCategoryGroup]);

  // Kalau origin yang sedang jadi filter Top 20 Supplier sudah tidak punya spend (ganti tahun/kategori), lepas filternya
  useEffect(() => {
    if (supplierOriginFilter && !supplierOriginPieData.categories.some((c) => c.name === supplierOriginFilter)) {
      setSupplierOriginFilter(null);
    }
  }, [supplierOriginPieData, supplierOriginFilter]);

  const filteredOrders = useMemo(() => {
    if (selectedCategory === 'All') return yearFilteredOrders;
    return yearFilteredOrders.filter((o) => getParentCategory(normalizeCategory(getOrderCategory(o))) === selectedCategory || normalizeCategory(getOrderCategory(o)) === selectedCategory);
  }, [yearFilteredOrders, selectedCategory]);

  const generateSvgLinePath = (data, width, height, maxScale) => {
    if (!data || data.length === 0) return '';
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 60) + 40;
      const y = (val === null || val === undefined) ? null : height - 30 - (val / maxScale) * (height - 60);
      return { x, y };
    });

    let path = '';
    let segmentOpen = false;
    points.forEach((point, i) => {
      if (point.y === null) {
        // Belum ada data di bulan ini -> putuskan garis, mulai segmen baru setelah ini
        segmentOpen = false;
        return;
      }
      if (!segmentOpen) {
        path += ` M ${point.x},${point.y}`;
        segmentOpen = true;
      } else {
        const prev = points[i - 1];
        const cpsX = (point.x + prev.x) / 2;
        path += ` C ${cpsX},${prev.y} ${cpsX},${point.y} ${point.x},${point.y}`;
      }
    });
    return path.trim();
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
  // Kalau pieCategoryFilter aktif (kategori dipilih dari box "Total Spend Direct & Indirect"),
  // pie chart ini hanya menghitung order dari kategori tersebut.
  const pieChartData = useMemo(() => {
    const catMap = {};
    let grandTotal = 0;
    const baseOrders = (pieCategoryFilter
      ? yearFilteredOrders.filter((order) => getOrderCategory(order) === pieCategoryFilter)
      : yearFilteredOrders
    ).filter((order) => !originFilter || getOriginBucket(order) === originFilter);

    if (drillLevel === 0) {
      baseOrders.forEach((order) => {
        const cat = getParentCategory(normalizeCategory(getOrderCategory(order)));
        const cost = getOrderTotal(order);
        catMap[cat] = (catMap[cat] || 0) + cost;
        grandTotal += cost;
      });
    } else if (drillLevel === 1 && selectedGroup) {
      baseOrders.forEach((order) => {
        const normCat = normalizeCategory(getOrderCategory(order));
        if (getParentCategory(normCat) === selectedGroup) {
          const cost = getOrderTotal(order);
          const subKey = pieCategoryFilter ? getOrderSubcategory(order) : normCat;
          catMap[subKey] = (catMap[subKey] || 0) + cost;
          grandTotal += cost;
        }
      });
    }

    const colorPalette = {
      'Direct': '#DC2626',
      'Indirect': '#A855F7',
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
  }, [yearFilteredOrders, drillLevel, selectedGroup, pieCategoryFilter, originFilter]);

  // === DATA UNTUK PIE CHART 2 (IMPORT VS LOCAL) ===
  // Ikut kefilter Direct/Indirect yang sama dengan pie chart Category (dipilih lewat box "Total Spending"),
  // dan kalau pieCategoryFilter aktif, ikut kefilter ke kategori spesifik itu juga.
  const originPieChartData = useMemo(() => {
    const originMap = { 'Local': 0, 'Import': 0 };
    let grandTotal = 0;

    let ordersForOrigin = (drillLevel === 1 && selectedGroup)
      ? yearFilteredOrders.filter((order) => getParentCategory(normalizeCategory(getOrderCategory(order))) === selectedGroup)
      : yearFilteredOrders;

    if (pieCategoryFilter) {
      ordersForOrigin = ordersForOrigin.filter((order) => getOrderCategory(order) === pieCategoryFilter);
    }

    ordersForOrigin.forEach((order) => {
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
          color: originName === 'Import' ? '#A855F7' : '#10B981'
        };
      });

    return { categories, grandTotal };
  }, [yearFilteredOrders, drillLevel, selectedGroup, pieCategoryFilter]);


  // === FUNGSI HELPER UNTUK MENGGAMBAR SVG PIE CHART ===
  const renderGenericPieChart = (data, totalValue, onSliceClick = null, isClickable = false, selectedName = null) => {
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
        px: cx + ((radius + innerRadius) / 2) * Math.cos(midRad),
        py: cy + ((radius + innerRadius) / 2) * Math.sin(midRad),
        lx1, ly1, lx2, ly2, lx3, ly3,
        textAnchor: isRight ? 'start' : 'end',
        isRight,
        showLabel: index < maxLabels && sliceAngle > 5
      };
    });

    // Anti-tabrakan label: kelompokkan per sisi (kiri/kanan), urutkan berdasarkan
    // posisi vertikal, lalu paksa jarak minimum antar label supaya tidak numpuk.
    const minLabelGap = 30;
    ['right', 'left'].forEach((side) => {
      const group = slices
        .filter((s) => s.showLabel && (side === 'right' ? s.isRight : !s.isRight))
        .sort((a, b) => a.ly3 - b.ly3);
      for (let i = 1; i < group.length; i++) {
        const minY = group[i - 1].ly3 + minLabelGap;
        if (group[i].ly3 < minY) group[i].ly3 = minY;
      }
    });

    slices.forEach((s) => {
      s.textX = s.lx3 + (s.isRight ? 6 : -6);
      s.textY = s.ly3 + 4;
    });

    const hoveredO = hoveredOriginSlice ? slices.find((s) => s.name === hoveredOriginSlice) : null;
    const tipW = 150, tipH = 42;
    const tipX = hoveredO ? Math.min(Math.max(hoveredO.px - tipW / 2, 0), 440 - tipW) : 0;
    const tipY = hoveredO ? Math.min(Math.max(hoveredO.py - tipH - 12, 0), 250 - tipH) : 0;

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
                className={`transition-all duration-200 ${isClickable ? 'cursor-pointer' : ''}`}
                opacity={(hoveredOriginSlice && hoveredOriginSlice !== slice.name) || (selectedName && selectedName !== slice.name) ? 0.45 : 1}
                onMouseEnter={() => setHoveredOriginSlice(slice.name)}
                onMouseLeave={() => setHoveredOriginSlice(null)}
                onClick={() => isClickable && onSliceClick && onSliceClick(slice.name)}
              />
            ))}

            {slices.map((slice, i) => (
              slice.showLabel && (
                <g key={`label-${i}`} className="pointer-events-none">
                  <polyline
                    points={`${slice.lx1},${slice.ly1} ${slice.lx2},${slice.ly2} ${slice.lx3},${slice.ly3}`}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="1.8"
                  />
                  <text x={slice.textX} y={slice.textY - 6} textAnchor={slice.textAnchor} fill={slice.color} className="text-[11px] font-bold">
                    <tspan x={slice.textX}>{slice.name}</tspan>
                    <tspan x={slice.textX} dy="13">{formatShortUSD(slice.value)} ({slice.percentage}%)</tspan>
                  </text>
                </g>
              )
            ))}

            {hoveredO && (
              <g className="pointer-events-none">
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="6" fill={isDarkMode ? '#0F172A' : '#FFFFFF'} stroke={isDarkMode ? '#334155' : '#E5E7EB'} />
                <text x={tipX + 10} y={tipY + 17} className={`text-[11px] font-bold ${isDarkMode ? 'fill-white' : 'fill-gray-900'}`}>{hoveredO.name}</text>
                <text x={tipX + 10} y={tipY + 32} className={`text-[11px] ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}>{formatShortUSD(hoveredO.value)} ({hoveredO.percentage}%)</text>
              </g>
            )}
          </svg>
        </div>

        <div className="w-full mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-xs">
          {data.map((cat, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 max-w-[180px] ${isClickable ? 'cursor-pointer' : ''}`}
              onClick={() => isClickable && onSliceClick && onSliceClick(cat.name)}
              title={`${cat.name}: ${formatUSD(cat.value)}`}
              onMouseEnter={() => setHoveredOriginSlice(cat.name)}
              onMouseLeave={() => setHoveredOriginSlice(null)}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
              <span className={`font-semibold truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{cat.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };


  // === PIE CHART PENUH UNTUK "TOTAL SPEND BY CATEGORY" ===
  // Persen di dalam slice, nama kategori di luar dengan garis penghubung, legend sederhana di bawah.
  const renderCategoryPieChart = (data, totalValue, onSliceClick = null, isClickable = false) => {
    if (!data || data.length === 0 || totalValue === 0) {
      return (
        <div className="h-72 flex items-center justify-center text-gray-400 text-sm relative">
          No data available in this category for the selected year.
        </div>
      );
    }

    let cumulativeAngle = 0;
    const radius = 95;
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
      const largeArcFlag = sliceAngle > 180 ? 1 : 0;

      const pathData = sliceAngle >= 359.9
        ? `M ${cx - radius},${cy} A ${radius},${radius} 0 1,0 ${cx + radius},${cy} A ${radius},${radius} 0 1,0 ${cx - radius},${cy} Z`
        : `M ${cx},${cy} L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag},1 ${x2},${y2} Z`;

      // Posisi persen di dalam slice (satu slice penuh -> di tengah lingkaran)
      const innerR = sliceAngle >= 359.9 ? 0 : radius * 0.62;
      const px = cx + innerR * Math.cos(midRad);
      const py = cy + innerR * Math.sin(midRad);

      // Garis penghubung label di luar
      const lx1 = cx + (radius + 2) * Math.cos(midRad);
      const ly1 = cy + (radius + 2) * Math.sin(midRad);
      const lx2 = cx + (radius + 18) * Math.cos(midRad);
      const ly2 = cy + (radius + 18) * Math.sin(midRad);
      const isRight = Math.cos(midRad) >= 0;
      const lx3 = lx2 + (isRight ? 14 : -14);
      const ly3 = ly2;

      return {
        ...cat,
        pathData,
        px, py, lx1, ly1, lx2, ly2, lx3, ly3,
        isRight,
        textAnchor: isRight ? 'start' : 'end',
        showInside: sliceAngle > 18,
        showLabel: index < maxLabels && sliceAngle > 3 && sliceAngle < 359.9
      };
    });

    // Anti-tabrakan label per sisi
    const minLabelGap = 16;
    ['right', 'left'].forEach((side) => {
      const group = slices
        .filter((s) => s.showLabel && (side === 'right' ? s.isRight : !s.isRight))
        .sort((a, b) => a.ly3 - b.ly3);
      for (let i = 1; i < group.length; i++) {
        const minY = group[i - 1].ly3 + minLabelGap;
        if (group[i].ly3 < minY) group[i].ly3 = minY;
      }
    });
    slices.forEach((s) => {
      s.textX = s.lx3 + (s.isRight ? 5 : -5);
      s.textY = s.ly3 + 4;
    });

    const hovered = hoveredCategorySlice ? slices.find((s) => s.name === hoveredCategorySlice) : null;
    const tipW = 150;
    const tipH = 42;
    const tipX = hovered ? Math.min(Math.max(hovered.px - tipW / 2, 0), 440 - tipW) : 0;
    const tipY = hovered ? Math.min(Math.max(hovered.py - tipH - 10, 0), 250 - tipH) : 0;

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
                strokeWidth="2"
                className={`transition-all duration-200 ${isClickable ? 'cursor-pointer' : ''}`}
                opacity={hoveredCategorySlice && hoveredCategorySlice !== slice.name ? 0.55 : 1}
                onMouseEnter={() => setHoveredCategorySlice(slice.name)}
                onMouseLeave={() => setHoveredCategorySlice(null)}
                onClick={() => isClickable && onSliceClick && onSliceClick(slice.name)}
              />
            ))}

            {slices.map((slice, i) => (
              slice.showInside && (
                <text
                  key={`pct-${i}`}
                  x={slice.px}
                  y={slice.py}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#FFFFFF"
                  className="text-[13px] font-bold pointer-events-none"
                >
                  {Math.round(slice.percentage)}%
                </text>
              )
            ))}

            {slices.map((slice, i) => (
              slice.showLabel && (
                <g key={`label-${i}`} className="pointer-events-none">
                  <polyline
                    points={`${slice.lx1},${slice.ly1} ${slice.lx2},${slice.ly2} ${slice.lx3},${slice.ly3}`}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="1.5"
                  />
                  <text
                    x={slice.textX}
                    y={slice.textY}
                    textAnchor={slice.textAnchor}
                    className={`text-[11px] font-semibold ${isDarkMode ? 'fill-slate-200' : 'fill-gray-700'}`}
                  >
                    {slice.showInside ? slice.name : `${slice.name} (${slice.percentage}%)`}
                  </text>
                </g>
              )
            ))}

            {hovered && (
              <g className="pointer-events-none">
                <rect
                  x={tipX}
                  y={tipY}
                  width={tipW}
                  height={tipH}
                  rx="6"
                  fill={isDarkMode ? '#0F172A' : '#FFFFFF'}
                  stroke={isDarkMode ? '#334155' : '#E5E7EB'}
                />
                <text x={tipX + 10} y={tipY + 17} className={`text-[11px] font-bold ${isDarkMode ? 'fill-white' : 'fill-gray-900'}`}>
                  {hovered.name}
                </text>
                <text x={tipX + 10} y={tipY + 32} className={`text-[11px] ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}>
                  {formatShortUSD(hovered.value)} ({hovered.percentage}%)
                </text>
              </g>
            )}
          </svg>
        </div>

        <div className="w-full mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-xs max-h-24 overflow-y-auto">
          {data.map((cat, i) => (
            <button
              key={i}
              type="button"
              onClick={() => isClickable && onSliceClick && onSliceClick(cat.name)}
              onMouseEnter={() => setHoveredCategorySlice(cat.name)}
              onMouseLeave={() => setHoveredCategorySlice(null)}
              title={`${cat.name}: ${formatUSD(cat.value)} (${cat.percentage}%)`}
              className={`flex items-center gap-2 max-w-[180px] ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
              <span className={`font-semibold truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderDrilldownPieChart = () => {
    const { categories, grandTotal } = pieChartData;

    // Klik slice utama -> buka popup sub-kategori (tombol di popup masih bisa drill-down di dalam chart)
    const handleSliceClick = (sliceName) => {
      if (drillLevel === 0) setSubPopupGroup(sliceName);
    };

    const renderSubCategoryPopup = () => {
      if (!subPopupGroup || drillLevel !== 0) return null;
      const groupSlice = categories.find((c) => c.name === subPopupGroup);
      if (!groupSlice) return null;

      // Sumber data sama persis dengan pie (ikut filter tahun, kategori, dan origin)
      const baseOrders = (pieCategoryFilter
        ? yearFilteredOrders.filter((order) => getOrderCategory(order) === pieCategoryFilter)
        : yearFilteredOrders
      ).filter((order) => !originFilter || getOriginBucket(order) === originFilter);

      const subMap = {};
      baseOrders.forEach((order) => {
        const normCat = normalizeCategory(getOrderCategory(order));
        if (getParentCategory(normCat) !== subPopupGroup) return;
        // Setelah box filter dipilih: sub-category = subcategory di dalam kategori itu; tanpa filter: pecahan kategori utama
        const subKey = pieCategoryFilter ? getOrderSubcategory(order) : normCat;
        if (!subMap[subKey]) subMap[subKey] = { name: subKey, value: 0, pos: new Set(), lines: 0 };
        subMap[subKey].value += getOrderTotal(order);
        subMap[subKey].pos.add(getPoNumber(order));
        subMap[subKey].lines += 1;
      });
      const groupTotal = Object.values(subMap).reduce((sum, r) => sum + r.value, 0);
      const palette = ['#DC2626', '#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#64748B', '#14B8A6'];
      const subRows = Object.values(subMap)
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((r, i) => ({ ...r, poCount: r.pos.size, pct: groupTotal > 0 ? (r.value / groupTotal) * 100 : 0, color: palette[i % palette.length] }));
      const maxVal = Math.max(...subRows.map((r) => r.value), 1);

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSubPopupGroup(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                  Sub-categories{pieCategoryFilter ? ` of ${pieCategoryFilter}` : ''} • {selectedYear === 'All' ? 'All Time' : selectedYear}{originFilter ? ` • ${originFilter}` : ''}
                </div>
                <h3 className={`font-bold text-lg flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: groupSlice.color }}></span>
                  {subPopupGroup}
                </h3>
              </div>
              <button
                onClick={() => setSubPopupGroup(null)}
                className={`text-sm px-2 py-1 rounded-md cursor-pointer ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Total Spend', value: formatUSDNoDecimal(groupSlice.value) },
                { label: 'Share of Total', value: `${groupSlice.percentage}%` },
                { label: 'Sub-categories', value: subRows.length }
              ].map((st) => (
                <div key={st.label} className={`px-3 py-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                  <div className={`text-[10px] uppercase font-semibold ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{st.label}</div>
                  <div className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{st.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {subRows.map((r) => (
                <div key={r.name}>
                  <div className="flex items-center justify-between gap-3 text-xs mb-1">
                    <span className={`font-semibold truncate ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`} title={r.name}>{r.name}</span>
                    <span className={`shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSDNoDecimal(r.value)}</span>
                      {' '}• {r.pct.toFixed(1)}% • {r.poCount} PO
                    </span>
                  </div>
                  <div className={`h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <div className="h-full rounded-full" style={{ width: `${(r.value / maxVal) * 100}%`, backgroundColor: r.color }}></div>
                  </div>
                </div>
              ))}
              {subRows.length === 0 && (
                <p className={`py-4 text-center text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No sub-category data.</p>
              )}
            </div>

          </div>
        </div>
      );
    };

    return (
      <div className="w-full flex flex-col">
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
          <span className={`ml-2 pl-3 border-l ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}>
            Total: <span className="font-bold">{formatUSDNoDecimal(grandTotal)}</span>
          </span>
        </div>
        
        {renderCategoryPieChart(categories, grandTotal, handleSliceClick, drillLevel === 0)}
        {renderSubCategoryPopup()}
      </div>
    );
  };

  // Popup detail Import / Local (dipakai tab Category & tab Supplier)
  const renderOriginDetailPopup = ({ originName, slices, orders, contextLabel, onClose }) => {
    if (!originName) return null;
    const slice = slices.find((c) => c.name === originName);
    if (!slice) return null;

    const rows = orders.filter((o) => getOriginBucket(o) === originName);

    const aggregate = (keyFn) => {
      const map = {};
      rows.forEach((o) => {
        const key = keyFn(o) || '-';
        if (!map[key]) map[key] = { name: key, value: 0, pos: new Set() };
        map[key].value += getOrderTotal(o);
        map[key].pos.add(getPoNumber(o));
      });
      return Object.values(map).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
        .map((r) => ({ ...r, poCount: r.pos.size, pct: slice.value > 0 ? (r.value / slice.value) * 100 : 0 }));
    };
    const byCategory = aggregate((o) => getOrderCategory(o));
    const bySupplier = aggregate((o) => getOrderSupplier(o)).slice(0, 5);
    const maxCat = Math.max(...byCategory.map((r) => r.value), 1);
    const poCount = new Set(rows.map((o) => getPoNumber(o))).size;
    const supplierCount = new Set(rows.map((o) => getOrderSupplier(o))).size;
    const avgPO = poCount > 0 ? slice.value / poCount : 0;
    const stats = [
      { label: 'Total Spend', value: formatUSDNoDecimal(slice.value) },
      { label: 'Share of Total', value: `${slice.percentage}%` },
      { label: 'Total PO', value: poCount.toLocaleString('en-US') },
      { label: 'Avg PO Value', value: formatUSDNoDecimal(avgPO) },
      { label: 'Suppliers', value: supplierCount.toLocaleString('en-US') },
      { label: 'Categories', value: byCategory.length.toLocaleString('en-US') }
    ];

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                Origin • {selectedYear === 'All' ? 'All Time' : selectedYear}{contextLabel ? ` • ${contextLabel}` : ''}
              </div>
              <h3 className={`font-bold text-lg flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                {originName}
              </h3>
            </div>
            <button
              onClick={() => onClose()}
              className={`text-sm px-2 py-1 rounded-md cursor-pointer ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            {stats.map((st) => (
              <div key={st.label} className={`px-3 py-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                <div className={`text-[10px] uppercase font-semibold ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{st.label}</div>
                <div className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{st.value}</div>
              </div>
            ))}
          </div>

          <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Spend by Category</h4>
          <div className="flex flex-col gap-3 mb-5">
            {byCategory.map((r) => (
              <div key={r.name}>
                <div className="flex items-center justify-between gap-3 text-xs mb-1">
                  <span className={`font-semibold truncate ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`} title={r.name}>{r.name}</span>
                  <span className={`shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSDNoDecimal(r.value)}</span>
                    {' '}• {r.pct.toFixed(1)}% • {r.poCount} PO
                  </span>
                </div>
                <div className={`h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                  <div className="h-full rounded-full" style={{ width: `${(r.value / maxCat) * 100}%`, backgroundColor: slice.color }}></div>
                </div>
              </div>
            ))}
            {byCategory.length === 0 && (
              <p className={`py-4 text-center text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No category data.</p>
            )}
          </div>

          <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Top Suppliers</h4>
          <div className="overflow-x-auto">
            <table className={`w-full text-left text-xs ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              <thead className={`uppercase border-b ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-gray-200 text-gray-400'}`}>
                <tr>
                  <th className="py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-2 font-semibold">Supplier</th>
                  <th className="py-2 pr-2 font-semibold text-right">Total PO</th>
                  <th className="py-2 pl-2 font-semibold text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {bySupplier.map((r, i) => (
                  <tr key={r.name} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <td className="py-2 pr-2">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium">{r.name}</td>
                    <td className="py-2 pr-2 text-right">{r.poCount}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap font-semibold">{formatUSDNoDecimal(r.value)}</td>
                  </tr>
                ))}
                {bySupplier.length === 0 && (
                  <tr><td colSpan={4} className={`py-4 text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No supplier data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderOriginPieChart = () => {
    const { categories, grandTotal } = originPieChartData;

    // Sumber data sama persis dengan pie Origin (ikut filter tahun, Direct/Indirect, dan kategori)
    let base = (drillLevel === 1 && selectedGroup)
      ? yearFilteredOrders.filter((o) => getParentCategory(normalizeCategory(getOrderCategory(o))) === selectedGroup)
      : yearFilteredOrders;
    if (pieCategoryFilter) base = base.filter((o) => getOrderCategory(o) === pieCategoryFilter);

    return (
      <>
        {renderGenericPieChart(
          categories,
          grandTotal,
          (name) => setOriginPopup(name),
          true,
          originPopup
        )}
        {renderOriginDetailPopup({
          originName: originPopup,
          slices: categories,
          orders: base,
          contextLabel: pieCategoryFilter || ((drillLevel === 1 && selectedGroup) ? selectedGroup : null),
          onClose: () => setOriginPopup(null)
        })}
      </>
    );
  };

  const renderCategoryFilterBox = () => {
    if (categoryFilterList.length === 0) {
      return <div className="h-32 flex items-center justify-center text-gray-400 text-sm">No category data available</div>;
    }
    return (
      <div className="flex flex-wrap justify-center gap-4">
        {categoryFilterList.map((cat) => {
          const isSelected = pieCategoryFilter === cat.name;
          return (
            <button
              key={cat.name}
              onClick={() => selectCategoryFilter(cat.name)}
              title="Click to filter the Total Spend by Category & Origin charts to this category"
              className={`relative flex flex-col items-center gap-2 px-7 py-6 min-w-[180px] rounded-2xl border text-center transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                isSelected
                  ? (isDarkMode ? 'bg-red-950/40 border-red-500 ring-2 ring-red-500/40' : 'bg-red-50 border-red-400 ring-2 ring-red-300/60')
                  : (isDarkMode ? 'bg-[#0F172A] border-slate-700 hover:border-red-500' : 'bg-gray-50 border-gray-200 hover:border-red-400')
              }`}
            >
              <span className={`text-sm font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>
                {cat.name}
              </span>
              <span className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatShortUSD(cat.total)}</span>
            </button>
          );
        })}
      </div>
    );
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

  // Popup detail PO per supplier (dipakai chart Pareto dan kartu tunggal)
  const renderSupplierDetailPopup = (items) => {
          const idx = items.findIndex((it) => it.name === supplierDetailName);
          if (idx === -1) return null;
          const sel = items[idx];
          const rows = sel.rows || [];
          const isVital = idx === 0 || sel.cumPercent <= 80;
          const stats = [
            { label: 'Rank', value: `#${idx + 1} of ${items.length}` },
            { label: 'Total Spend', value: formatUSD(sel.totalCost) },
            { label: 'Share of Total', value: `${sel.indPercent}%` },
            { label: 'Cumulative', value: `${sel.cumPercent}%` },
            { label: 'Total PO', value: new Set(rows.map((r) => r.po)).size },
            { label: 'Transactions', value: rows.length }
          ];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setSupplierDetailName(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                className={`w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                      {supplierParetoTab === 'lowest20' ? 'Lowest' : 'Top'} 20 Supplier{supplierCategoryGroup ? ` • ${supplierCategoryGroup}` : ''}{supplierOriginFilter ? ` • ${supplierOriginFilter}` : ''}
                    </div>
                    <h3 className={`font-bold text-base break-words ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sel.name}</h3>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isVital ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600') : (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600')}`}>
                      {isVital ? 'Vital few (within 80%)' : 'Remaining suppliers'}
                    </span>
                  </div>
                  <button
                    onClick={() => setSupplierDetailName(null)}
                    className={`text-sm px-2 py-1 rounded-md cursor-pointer ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
                    aria-label="Close detail"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {stats.map((st) => (
                    <div key={st.label} className={`px-3 py-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                      <div className={`text-[10px] uppercase font-semibold ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{st.label}</div>
                      <div className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{st.value}</div>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className={`w-full text-left text-xs ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                    <thead className={`uppercase border-b sticky top-0 ${isDarkMode ? 'border-slate-700 text-slate-500 bg-[#1E293B]' : 'border-gray-200 text-gray-400 bg-white'}`}>
                      <tr>
                        <th className="py-2 pr-2 font-semibold">PO Number</th>
                        <th className="py-2 pr-2 font-semibold">Date</th>
                        <th className="py-2 pr-2 font-semibold">Category</th>
                        <th className="py-2 pr-2 font-semibold">Origin</th>
                        <th className="py-2 pr-2 font-semibold text-right">Value</th>
                        <th className="py-2 pl-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                          <td className="py-2 pr-2 font-medium">{r.po}</td>
                          <td className="py-2 pr-2 whitespace-nowrap">{r.date && r.date !== '-' ? String(r.date).slice(0, 10) : '-'}</td>
                          <td className="py-2 pr-2">{r.category}</td>
                          <td className="py-2 pr-2">{r.origin}</td>
                          <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold">{formatUSD(r.cost)}</td>
                          <td className="py-2 pl-2">{r.status}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={6} className={`py-4 text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No transaction data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
    const step = Math.min(chartW / numBars, 90); // batasi jarak antar batang supaya item sedikit tidak melebar
    const offsetX = (chartW - step * numBars) / 2; // kelompok batang diletakkan di tengah area chart
    const barW = Math.min(Math.max(step * 0.5, 12), 40);

    const linePoints = items.map((item, i) => {
      const cx = padLeft + offsetX + (i + 0.5) * step;
      const cy = padTop + chartH - (item.cumPercent / 100) * chartH;
      return { cx, cy, percent: item.cumPercent, name: item.name };
    });

    const pathString = linePoints.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.cx},${pt.cy}` : `${acc} L ${pt.cx},${pt.cy}`;
    }, '');

    return (
      <div className="w-full flex flex-col gap-6">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-1 gap-6 items-start">
          <div className="lg:col-span-8 xl:col-span-1 min-w-0 flex flex-col items-center">
            <div className="w-full overflow-x-auto scrollbar-thin">
              <div className="min-w-[650px] xl:min-w-[440px] relative">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} style={{ width: svgWidth, maxWidth: '100%', height: 'auto' }} className="block mx-auto overflow-visible select-none">
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
                    const cx = padLeft + offsetX + (i + 0.5) * step;
                    const xBar = cx - barW / 2;
                    const hBar = (item.totalCost / maxBarVal) * chartH;
                    const yBar = padTop + chartH - hBar;

                    return (
                      <g key={i} className="group cursor-pointer" onClick={() => setSupplierDetailName(item.name)}>
                        {/* Area klik selebar kolom supaya bar kecil tetap mudah diklik */}
                        <rect x={cx - step / 2} y={padTop} width={step} height={chartH + 60} fill="transparent" />
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
                        >
                          <title>{`${item.name}: ${formatUSD(item.totalCost)} (cumulative ${item.cumPercent}%) - click for details`}</title>
                        </rect>
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

          <div className="lg:col-span-4 xl:col-span-1 w-full min-w-0">
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
                      <tr key={idx} onClick={() => setSupplierDetailName(item.name)} className={`cursor-pointer ${isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-purple-50/50'}`}>
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

        {renderSupplierDetailPopup(items)}
      </div>
    );
  };

  // Popup detail PO per item (dipakai chart Pareto dan kartu tunggal)
  const renderCategoryDetailPopup = (items) => {
          const idx = items.findIndex((it) => it.name === paretoDetailName);
          if (idx === -1) return null;
          const sel = items[idx];
          const rows = sel.rows || [];
          const totalQty = rows.reduce((sum, r) => sum + (r.qty || 0), 0);
          const hasQty = rows.some((r) => r.qty !== null && r.qty !== undefined);
          const isVital = idx === 0 || sel.cumPercent <= 80;
          const stats = [
            { label: 'Rank', value: `#${idx + 1} of ${items.length}` },
            { label: 'Total Spend', value: formatUSD(sel.totalCost) },
            { label: 'Share of Total', value: `${sel.indPercent}%` },
            { label: 'Cumulative', value: `${sel.cumPercent}%` },
            { label: 'Total PO', value: new Set(rows.map((r) => r.po)).size },
            { label: hasQty ? 'Total Qty' : 'Transactions', value: hasQty ? totalQty.toLocaleString('en-US') : rows.length }
          ];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setParetoDetailName(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                className={`w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                      {barChartGroup}{originFilter ? ` • ${originFilter}` : ''}
                    </div>
                    <h3 className={`font-bold text-base break-words ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sel.name}</h3>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isVital ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600') : (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600')}`}>
                      {isVital ? 'Vital few (within 80%)' : 'Remaining items'}
                    </span>
                  </div>
                  <button
                    onClick={() => setParetoDetailName(null)}
                    className={`text-sm px-2 py-1 rounded-md cursor-pointer ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
                    aria-label="Close detail"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {stats.map((st) => (
                    <div key={st.label} className={`px-3 py-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                      <div className={`text-[10px] uppercase font-semibold ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{st.label}</div>
                      <div className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{st.value}</div>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className={`w-full text-left text-xs ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                    <thead className={`uppercase border-b sticky top-0 ${isDarkMode ? 'border-slate-700 text-slate-500 bg-[#1E293B]' : 'border-gray-200 text-gray-400 bg-white'}`}>
                      <tr>
                        <th className="py-2 pr-2 font-semibold">PO Number</th>
                        <th className="py-2 pr-2 font-semibold">Date</th>
                        <th className="py-2 pr-2 font-semibold">Supplier</th>
                        {hasQty && <th className="py-2 pr-2 font-semibold text-right">Qty</th>}
                        <th className="py-2 pr-2 font-semibold text-right">Value</th>
                        <th className="py-2 pl-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                          <td className="py-2 pr-2 font-medium">{r.po}</td>
                          <td className="py-2 pr-2 whitespace-nowrap">{r.date && r.date !== '-' ? String(r.date).slice(0, 10) : '-'}</td>
                          <td className="py-2 pr-2">{r.supplier}</td>
                          {hasQty && <td className="py-2 pr-2 text-right">{r.qty ?? '-'}</td>}
                          <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold">{formatUSD(r.cost)}</td>
                          <td className="py-2 pl-2">{r.status}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={hasQty ? 6 : 5} className={`py-4 text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No transaction data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
  };

  const renderCategoryParetoChart = () => {
    // Kosongkan Pareto sampai user klik salah satu box kategori (barChartGroup terisi)
    if (!barChartGroup) {
      return (
        <div className={`h-64 flex flex-col items-center justify-center gap-2 text-sm ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          <i className="fa-solid fa-hand-pointer text-2xl opacity-60"></i>
          <span>Click a category box above to see its Pareto.</span>
        </div>
      );
    }

    const { items } = categoryParetoData;

    if (!items || items.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          No category spend data available for Pareto analysis.
        </div>
      );
    }

    const labelName = barChartGroup ? 'ITEM' : 'CATEGORY';
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
    const step = Math.min(chartW / numBars, 90); // batasi jarak antar batang supaya item sedikit tidak melebar
    const offsetX = (chartW - step * numBars) / 2; // kelompok batang diletakkan di tengah area chart
    const barW = Math.min(Math.max(step * 0.5, 12), 40);

    const linePoints = items.map((item, i) => {
      const cx = padLeft + offsetX + (i + 0.5) * step;
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
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} style={{ width: svgWidth, maxWidth: '100%', height: 'auto' }} className="block mx-auto overflow-visible select-none">
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
                    const cx = padLeft + offsetX + (i + 0.5) * step;
                    const xBar = cx - barW / 2;
                    const hBar = (item.totalCost / maxBarVal) * chartH;
                    const yBar = padTop + chartH - hBar;

                    return (
                      <g key={i} className="group cursor-pointer" onClick={() => setParetoDetailName(item.name)}>
                        {/* Area klik selebar kolom supaya bar kecil tetap mudah diklik */}
                        <rect x={cx - step / 2} y={padTop} width={step} height={chartH + 60} fill="transparent" />
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
                        >
                          <title>{`${item.name}: ${formatUSD(item.totalCost)} (cumulative ${item.cumPercent}%) - click for details`}</title>
                        </rect>
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
                      <th className="py-2.5 px-3">{labelName}</th>
                      <th className="py-2.5 px-2 text-right">SPEND</th>
                      <th className="py-2.5 px-2 text-right">CUMULATIVE (%)</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/60 text-slate-300' : 'divide-gray-200 text-gray-700'}`}>
                    {items.map((item, idx) => (
                      <tr key={idx} onClick={() => setParetoDetailName(item.name)} className={`cursor-pointer ${isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-purple-50/50'}`}>
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

        {renderCategoryDetailPopup(items)}
      </div>
    );
  };

  // === TAB NAVIGATION ===
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarDashboardOpen');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('sidebarDashboardOpen', isDashboardMenuOpen);
  }, [isDashboardMenuOpen]);

  const dashboardTabs = [
    { id: 'overview', label: 'Overview', icon: 'fa-gauge-high' },
    { id: 'category', label: 'Spend by Category', icon: 'fa-chart-pie' },
    { id: 'supplier', label: 'Spend by Supplier', icon: 'fa-users' },
  ];

  return (
    <>
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

      <AppLayout
        activePage={activePage}
        changePage={changePage}
        onLogout={() => {
          dashboardYearByTab = { ...DEFAULT_YEAR_BY_TAB }; // pilihan tahun tidak terbawa ke user lain
          if (typeof onLogout === 'function') onLogout();
        }}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        submenu={{
          page: 'dashboard',
          open: isDashboardMenuOpen,
          onToggle: () => setIsDashboardMenuOpen((prev) => !prev),
          items: dashboardTabs,
          activeId: activeTab,
          onSelect: setActiveTab,
        }}
      >
        <div className="space-y-6">
          
          {/* WELCOME BANNER: hanya tampil di tab Overview, pakai font Poppins */}
          {activeTab === 'overview' && (
          <div className="relative overflow-hidden rounded-2xl shadow-xs bg-[#00306B] h-[244px] shrink-0" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {/* Foto Detpak: ukuran DITETAPKAN (1270px, sama seperti tampilan default) dan menempel di kanan,
                jadi tidak membesar/mengecil saat lebar layar atau isi halaman berubah. Sisi kiri foto memudar ke biru. */}
            <img
              src="/images/bg5.jpeg"
              alt=""
              draggable={false}
              className="hidden sm:block absolute right-0 bottom-[-14px] w-[1270px] max-w-none h-auto min-h-[258px] object-cover object-right-bottom pointer-events-none select-none"
              style={{
                WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 35%)',
                maskImage: 'linear-gradient(90deg, transparent 0%, #000 35%)',
              }}
            />
            {/* Overlay gradasi biru: Pekat di kiri untuk teks, melebur mulus ke gambar di kanan */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, rgba(0,32,74,0.98) 0%, rgba(0,71,151,0.85) 35%, rgba(0,71,151,0.4) 60%, rgba(0,71,151,0) 85%)' }}
            ></div>

            <div className="relative z-10 p-7">
              <p className="text-blue-200 text-sm font-normal mb-0.5 tracking-wide">Welcome to</p>
              <h2 className="text-blue-50 text-2xl sm:text-[28px] font-medium mb-1.5 leading-tight tracking-normal">Detpak Smart Procurement Portal</h2>
              <p className="text-blue-100/90 text-sm font-light mb-5 tracking-wide">Digital. Efficient. Compliant. Sustainable.</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {[
                  { icon: 'fa-leaf', label: 'Right Materials\nRight People' },
                  { icon: 'fa-gear', label: 'Smarter Process\nHigher Productivity' },
                  { icon: 'fa-people-group', label: 'Stronger Partnerships\nGreater Value' },
                  { icon: 'fa-seedling', label: 'Sustainable\nFuture' },
                ].map((f, i, arr) => (
                  <React.Fragment key={f.label}>
                    <div className="flex items-center gap-2.5">
                      <i className={`fa-solid ${f.icon} text-blue-50 text-xl w-5 text-center shrink-0`}></i>
                      <span className="text-blue-50 text-xs font-normal leading-snug whitespace-pre-line tracking-wide">{f.label}</span>
                    </div>
                    {i < arr.length - 1 && <div className="hidden sm:block w-px h-8 bg-white/25"></div>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          )}

          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                <div className={`p-4 rounded-2xl border shadow-xs flex items-center gap-3 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center text-lg shrink-0">
                    <i className="fa-solid fa-calendar-days"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wider truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Year Filter</p>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      title="Select a year to filter all dashboard data"
                      className={`w-full mt-0.5 text-lg sm:text-xl font-black rounded-md pl-1 pr-1 py-0.5 outline-none cursor-pointer transition-colors truncate ${
                        isDarkMode
                          ? 'bg-slate-800 text-white border border-slate-600 focus:border-slate-400'
                          : 'bg-gray-50 text-gray-900 border border-gray-300 focus:border-gray-500'
                      }`}
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year} className="text-sm">
                          {year === 'All' ? 'All Time' : year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div ref={spendFilterRef} className={`relative p-4 rounded-2xl border shadow-xs flex items-center gap-3 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center text-lg shrink-0 font-bold">
                    $
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mb-0.5">
                      <p className={`text-xs font-semibold uppercase tracking-wider shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Spending</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                        {selectedYear === 'All' ? 'All Time' : selectedYear}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p title={formatUSD(filteredTotalCost)} className={`text-xl font-black break-words leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSDNoDecimal(filteredTotalCost)}</p>
                    </div>
                  </div>

                </div>

                <div className={`p-4 rounded-2xl border shadow-xs flex items-center gap-3 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center text-lg shrink-0">
                    <i className="fa-solid fa-box-archive"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wider truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total PO</p>
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                      <p className={`text-xl font-black leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{kpiStats.totalOrders.toLocaleString('en-US')}</p>
                      {kpiStats.importCount > 0 && (
                        <span className="text-xs font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 whitespace-nowrap shrink-0">
                          {kpiStats.importCount.toLocaleString('en-US')} Import
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border shadow-xs flex items-center gap-3 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-10 h-10 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-lg shrink-0">
                    <i className="fa-solid fa-chart-pie"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wider truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Average % Paid</p>
                    <p className={`text-xl font-black break-words leading-tight ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{kpiStats.avgPaid}%</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6">
              <div className={`p-6 rounded-2xl border shadow-xs min-w-0 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Total Spend by Month ({selectedYear === 'All' ? 'All Years' : selectedYear})
                    </h3>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-950/60 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>USD</span>
                  </div>
                  <div className={`flex items-center gap-5 text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[3px] border border-blue-600 bg-blue-400"></span>Total Spend (USD)</span>
                    <span className="flex items-center gap-2"><span className="w-5 h-0.5 bg-red-400 relative"><span className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-400"></span></span>Orders</span>
                  </div>
                </div>
                {(() => {
                  const W = 1000, H = 300;
                  const L = 62, R = 938, T = 34, B = 232; // area plot
                  const plotW = R - L, plotH = B - T;
                  const band = plotW / 12;
                  const cx = (i) => L + band * i + band / 2;
                  const yCost = (v) => B - (v / monthlyStats.maxVal) * plotH;
                  const yOrd = (v) => B - (v / monthlyStats.maxOrders) * plotH;
                  const barW = Math.min(band * 0.5, 40);
                  const grid = [0, 1, 2, 3, 4];
                  const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

                  // Tata letak label anti-tabrakan: tiap bulan dicoba beberapa posisi untuk label cost & label orders,
                  // dipilih kombinasi pertama yang kotaknya tidak saling bertumpuk (label cost, label orders, titik garis).
                  const hit = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
                  const labelLayout = monthlyStats.monthlyTotals.map((val, i) => {
                    const ord = monthlyStats.monthlyOrders[i];
                    if (val === null || ord === null) return null;
                    const x = cx(i);
                    const barTop = B - Math.max(B - yCost(val), val > 0 ? 2 : 0);
                    const barH = B - barTop;
                    const yo = yOrd(ord);
                    const marker = { x1: x - 6, x2: x + 6, y1: yo - 6, y2: yo + 6 };
                    const costOpts = [{ pos: 'above', y: barTop - 8 }];
                    if (barH >= 28) costOpts.push({ pos: 'inside', y: barTop + 17 });
                    const ordOpts = [
                      { pos: 'above', y: yo - 11 },
                      { pos: 'below', y: yo + 20 },
                      { pos: 'far', y: yo - 27 },
                    ];
                    for (const c of costOpts) {
                      const cBox = { x1: x - 21, x2: x + 21, y1: c.y - 12, y2: c.y + 3 };
                      if (hit(cBox, marker)) continue;
                      for (const o of ordOpts) {
                        const oBox = { x1: x - 14, x2: x + 14, y1: o.y - 12, y2: o.y + 3 };
                        if (!hit(cBox, oBox) && !hit(oBox, marker)) return { cost: c, ord: o };
                      }
                    }
                    return { cost: costOpts[costOpts.length - 1], ord: ordOpts[0] };
                  });

                  // Garis Orders dibuat melengkung halus (monotone cubic: tidak melampaui titik data).
                  // Putus di bulan yang tidak ada datanya.
                  const smoothSegment = (pts) => {
                    const n = pts.length;
                    if (n === 1) return `M ${pts[0].x},${pts[0].y}`;
                    const dx = [], m = [];
                    for (let i = 0; i < n - 1; i++) {
                      dx[i] = pts[i + 1].x - pts[i].x;
                      m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
                    }
                    const t = new Array(n);
                    t[0] = m[0];
                    t[n - 1] = m[n - 2];
                    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
                    for (let i = 0; i < n - 1; i++) {
                      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
                      const aa = t[i] / m[i], bb = t[i + 1] / m[i];
                      const sq = aa * aa + bb * bb;
                      if (sq > 9) {
                        const tau = 3 / Math.sqrt(sq);
                        t[i] = tau * aa * m[i];
                        t[i + 1] = tau * bb * m[i];
                      }
                    }
                    let d = `M ${pts[0].x},${pts[0].y}`;
                    for (let i = 0; i < n - 1; i++) {
                      const c1x = pts[i].x + dx[i] / 3;
                      const c1y = pts[i].y + (t[i] * dx[i]) / 3;
                      const c2x = pts[i + 1].x - dx[i] / 3;
                      const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
                      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
                    }
                    return d;
                  };
                  const segments = [];
                  let current = [];
                  monthlyStats.monthlyOrders.forEach((v, i) => {
                    if (v === null) {
                      if (current.length) segments.push(current);
                      current = [];
                    } else {
                      current.push({ x: cx(i), y: yOrd(v) });
                    }
                  });
                  if (current.length) segments.push(current);
                  const linePath = segments.map(smoothSegment).join(' ');

                  // Tooltip untuk bulan yang di-hover
                  const hv = hoveredMonth !== null && monthlyStats.monthlyTotals[hoveredMonth] !== null ? hoveredMonth : null;
                  const tipW = 148, tipH = 50;
                  const tipX = hv !== null ? Math.min(Math.max(cx(hv) - tipW / 2, 0), W - tipW) : 0;
                  const tipY = hv !== null
                    ? Math.max(-6, Math.min(yCost(monthlyStats.monthlyTotals[hv]), yOrd(monthlyStats.monthlyOrders[hv])) - tipH - 22)
                    : 0;

                  const gridColor = isDarkMode ? '#2A3649' : '#EEF1F6';
                  const axisText = isDarkMode ? 'fill-slate-500' : 'fill-gray-400';

                  return (
                    <div className="w-full h-72">
                      <style>{`
                        @keyframes spendBarRise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                        @keyframes spendFadeIn { from { opacity: 0; } to { opacity: 1; } }
                        .spend-bar { transform-box: fill-box; transform-origin: 50% 100%; animation: spendBarRise 650ms cubic-bezier(.22,.8,.3,1) both; }
                        .spend-fade { animation: spendFadeIn 450ms ease-out 450ms both; }
                        @media (prefers-reduced-motion: reduce) { .spend-bar, .spend-fade { animation: none; } }
                      `}</style>
                      <svg key={selectedYear} viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible" onMouseLeave={() => setHoveredMonth(null)}>

                        {grid.map((g) => {
                          const y = B - (g / 4) * plotH;
                          return (
                            <g key={`g-${g}`}>
                              <line x1={L} y1={y} x2={R} y2={y} stroke={gridColor} strokeWidth="1" />
                              <text x={L - 10} y={y + 4} textAnchor="end" className={`text-[11px] ${axisText}`}>
                                {g === 0 ? '$0' : formatShortUSD((monthlyStats.maxVal * g) / 4)}
                              </text>
                              <text x={R + 10} y={y + 4} textAnchor="start" className={`text-[11px] ${axisText}`}>
                                {Math.round((monthlyStats.maxOrders * g) / 4)}
                              </text>
                            </g>
                          );
                        })}

                        {monthlyStats.monthlyTotals.map((val, i) => {
                          if (val === null) return null;
                          const h = Math.max(B - yCost(val), val > 0 ? 2 : 0);
                          const x = cx(i) - barW / 2;
                          const y = B - h;
                          const r = Math.min(barW / 2.4, 9, h);
                          const dim = hv !== null && hv !== i;
                          return (
                            <g key={`b-${i}`} opacity={dim ? 0.5 : 1} style={{ transition: 'opacity 180ms ease' }}>
                              <path
                                className="spend-bar"
                                style={{ animationDelay: `${i * 35}ms` }}
                                d={`M ${x},${B} L ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + barW - r},${y} Q ${x + barW},${y} ${x + barW},${y + r} L ${x + barW},${B} Z`}
                                fill={isDarkMode ? '#3B82F6' : '#60A5FA'}
                                stroke={isDarkMode ? '#1D4ED8' : '#2563EB'}
                                strokeWidth="1.5"
                              />
                              {val > 0 && labelLayout[i]?.cost.pos === 'inside' ? (
                                <text className="spend-fade" x={cx(i)} y={labelLayout[i].cost.y} textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="600">{formatShortUSD(val)}</text>
                              ) : val > 0 && (
                                <text className={`spend-fade text-[11px] font-semibold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`} x={cx(i)} y={labelLayout[i] ? labelLayout[i].cost.y : y - 8} textAnchor="middle">{formatShortUSD(val)}</text>
                              )}
                            </g>
                          );
                        })}

                        <path className="spend-fade" d={linePath} fill="none" stroke="#F87171" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
                        {monthlyStats.monthlyOrders.map((v, i) => {
                          if (v === null) return null;
                          const y = yOrd(v);
                          const active = hv === i;
                          return (
                            <g key={`o-${i}`} className="spend-fade">
                              <circle cx={cx(i)} cy={y} r={active ? 5.5 : 3.75} fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#F87171" strokeWidth="2.25" style={{ transition: 'r 150ms ease' }} />
                              <text
                                x={cx(i)}
                                y={labelLayout[i] ? labelLayout[i].ord.y : y - 11}
                                textAnchor="middle"
                                className="text-[10px] font-semibold fill-red-400"
                                stroke={isDarkMode ? '#1E293B' : '#FFFFFF'}
                                strokeWidth="3"
                                paintOrder="stroke"
                                strokeLinejoin="round"
                              >{v}</text>
                            </g>
                          );
                        })}

                        {monthlyStats.months.map((m, i) => (
                          <text key={`m-${i}`} x={cx(i)} y={B + 22} textAnchor="middle" className={`text-[12px] ${hv === i ? (isDarkMode ? 'fill-white font-semibold' : 'fill-gray-900 font-semibold') : (isDarkMode ? 'fill-slate-400' : 'fill-gray-500')}`}>{m}</text>
                        ))}
                        <text x={(L + R) / 2} y={B + 50} textAnchor="middle" className={`text-[12px] font-semibold ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>
                          {selectedYear === 'All' ? 'All Years' : selectedYear}
                        </text>

                        {/* area hover per bulan */}
                        {monthlyStats.months.map((m, i) => (
                          <rect
                            key={`hit-${i}`}
                            x={L + band * i}
                            y={T - 10}
                            width={band}
                            height={plotH + 10}
                            fill="transparent"
                            onMouseEnter={() => setHoveredMonth(i)}
                          />
                        ))}

                        {hv !== null && (
                          <g className="pointer-events-none">
                            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="8" fill={isDarkMode ? '#0F172A' : '#FFFFFF'} stroke={isDarkMode ? '#334155' : '#E5E7EB'} />
                            <text x={tipX + 12} y={tipY + 19} className={`text-[11px] font-bold ${isDarkMode ? 'fill-white' : 'fill-gray-900'}`}>{fullMonths[hv]}</text>
                            <text x={tipX + 12} y={tipY + 35} className={`text-[11px] ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}>
                              {formatShortUSD(monthlyStats.monthlyTotals[hv])} • {monthlyStats.monthlyOrders[hv]} orders
                            </text>
                          </g>
                        )}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              <div className={`p-6 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <h3 className={`font-bold text-base mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Key Highlights ({selectedYear === 'All' ? 'All Time' : selectedYear})
                </h3>
                {(() => {
                  const prev = prevYearStats;
                  const hasPrev = !!(prev && prev.hasData);
                  const pctChange = (cur, old) => (hasPrev && old > 0 ? ((cur - old) / old) * 100 : null);
                  const fmtUSD0 = (v) => `USD ${Math.round(v || 0).toLocaleString('en-US')}`;
                  const rows = [
                    { label: 'Total Spend', value: fmtUSD0(kpiStats.totalCost), icon: 'fa-dollar-sign', bg: 'bg-red-600', delta: pctChange(kpiStats.totalCost, prev?.totalCost), goodWhenUp: true, unit: '%' },
                    { label: 'Total Orders', value: kpiStats.totalOrders.toLocaleString('en-US'), icon: 'fa-file-lines', bg: 'bg-blue-600', delta: pctChange(kpiStats.totalOrders, prev?.totalOrders), goodWhenUp: true, unit: '%' },
                    { label: 'Pending Payment', value: fmtUSD0(kpiStats.pendingPayment), icon: 'fa-wallet', bg: 'bg-red-600', delta: pctChange(kpiStats.pendingPayment, prev?.pendingPayment), goodWhenUp: false, unit: '%' },
                    { label: 'Average % Paid', value: `${kpiStats.avgPaid}%`, icon: 'fa-chart-pie', bg: 'bg-blue-600', delta: hasPrev ? kpiStats.avgPaid - prev.avgPaid : null, goodWhenUp: true, unit: ' pt' },
                  ];
                  const vsLabel = selectedYear === 'All' ? 'All Time' : `vs ${prev ? prev.year : parseInt(selectedYear, 10) - 1}`;
                  return (
                    <div className="flex flex-col">
                      {rows.map((r) => {
                        const hasDelta = r.delta !== null && r.delta !== undefined;
                        const isFlat = hasDelta && Math.abs(r.delta) < 0.05;
                        const up = hasDelta && r.delta > 0;
                        const good = up === r.goodWhenUp;
                        const deltaColor = !hasDelta || isFlat
                          ? (isDarkMode ? 'text-slate-500' : 'text-gray-400')
                          : good ? 'text-emerald-500' : 'text-red-500';
                        return (
                          <div key={r.label} className={`flex items-center gap-3 py-3 border-b last:border-b-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                            <div className={`w-10 h-10 rounded-lg ${r.bg} text-white flex items-center justify-center text-base shrink-0`}>
                              <i className={`fa-solid ${r.icon}`}></i>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{r.label}</p>
                              <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`} title={r.value}>{r.value}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-bold flex items-center justify-end gap-1 ${deltaColor}`}>
                                {hasDelta && !isFlat && <i className={`fa-solid ${up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`}></i>}
                                {hasDelta ? `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}${r.unit}` : '–'}
                              </p>
                              <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{vsLabel}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              </div>
            </>
          )}

          {activeTab === 'category' && (
            <div className="flex flex-col gap-6">
              {categoryFilterList.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Click a category box to filter all charts below.
                    </p>
                    {pieCategoryFilter && (
                      <button
                        onClick={resetCategoryFilter}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <i className="fa-solid fa-xmark"></i> Reset filter
                      </button>
                    )}
                  </div>
                  <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    <div className={`p-4 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <i className={`fa-solid fa-calendar-days text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}></i>
                        <span className={`text-xs font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Year Filter</span>
                      </div>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        title="Select a year to filter the data below"
                        className={`w-full mt-1 text-xl font-black rounded-md pl-1 pr-1 py-0.5 outline-none cursor-pointer transition-colors ${
                          isDarkMode
                            ? 'bg-slate-800 text-white border border-slate-600 focus:border-slate-400'
                            : 'bg-gray-50 text-gray-900 border border-gray-300 focus:border-gray-500'
                        }`}
                      >
                        {availableYears.map((year) => (
                          <option key={year} value={year} className="text-sm">
                            {year === 'All' ? 'All Time' : year}
                          </option>
                        ))}
                      </select>
                    </div>
                    {categoryFilterList.map((cat) => {
                      const isSelected = pieCategoryFilter === cat.name;
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => selectCategoryFilter(cat.name)}
                          title="Click to filter the charts below to this category"
                          className={`relative text-center p-4 rounded-2xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                            isSelected
                              ? (isDarkMode ? 'bg-red-950/40 border-red-500 ring-2 ring-red-500/40' : 'bg-red-50 border-red-400 ring-2 ring-red-300/60')
                              : (isDarkMode ? 'bg-[#1E293B] border-slate-800 hover:border-red-500' : 'bg-white border-gray-200 hover:border-red-400')
                          }`}
                        >
                          <span className={`block text-xs font-bold uppercase tracking-wide truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                            {cat.name}
                          </span>
                          <span className={`block mt-1 text-2xl font-black leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatShortUSD(cat.total)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`p-6 rounded-2xl border shadow-xs flex flex-col justify-between min-h-[440px] ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-full text-left mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total Spend by Category</h3>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                        {selectedYear === 'All' ? 'All Time' : selectedYear}
                      </span>
                      {pieCategoryFilter && (
                        <button
                          onClick={resetCategoryFilter}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <i className="fa-solid fa-filter"></i> {pieCategoryFilter} <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {pieCategoryFilter
                        ? `Showing data for ${pieCategoryFilter} only.`
                        : (drillLevel === 0 ? 'Click on a main slice (Direct / Indirect) to see its sub-categories.' : `Category breakdown for ${selectedGroup}.`)}
                    </p>
                  </div>
                  {renderDrilldownPieChart()}
                </div>
                <div className={`p-6 rounded-2xl border shadow-xs flex flex-col justify-between min-h-[440px] ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-full text-left mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total Spend by Origin</h3>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                        {selectedYear === 'All' ? 'All Time' : selectedYear}
                      </span>
                      {pieCategoryFilter && (
                        <button
                          onClick={resetCategoryFilter}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <i className="fa-solid fa-filter"></i> {pieCategoryFilter} <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                      {originFilter && (
                        <button
                          onClick={() => setOriginFilter(null)}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <i className="fa-solid fa-filter"></i> {originFilter} <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {pieCategoryFilter
                        ? `Comparison between Import and Local spend for ${pieCategoryFilter}.`
                        : (drillLevel === 1 && selectedGroup
                          ? `Comparison between Import and Local spend for ${selectedGroup}.`
                          : 'Comparison between Import and Local spend.')}
                      {' '}Click Import or Local to see its details.
                    </p>
                  </div>
                  {renderOriginPieChart()}
                </div>
              </div>
              {(barChartGroup || originFilter) && (
                <div className={`p-6 rounded-2xl border shadow-xs flex flex-col ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {barChartGroup
                            ? `Top 20 Item - ${barChartGroup}${originFilter ? ` (${originFilter})` : ''}`
                            : `Pareto by Category - ${originFilter}`}
                        </h3>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                          {selectedYear === 'All' ? 'All Time' : selectedYear}
                        </span>
                        {(barChartGroup || originFilter) && (
                          <button 
                            onClick={resetCategoryFilter}
                            className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md hover:bg-red-200 transition-colors cursor-pointer font-semibold flex items-center"
                          >
                            <i className="fa-solid fa-arrow-left mr-1"></i> Back
                          </button>
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        {barChartGroup
                          ? 'Item spend distribution analysis with cumulative percentage curve (80/20 Pareto Principle).'
                          : `Click a category box above to see the Top 20 Pareto items in that category (${originFilter} spend).`}
                      </p>
                    </div>
                  </div>
                  {renderCategoryParetoChart()}
                </div>
              )}
            </div>
          )}

          {activeTab === 'supplier' && (
            <div className="flex flex-col gap-6">
              {categoryFilterList.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Click a category box to filter all charts below.
                    </p>
                    {supplierCategoryGroup && (
                      <button
                        onClick={() => setSupplierCategoryGroup(null)}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <i className="fa-solid fa-xmark"></i> Reset filter
                      </button>
                    )}
                  </div>
                  <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    <div className={`p-4 rounded-2xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <i className={`fa-solid fa-calendar-days text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}></i>
                        <span className={`text-xs font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Year Filter</span>
                      </div>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        title="Select a year to filter the data below"
                        className={`w-full mt-1 text-xl font-black rounded-md pl-1 pr-1 py-0.5 outline-none cursor-pointer transition-colors ${
                          isDarkMode
                            ? 'bg-slate-800 text-white border border-slate-600 focus:border-slate-400'
                            : 'bg-gray-50 text-gray-900 border border-gray-300 focus:border-gray-500'
                        }`}
                      >
                        {availableYears.map((year) => (
                          <option key={year} value={year} className="text-sm">
                            {year === 'All' ? 'All Time' : year}
                          </option>
                        ))}
                      </select>
                    </div>
                    {categoryFilterList.map((cat) => {
                      const isSelected = supplierCategoryGroup === cat.name;
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => setSupplierCategoryGroup(isSelected ? null : cat.name)}
                          title="Click to filter the charts below to this category"
                          className={`relative text-center p-4 rounded-2xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                            isSelected
                              ? (isDarkMode ? 'bg-red-950/40 border-red-500 ring-2 ring-red-500/40' : 'bg-red-50 border-red-400 ring-2 ring-red-300/60')
                              : (isDarkMode ? 'bg-[#1E293B] border-slate-800 hover:border-red-500' : 'bg-white border-gray-200 hover:border-red-400')
                          }`}
                        >
                          <span className={`block text-xs font-bold uppercase tracking-wide truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                            {cat.name}
                          </span>
                          <span className={`block mt-1 text-2xl font-black leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatShortUSD(cat.total)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
              <div className={`xl:col-span-5 min-w-0 p-6 rounded-2xl border shadow-xs flex flex-col min-h-[440px] ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="w-full text-left mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total Spend by Origin</h3>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                      {selectedYear === 'All' ? 'All Time' : selectedYear}
                    </span>
                    {supplierCategoryGroup && (
                      <button
                        onClick={() => setSupplierCategoryGroup(null)}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <i className="fa-solid fa-filter"></i> {supplierCategoryGroup} <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                    {supplierOriginFilter && (
                      <button
                        onClick={() => setSupplierOriginFilter(null)}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <i className="fa-solid fa-filter"></i> {supplierOriginFilter} <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {supplierCategoryGroup
                      ? `Comparison between Import and Local spend for ${supplierCategoryGroup}.`
                      : 'Comparison between Import and Local spend.'}
                    {' '}Click Import or Local to see its details and filter the Top 20 Supplier.
                  </p>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  {renderGenericPieChart(
                    supplierOriginPieData.categories,
                    supplierOriginPieData.grandTotal,
                    (name) => { setSupplierOriginPopup(name); setSupplierOriginFilter(name); },
                    true,
                    supplierOriginPopup || supplierOriginFilter
                  )}
                </div>
                {renderOriginDetailPopup({
                  originName: supplierOriginPopup,
                  slices: supplierOriginPieData.categories,
                  orders: supplierCategoryGroup
                    ? yearFilteredOrders.filter((o) => (getOrderCategory(o) || 'Other') === supplierCategoryGroup)
                    : yearFilteredOrders,
                  contextLabel: supplierCategoryGroup,
                  onClose: () => setSupplierOriginPopup(null)
                })}
              </div>
              {(
                <div className={`xl:col-span-7 min-w-0 p-6 rounded-2xl border shadow-xs flex flex-col ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {`${supplierParetoTab === 'lowest20' ? 'Lowest' : 'Top'} 20 Supplier${supplierCategoryGroup || supplierOriginFilter ? ` - ${supplierCategoryGroup ? `${supplierCategoryGroup}${supplierOriginFilter ? ` (${supplierOriginFilter})` : ''}` : supplierOriginFilter}` : ''}`}
                        </h3>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                          {selectedYear === 'All' ? 'All Time' : selectedYear}
                        </span>
                        {(supplierCategoryGroup || supplierOriginFilter) && (
                          <button
                            onClick={() => { setSupplierCategoryGroup(null); setSupplierOriginFilter(null); }}
                            className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md hover:bg-red-200 transition-colors cursor-pointer font-semibold flex items-center"
                          >
                            <i className="fa-solid fa-arrow-left mr-1"></i> Back
                          </button>
                        )}
                      </div>
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
              )}
              </div>
            </div>
          )}

        </div>
      </AppLayout>

      {showPendingModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] border relative ${isDarkMode ? 'bg-[#1E293B] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
            {(isLoading || !pendingModalReady) && (
              <div className="absolute top-0 left-0 w-full h-[3px] z-10 overflow-hidden bg-transparent">
                <div
                  className="h-full w-1/4 bg-red-600 rounded-full"
                  style={{ animation: 'dpkLoadingBar 1.1s linear infinite' }}
                />
              </div>
            )}
            <div className={`p-5 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800 bg-[#0F172A]' : 'border-gray-200 bg-gray-50'}`}>
              <h3 className="font-bold text-lg">Pending Invoice Details ({pendingOrders.length})</h3>
              <button onClick={() => setShowPendingModal(false)} className="text-gray-400 hover:text-gray-200 text-lg cursor-pointer"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {isLoading || !pendingModalReady ? (
                <p className="text-center text-gray-400 py-6">Loading pending invoices...</p>
              ) : pendingOrders.length === 0 ? (
                <p className="text-center text-gray-400 py-6">No pending payments.</p>
              ) : (
                <>
                  {pendingOrders.slice(0, 300).map((po, i) => (
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
                  ))}
                  {pendingOrders.length > 300 && (
                    <p className="text-center text-xs text-gray-400 pt-2">Showing 300 of {pendingOrders.length} pending invoices.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {renderCategoryParetoModal()}
    </>
  );
}