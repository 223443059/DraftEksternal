import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../hooks/useTheme';
import AppLayout from './AppLayout'; // header + sidebar + bar menu atas (sama seperti Dashboard)
import { API_ENDPOINTS } from '../utils/api.config';

// === PENYIMPANAN PILIHAN USER (bertahan saat pindah halaman/tab, sampai user menghapus atau menggantinya) ===
const ANALYTICS_STORAGE_PREFIX = 'analytics_state_';

// Seperti useState, tapi nilainya disimpan di localStorage. Ganti ke window.sessionStorage jika ingin reset saat browser ditutup.
const usePersistentState = (key, initialValue) => {
  const storageKey = ANALYTICS_STORAGE_PREFIX + key;
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch (e) {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      /* storage penuh/dinonaktifkan: abaikan, state tetap jalan di memori */
    }
  }, [storageKey, value]);
  return [value, setValue];
};

const clearAnalyticsStorage = () => {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(ANALYTICS_STORAGE_PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch (e) { /* abaikan */ }
};

// Cache data PO di memori: saat kembali ke halaman Analytics, grafik langsung tampil (data disegarkan diam-diam di belakang)
let ordersCache = null;

// === KURS & HELPER UTILITY (KONVERSI & FORMATTING) ===
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

// Baris API (snake_case, kolom tabel purchase_orders) atau camelCase
const toOrder = (po, suppliersMap = {}) => {
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
    category: [po.category, po.product_group, po.productGroup].find((v) => v && String(v) !== '0') || 'Others',
    subcategory: [po.subcategory, po.sub_category, po.subCategory].find((v) => v && String(v) !== '0') || null,
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

// Format angka untuk label di atas titik grafik (lebih presisi dari formatShortNumber)
const formatChartLabel = (val) => {
  if (val === null || val === undefined) return '';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1).replace('.0', '')}K`;
  return `$${val.toFixed(0)}`;
};

const getOrderTotal = (order) => {
  if (!order) return 0;
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

  const year = getOrderDate(order) ? new Date(getOrderDate(order)).getFullYear() : undefined;
  return totalIDR / getKurs(year);
};

const getOrderDate = (order) => order.order_date || order.date || order.tanggal || order.orderDate || order.tanggalPesanan || '';
const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || 'Others';

const getOrderSubcategory = (order) => order.subcategory || order.sub_category || order.subCategory || 'General';

// Format tanggal 'YYYY-MM-DD' (atau ISO) menjadi 'DD-MM-YYYY' untuk tampilan tabel
const formatDateID = (dateStr) => {
  if (!dateStr || dateStr === '-') return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};
const getOrderStatus = (order) => order.order_status || order.status || order.statusPesanan || order.orderStatus || '';
const getOrderSupplier = (order) => order.supplier_name || order.supplier || order.namaSupplier || order.vendor || order.nama_supplier || 'Unknown Supplier';

const getYearFromOrder = (order) => {
  const dateStr = getOrderDate(order);
  if (!dateStr || dateStr === '-') return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
};

// Sama seperti generateSvgPath, tapi nilai null = data belum masuk -> garis berhenti/putus di titik itu
const generateSvgPathWithGaps = (data, maxScale) => {
  if (!data || data.length === 0) return '';
  const pts = data.map((val, idx) => (
    val === null || val === undefined
      ? null
      : { x: (idx / (data.length - 1)) * 920 + 40, y: 190 - (val / (maxScale || 1)) * 160 }
  ));
  let d = '';
  let prev = null;
  pts.forEach((pt) => {
    if (!pt) { prev = null; return; }
    if (!prev) {
      d += `${d ? ' ' : ''}M ${pt.x},${pt.y}`;
    } else {
      const cpsX = (pt.x + prev.x) / 2;
      d += ` C ${cpsX},${prev.y} ${cpsX},${pt.y} ${pt.x},${pt.y}`;
    }
    prev = pt;
  });
  return d;
};

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

const mapPercentToY = (val, min, max, top = 30, bottom = 200) => {
  const range = (max - min) || 1;
  return bottom - ((val - min) / range) * (bottom - top);
};

const formatShortDate = (d) => `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
const formatShortMonthYear = (d) => `${d.toLocaleString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(-2)}`;

const buildPeriods = (start, end, granularity) => {
  const periods = [];
  if (granularity === 'day') {
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (d <= last) {
      periods.push(new Date(d));
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  } else {
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (d <= last) {
      periods.push(new Date(d));
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }
  return periods;
};

const generateSmoothSvgPath = (points) => {
  if (!points || points.length === 0) return '';
  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const cpsX = (point.x + a[i - 1].x) / 2;
    return `${acc} C ${cpsX},${a[i - 1].y} ${cpsX},${point.y} ${point.x},${point.y}`;
  }, '');
};

// Kurva mulus (monotone cubic) melewati semua titik tanpa overshoot melewati nilai min/max data.
// Titik null = data belum ada -> kurva putus dan mulai segmen baru.
const generateMonotoneSvgPath = (pts) => {
  const segments = [];
  let cur = [];
  pts.forEach((pt) => {
    if (pt) cur.push(pt);
    else if (cur.length) { segments.push(cur); cur = []; }
  });
  if (cur.length) segments.push(cur);

  return segments.map((seg) => {
    const n = seg.length;
    if (n === 1) return `M${seg[0].x} ${seg[0].y}`;
    if (n === 2) return `M${seg[0].x} ${seg[0].y} L${seg[1].x} ${seg[1].y}`;

    const dx = [], m = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = seg[i + 1].x - seg[i].x;
      m[i] = (seg[i + 1].y - seg[i].y) / dx[i];
    }
    const t = new Array(n);
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) { t[i] = 0; continue; }
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }

    let d = `M${seg[0].x} ${seg[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += ` C${seg[i].x + h} ${seg[i].y + t[i] * h} ${seg[i + 1].x - h} ${seg[i + 1].y - t[i + 1] * h} ${seg[i + 1].x} ${seg[i + 1].y}`;
    }
    return d;
  }).join(' ');
};

const generateRoundedBar = (x, y, w, h, r) => {
  if (h <= 0) return `M ${x},${y} h ${w} v 0 h -${w} Z`;
  const radius = h < r ? 0 : Math.min(r, w / 2);
  if (radius === 0) {
    return `M ${x},${y + h} L ${x},${y} L ${x + w},${y} L ${x + w},${y + h} Z`;
  }
  return `M ${x},${y + h} L ${x},${y + radius} A ${radius},${radius} 0 0,1 ${x + radius},${y} L ${x + w - radius},${y} A ${radius},${radius} 0 0,1 ${x + w},${y + radius} L ${x + w},${y + h} Z`;
};

export default function Analytics({ changePage, onLogout }) {
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  // === 1. STATE MANAGEMENT (pilihan user disimpan lewat usePersistentState) ===
  const [orders, setOrders] = useState(ordersCache || []);
  const [isLoading, setIsLoading] = useState(!ordersCache);
  const [suppliersMap, setSuppliersMap] = useState({});
  
  const [isAnalyticsMenuOpen, setIsAnalyticsMenuOpen] = useState(true);
  const [selectedYear, setSelectedYear] = usePersistentState('selectedYear', 'All');
  // Tema (terang/gelap), jam, profil & logout sekarang diurus AppLayout + useTheme (sama seperti Dashboard)
  const [isDarkMode, setIsDarkMode] = useTheme();
  const [selectedSupplier, setSelectedSupplier] = usePersistentState('selectedSupplier', '');
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierSearchRef = useRef(null);
  const [activeTab, setActiveTab] = usePersistentState('activeTab', 'overview');

  const MAX_COMPARE_SUPPLIERS = 6;
  const COMPARE_SUPPLIER_COLORS = ['#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777'];
  const [compareSuppliers, setCompareSuppliers] = usePersistentState('compareSuppliers', []);
  const [compareSupplierSearch, setCompareSupplierSearch] = useState('');
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const [compareTimeRange, setCompareTimeRange] = usePersistentState('compareTimeRange', 'MAX');
  const [compareHoverIdx, setCompareHoverIdx] = useState(null); // indeks periode yang sedang di-hover (crosshair grafik compare)
  const compareSearchRef = useRef(null);
  
  const [selectedCategory, setSelectedCategory] = usePersistentState('selectedCategory', null);
  const [paretoMode, setParetoMode] = usePersistentState('paretoMode', 'supplier'); // 'supplier' | 'po' -> dasar pengelompokan Pareto di Category Breakdown
  // Rentang tanggal untuk halaman Category Detail (kosong = ikuti rentang data yang tersedia)
  const [categoryDetailStart, setCategoryDetailStart] = usePersistentState('categoryDetailStart', '');
  const [categoryDetailEnd, setCategoryDetailEnd] = usePersistentState('categoryDetailEnd', '');

  const analyticsTabs = [
    { id: 'overview', label: 'Overview & Trend', icon: 'fa-chart-line' },
    { id: 'supplier', label: 'Supplier Analysis', icon: 'fa-users' },
    { id: 'compareSupplier', label: 'Compare Supplier', icon: 'fa-scale-balanced' },
    { id: 'category', label: 'Category Breakdown', icon: 'fa-tags' },
  ];

  // Jika tab tersimpan sudah tidak valid, kembali ke Overview
  useEffect(() => {
    if (!analyticsTabs.some((t) => t.id === activeTab)) setActiveTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = useMemo(() => {
    if (user) {
      return {
        name: user.username || user.name || 'User',
        email: user.email || '-',
        role: user.role || (user.role_id === 1 ? 'Administrator' : 'User')
      };
    }
    return {
      name: 'Admin',
      email: 'admin@detpak.com',
      role: 'Administrator'
    };
  }, [user]);

  const handleNavigate = (page) => {
    if (changePage) changePage(page);
  };

  const handleLogout = () => {
    clearAnalyticsStorage(); // pilihan Analytics tidak terbawa ke user lain di browser yang sama
    if (typeof onLogout === 'function') {
      onLogout();
    } else if (typeof changePage === 'function') {
      changePage('login');
    }
  };

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

  useEffect(() => {
    const fetchOrdersFromBackend = async () => {
      if (!ordersCache) setIsLoading(true); // kalau sudah ada cache, refresh diam-diam tanpa loading overlay
      try {
        const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS);
        if (response.ok) {
          const data = await response.json();
          const formattedOrders = data.map((po) => toOrder(po, suppliersMap));

          ordersCache = formattedOrders;
          setOrders(formattedOrders);
          // Supplier tidak dipilih otomatis: search bar Supplier Analysis dikosongkan sampai user memilih sendiri
        } else {
          console.error('Gagal mengambil data PO dari server, status:', response.status);
          if (!ordersCache) setOrders([]);
        }
      } catch (e) {
        console.error('Gagal mengambil data PO dari server:', e);
        if (!ordersCache) setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrdersFromBackend();
  }, [suppliersMap]);

  useEffect(() => {
    const handleClickOutside = (event) => {
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
      current = parseInt(selectedYear, 10);
    } else {
      const numericYears = availableYears.filter((y) => y !== 'All').map(Number);
      if (numericYears.length > 0) {
        current = Math.max(...numericYears);
      }
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

    let lastPrev = -1, lastCurrent = -1; // bulan terakhir yang sudah ada datanya di masing-masing tahun

    orders.forEach((order) => {
      const yr = getYearFromOrder(order);
      const costUSD = getOrderTotal(order);
      const monthIdx = getOrderDate(order) ? new Date(getOrderDate(order)).getMonth() : 0;
      if (yr === comparisonYears.previous) { totalsPrev[monthIdx] += costUSD; if (monthIdx > lastPrev) lastPrev = monthIdx; }
      if (yr === comparisonYears.current) { totalsCurrent[monthIdx] += costUSD; if (monthIdx > lastCurrent) lastCurrent = monthIdx; }
    });

    const maxVal = Math.max(...totalsPrev, ...totalsCurrent, 100);
    // Bulan setelah data terakhir = belum masuk -> null, supaya garis putus (bukan jatuh ke $0)
    const prevSeries = totalsPrev.map((v, i) => (i > lastPrev ? null : v));
    const currentSeries = totalsCurrent.map((v, i) => (i > lastCurrent ? null : v));
    return { months, totalsPrev: prevSeries, totalsCurrent: currentSeries, maxVal };
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

  // Search bar dibiarkan kosong sampai user memilih supplier; reset hanya jika supplier terpilih sudah tidak ada di daftar
  useEffect(() => {
    if (selectedSupplier && supplierList.length > 0 && !supplierList.includes(selectedSupplier)) {
      setSelectedSupplier('');
    }
  }, [supplierList, selectedSupplier]);

  useEffect(() => {
    setSupplierSearchQuery(selectedSupplier || '');
  }, [selectedSupplier]);

  // Pilihan tersimpan yang datanya sudah tidak ada (mis. PO dihapus) dibersihkan setelah data termuat
  useEffect(() => {
    if (supplierList.length === 0) return;
    setCompareSuppliers((prev) => {
      const next = prev.filter((sup) => supplierList.includes(sup));
      return next.length === prev.length ? prev : next;
    });
  }, [supplierList]);

  useEffect(() => {
    if (orders.length === 0) return;
    if (selectedYear !== 'All' && !availableYears.some((y) => String(y) === String(selectedYear))) setSelectedYear('All');
    if (selectedCategory && !orders.some((o) => getOrderCategory(o) === selectedCategory)) setSelectedCategory(null);
  }, [orders, availableYears, selectedYear, selectedCategory]);

  const handleSelectSupplier = (sup) => {
    setSelectedSupplier(sup);
    setSupplierSearchQuery(sup);
    setShowSupplierDropdown(false);
  };

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

  const compareGrowthChart = useMemo(() => {
    const RANGE_DAYS = { '1D': 1, '5D': 5, '1M': 30, '6M': 182, '1Y': 365, '2Y': 365 * 2, '3Y': 365 * 3, '4Y': 365 * 4, '5Y': 365 * 5 };
    const DAY_GRANULARITY_RANGES = ['1D', '5D', '1M'];
    // Rentang tahunan (1Y-5Y) ditampilkan ala Google Finance: garis harian, semua mulai dari 0% di awal rentang
    const YEAR_RANGES = ['1Y', '2Y', '3Y', '4Y', '5Y'];
    const ROLLING_DAYS = 30; // nilai per hari = total pengeluaran 30 hari terakhir (jendela pendek = naik-turun lebih terlihat)
    const isYearMode = YEAR_RANGES.includes(compareTimeRange);

    const perSupplier = compareSuppliers.map((sup, idx) => {
      const dayMap = new Map();
      orders.forEach((order) => {
        if (getOrderSupplier(order) !== sup) return;
        const yr = getYearFromOrder(order);
        if (selectedYear !== 'All' && yr !== parseInt(selectedYear)) return;

        const dateStr = getOrderDate(order);
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;

        const key = d.toISOString().slice(0, 10);
        const cost = getOrderTotal(order);
        dayMap.set(key, (dayMap.get(key) || 0) + cost);
      });

      const sortedDays = Array.from(dayMap.entries())
        .map(([key, cost]) => ({ date: new Date(key), cost }))
        .sort((a, b) => a.date - b.date);

      // points = biaya per hari (BUKAN kumulatif), supaya grafik bisa naik-turun seperti saham
      return { name: sup, color: COMPARE_SUPPLIER_COLORS[idx % COMPARE_SUPPLIER_COLORS.length], points: sortedDays };
    });

    const allDates = perSupplier.flatMap((s) => s.points.map((p) => p.date));
    if (allDates.length === 0) {
      return { rows: [], labels: [], minNormalized: -10, maxNormalized: 10, mode: 'default', ticks: [], yTicks: [] };
    }

    const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...allDates.map((d) => d.getTime())));
    const granularity = (DAY_GRANULARITY_RANGES.includes(compareTimeRange) || isYearMode) ? 'day' : 'month';

    let startDate;
    if (compareTimeRange === 'MAX') {
      startDate = earliest;
    } else if (compareTimeRange === 'YTD') {
      startDate = new Date(latest.getFullYear(), 0, 1);
    } else {
      const days = RANGE_DAYS[compareTimeRange] || 365;
      startDate = new Date(latest.getTime() - days * 24 * 60 * 60 * 1000);
    }
    if (startDate < earliest) startDate = earliest;

    const periods = buildPeriods(startDate, latest, granularity);

    const rows = perSupplier.map((s) => {
      if (isYearMode) {
        // ===== Mode tahunan: total 90 hari terakhir per hari, diubah jadi % perubahan dari awal rentang =====
        const costByDay = new Map();
        s.points.forEach((pt) => {
          const k = `${pt.date.getFullYear()}-${pt.date.getMonth()}-${pt.date.getDate()}`;
          costByDay.set(k, (costByDay.get(k) || 0) + pt.cost);
        });
        const first = periods[0];
        const total = periods.length + (ROLLING_DAYS - 1);
        const daily = [];
        for (let i = 0; i < total; i++) {
          const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() - (ROLLING_DAYS - 1) + i);
          daily.push(costByDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) || 0);
        }
        let run = 0;
        const rolling = [];
        for (let i = 0; i < total; i++) {
          run += daily[i];
          if (i >= ROLLING_DAYS) run -= daily[i - ROLLING_DAYS];
          if (i >= ROLLING_DAYS - 1) rolling.push(run);
        }
        // titik awal (0%) = hari pertama saat jendela 90 hari sudah penuh berisi data; sebelum itu garis datar di 0%
        const fullFrom = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate() + (ROLLING_DAYS - 1));
        let baseIdx = -1;
        for (let i = 0; i < rolling.length; i++) {
          if (periods[i] >= fullFrom && rolling[i] > 0) { baseIdx = i; break; }
        }
        if (baseIdx === -1) {
          for (let i = 0; i < rolling.length; i++) { if (rolling[i] > 0) { baseIdx = i; break; } }
        }
        const base = baseIdx >= 0 ? rolling[baseIdx] : 0;
        const normalized = rolling.map((v, i) => (base > 0 && i >= baseIdx ? ((v - base) / base) * 100 : 0));
        return { name: s.name, color: s.color, normalized, spend: rolling };
      }

      // Pengeluaran per periode (harian / bulanan), bukan akumulasi -> ada naik dan turun
      let ptr = 0;
      const spend = periods.map((periodDate) => {
        const periodStart = granularity === 'day'
          ? new Date(periodDate.getFullYear(), periodDate.getMonth(), periodDate.getDate())
          : new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
        const periodEnd = granularity === 'day'
          ? new Date(periodDate.getFullYear(), periodDate.getMonth(), periodDate.getDate(), 23, 59, 59)
          : new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0, 23, 59, 59);
        let sum = 0;
        while (ptr < s.points.length && s.points[ptr].date <= periodEnd) {
          if (s.points[ptr].date >= periodStart) sum += s.points[ptr].cost;
          ptr++;
        }
        return sum;
      });

      // Mode harian: rata-rata bergerak 3 hari agar garis tidak "patah" ke -100% di hari tanpa order
      const smooth = granularity === 'day'
        ? spend.map((_, i) => {
            const w = spend.slice(Math.max(0, i - 2), i + 1);
            return w.reduce((acc, v) => acc + v, 0) / w.length;
          })
        : spend;

      // 0% = rata-rata pengeluaran supplier itu pada rentang yang dipilih; di atas 0% = lebih tinggi dari rata-rata
      const avg = smooth.length ? smooth.reduce((acc, v) => acc + v, 0) / smooth.length : 0;
      const normalized = smooth.map((v) => (avg > 0 ? ((v - avg) / avg) * 100 : 0));

      return { name: s.name, color: s.color, normalized, spend };
    });

    const allNormalized = rows.flatMap((r) => r.normalized);
    const rawMax = allNormalized.length ? Math.max(...allNormalized) : 10;
    const rawMin = allNormalized.length ? Math.min(...allNormalized) : -10;
    const pad = Math.max((rawMax - rawMin) * 0.06, 3); // padding tipis agar rentang sumbu-Y rapat -> gerakan garis lebih tegas
    const maxNormalized = rawMax + pad;
    const minNormalized = Math.min(rawMin - pad, 0);

    const labels = periods.map((d) => (
      isYearMode
        ? d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        : (granularity === 'day' ? formatShortDate(d) : formatShortMonthYear(d))
    ));

    // Penanda sumbu-X mode tahunan: 1Y = tiap 2 bulan, 2Y-5Y = tiap 1 Januari (label tahun)
    const ticks = [];
    if (isYearMode) {
      periods.forEach((d, i) => {
        if (compareTimeRange === '1Y') {
          if (d.getDate() === 1 && d.getMonth() % 2 === 0) ticks.push({ idx: i, label: d.toLocaleString('en-US', { month: 'short' }) });
        } else if (d.getMonth() === 0 && d.getDate() === 1) {
          ticks.push({ idx: i, label: String(d.getFullYear()) });
        }
      });
    }

    // Angka sumbu-Y "bulat" (mis. -50%, 0%, 50%, 100%) untuk mode tahunan
    const yTicks = [];
    if (isYearMode) {
      const raw = (maxNormalized - minNormalized) / 4 || 1;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / mag;
      const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
      for (let v = Math.ceil(minNormalized / step) * step; v <= maxNormalized + 1e-9; v += step) {
        yTicks.push(Math.round(v * 100) / 100);
      }
    }

    return { rows, labels, minNormalized, maxNormalized, mode: isYearMode ? 'year' : 'default', ticks, yTicks };
  }, [orders, compareSuppliers, selectedYear, compareTimeRange]);

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

    // Bulan terakhir yang sudah punya data di tahun berjalan (semua supplier).
    // Bulan sesudahnya belum terjadi, jadi tidak boleh dihitung sebagai penurunan -100%.
    let lastDataMonth = -1;
    orders.forEach((order) => {
      if (getYearFromOrder(order) !== comparisonYears.current) return;
      const d = getOrderDate(order);
      const m = d ? new Date(d).getMonth() : 0;
      if (m > lastDataMonth) lastDataMonth = m;
    });
    const cutoff = lastDataMonth >= 0 ? lastDataMonth : 11;
    const isPartialYear = cutoff < 11;

    // Total YoY dibandingkan pada periode yang sama (Jan s/d bulan terakhir yang ada datanya)
    const sumTo = (arr) => arr.slice(0, cutoff + 1).reduce((acc, v) => acc + v, 0);
    const prevSamePeriod = sumTo(totalsPrev);
    const currSamePeriod = sumTo(totalsCurrent);
    // null = tidak bisa dihitung (tahun pembanding 0) -> ditampilkan "N/A", bukan 100%
    const overallYoy = prevSamePeriod > 0 ? ((currSamePeriod - prevSamePeriod) / prevSamePeriod) * 100 : null;

    // % YoY per bulan; null jika bulan belum ada datanya atau bulan pembanding 0
    const monthlyYoy = totalsCurrent.map((valCurr, idx) => {
      if (idx > cutoff) return null;
      const valPrev = totalsPrev[idx];
      if (!(valPrev > 0)) return null;
      return ((valCurr - valPrev) / valPrev) * 100;
    });

    const maxSpend = Math.max(...totalsPrev, ...totalsCurrent, 100); 
    
    return { 
        totalYearPrev, totalYearCurrent, overallYoy, isPartialYear, cutoff, totalsPrev, totalsCurrent, monthlyYoy, maxSpend,
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

  const categoryBreakdownData = useMemo(() => {
    if (!selectedCategory) return [];
    
    return orders.filter(o => {
      const yr = getYearFromOrder(o);
      const isYearMatch = selectedYear === 'All' || yr === parseInt(selectedYear);
      const isCategoryMatch = getOrderCategory(o) === selectedCategory;
      return isYearMatch && isCategoryMatch;
    });
  }, [orders, selectedCategory, selectedYear]);

  // Pareto 80/20 untuk kategori terpilih: dikelompokkan per Supplier atau per PO, diurutkan dari spend terbesar
  const categoryParetoData = useMemo(() => {
    if (!selectedCategory) return { rows: [], total: 0, vitalCount: 0, totalPOs: 0 };
    const map = {};
    const allPOs = new Set();
    categoryBreakdownData.forEach((o) => {
      const poKey = o.poNumber || `row-${o.id}`;
      const key = paretoMode === 'po' ? poKey : getOrderSupplier(o);
      allPOs.add(poKey);
      if (!map[key]) map[key] = { name: key, spend: 0, poSet: new Set(), supplier: getOrderSupplier(o) };
      map[key].spend += getOrderTotal(o);
      map[key].poSet.add(poKey);
    });
    const sorted = Object.values(map)
      .filter((r) => r.spend > 0)
      .sort((a, b) => b.spend - a.spend);
    const total = sorted.reduce((sum, r) => sum + r.spend, 0);
    let running = 0;
    const rows = sorted.map((r) => {
      running += r.spend;
      return {
        name: r.name,
        supplier: r.supplier,
        poCount: r.poSet.size,
        spend: r.spend,
        share: total > 0 ? (r.spend / total) * 100 : 0,
        cumPct: total > 0 ? (running / total) * 100 : 0
      };
    });
    const idx80 = rows.findIndex((r) => r.cumPct >= 80);
    const vitalCount = rows.length === 0 ? 0 : (idx80 === -1 ? rows.length : idx80 + 1);
    return { rows, total, vitalCount, totalPOs: allPOs.size };
  }, [categoryBreakdownData, selectedCategory, paretoMode]);

  // Rentang tanggal yang tersedia untuk kategori terpilih (dipakai sebagai default date-range picker)
  const categoryDetailDateBounds = useMemo(() => {
    if (!selectedCategory) return { min: '', max: '' };
    const dates = orders
      .filter((o) => getOrderCategory(o) === selectedCategory)
      .map((o) => o.date)
      .filter((d) => d && d !== '-')
      .sort();
    return { min: dates[0] || '', max: dates[dates.length - 1] || '' };
  }, [orders, selectedCategory]);

  const effectiveDetailStart = categoryDetailStart || categoryDetailDateBounds.min;
  const effectiveDetailEnd = categoryDetailEnd || categoryDetailDateBounds.max;

  // Data lengkap untuk halaman "Category Detail" (pict 1): stat cards, trend bulanan, breakdown subkategori,
  // top suppliers, dan transaksi terbaru — semuanya difilter oleh kategori terpilih + rentang tanggal di atas.
  const categoryDetail = useMemo(() => {
    if (!selectedCategory || !effectiveDetailStart || !effectiveDetailEnd) return null;

    const inRange = (o, s, e) => o.date && o.date !== '-' && o.date >= s && o.date <= e;
    const currentOrders = orders.filter((o) => getOrderCategory(o) === selectedCategory && inRange(o, effectiveDetailStart, effectiveDetailEnd));

    // Periode sebelumnya: durasi sama persis, langsung sebelum tanggal mulai (untuk % perubahan di stat card)
    const startMs = new Date(effectiveDetailStart).getTime();
    const endMs = new Date(effectiveDetailEnd).getTime();
    const durationMs = Math.max(endMs - startMs, 0);
    const prevEndDate = new Date(startMs - 24 * 60 * 60 * 1000);
    const prevStartDate = new Date(prevEndDate.getTime() - durationMs);
    const toISO = (d) => d.toISOString().split('T')[0];
    const prevOrders = orders.filter((o) => getOrderCategory(o) === selectedCategory && inRange(o, toISO(prevStartDate), toISO(prevEndDate)));

    const sumSpend = (list) => list.reduce((s, o) => s + getOrderTotal(o), 0);
    const totalSpend = sumSpend(currentOrders);
    const totalPO = currentOrders.length;
    const avgPO = totalPO > 0 ? totalSpend / totalPO : 0;

    const prevSpend = sumSpend(prevOrders);
    const prevPO = prevOrders.length;
    const prevAvg = prevPO > 0 ? prevSpend / prevPO : 0;

    const pctChange = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0));

    // Trend bulanan: dua tahun terakhir yang muncul di rentang data kategori ini
    const yearsInRange = Array.from(new Set(currentOrders.map((o) => getYearFromOrder(o)))).filter(Boolean).sort((a, b) => a - b);
    const yearPrevT = yearsInRange.length > 1 ? yearsInRange[yearsInRange.length - 2] : null;
    const yearCurrT = yearsInRange[yearsInRange.length - 1] || null;
    const monthly = Array.from({ length: 12 }, () => ({ prev: 0, curr: 0 }));
    currentOrders.forEach((o) => {
      const yr = getYearFromOrder(o);
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) return;
      const m = d.getMonth();
      if (yr === yearPrevT) monthly[m].prev += getOrderTotal(o);
      if (yr === yearCurrT) monthly[m].curr += getOrderTotal(o);
    });

    // Breakdown subkategori (Category Contribution)
    const subMap = {};
    currentOrders.forEach((o) => {
      const sub = getOrderSubcategory(o);
      if (!subMap[sub]) subMap[sub] = 0;
      subMap[sub] += getOrderTotal(o);
    });
    const subRows = Object.entries(subMap)
      .map(([name, value]) => ({ name, value, pct: totalSpend > 0 ? (value / totalSpend) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    // Top Suppliers
    const supMap = {};
    currentOrders.forEach((o) => {
      const sup = getOrderSupplier(o);
      if (!supMap[sup]) supMap[sup] = { name: sup, spend: 0, count: 0 };
      supMap[sup].spend += getOrderTotal(o);
      supMap[sup].count += 1;
    });
    const topSuppliers = Object.values(supMap)
      .map((s) => ({ ...s, avg: s.count > 0 ? s.spend / s.count : 0 }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    // Recent Transactions
    const recentTransactions = [...currentOrders]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 8);

    return {
      totalSpend, totalPO, avgPO,
      spendChange: pctChange(totalSpend, prevSpend),
      poChange: pctChange(totalPO, prevPO),
      avgChange: pctChange(avgPO, prevAvg),
      monthly, yearPrevT, yearCurrT,
      subRows, topSuppliers, recentTransactions
    };
  }, [orders, selectedCategory, effectiveDetailStart, effectiveDetailEnd]);

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
        activePage="analytics"
        changePage={changePage}
        onLogout={onLogout}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        submenu={{
          page: 'analytics',
          open: isAnalyticsMenuOpen,
          onToggle: () => setIsAnalyticsMenuOpen((prev) => !prev),
          items: analyticsTabs,
          activeId: activeTab,
          onSelect: setActiveTab,
        }}
      >
        <div className="space-y-6">
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
                    <path d={generateSvgPathWithGaps(yoyChartData.totalsPrev, yoyChartData.maxVal)} fill="none" stroke="#64748B" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
                    <path d={generateSvgPathWithGaps(yoyChartData.totalsCurrent, yoyChartData.maxVal)} fill="none" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0px 3px 4px rgba(220, 38, 38, 0.2))' }} />
                    {yoyChartData.months.map((m, idx) => {
                      const x = (idx / 11) * 920 + 40;
                      const hasCurrent = yoyChartData.totalsCurrent[idx] !== null;
                      const yCurrent = hasCurrent ? 190 - (yoyChartData.totalsCurrent[idx] / yoyChartData.maxVal) * 160 : 0;
                      const hasPrev = yoyChartData.totalsPrev[idx] !== null;
                      const yPrev = hasPrev ? 190 - (yoyChartData.totalsPrev[idx] / yoyChartData.maxVal) * 160 : 0;
                      // Nilai yang lebih tinggi labelnya di atas titik, yang lebih rendah di bawah titik (supaya tidak bertumpuk)
                      const currAbove = !hasPrev || yoyChartData.totalsCurrent[idx] >= yoyChartData.totalsPrev[idx];
                      return (
                        <g key={idx}>
                          {hasPrev && <circle cx={x} cy={yPrev} r="3.5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#64748B" strokeWidth="2" />}
                          {hasPrev && (
                            <text x={x} y={currAbove ? yPrev + 16 : yPrev - 10} textAnchor="middle" className={`text-[10px] font-semibold ${isDarkMode ? 'fill-slate-400' : 'fill-slate-500'}`}>
                              {formatChartLabel(yoyChartData.totalsPrev[idx])}
                            </text>
                          )}
                          {hasCurrent && <circle cx={x} cy={yCurrent} r="5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#DC2626" strokeWidth="3" />}
                          {hasCurrent && (
                            <text x={x} y={currAbove ? yCurrent - 12 : yCurrent + 18} textAnchor="middle" className="text-[10px] font-bold fill-red-500">
                              {formatChartLabel(yoyChartData.totalsCurrent[idx])}
                            </text>
                          )}
                          <text x={x} y="222" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-400'}`}>{m}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* SUPPLIER ANALYSIS */}
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
                   onChange={(e) => { setSupplierSearchQuery(e.target.value); setShowSupplierDropdown(true); if (e.target.value === '') setSelectedSupplier(''); }}
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
                  {supplierAnalysisData.overallYoy === null ? (
                     <div className={`text-lg font-black ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{selectedSupplier ? 'N/A' : '-'}</div>
                  ) : (
                     <div className={`flex items-center gap-1.5 text-lg font-black ${supplierAnalysisData.overallYoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {supplierAnalysisData.overallYoy >= 0 ? <i className="fa-solid fa-arrow-trend-up text-sm"></i> : <i className="fa-solid fa-arrow-trend-down text-sm"></i>}
                        {Math.abs(supplierAnalysisData.overallYoy).toFixed(2)}%
                     </div>
                  )}
                  {selectedSupplier && (
                     <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        {supplierAnalysisData.overallYoy === null
                           ? `No ${comparisonYears.previous} data to compare`
                           : supplierAnalysisData.isPartialYear
                              ? `Jan–${supplierAnalysisData.months[supplierAnalysisData.cutoff]} ${comparisonYears.current} vs same period ${comparisonYears.previous}`
                              : `${comparisonYears.current} vs ${comparisonYears.previous}`}
                     </p>
                  )}
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
                  {!selectedSupplier && (
                     <div className={`absolute inset-0 z-10 flex items-center justify-center text-sm pointer-events-none ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        Search and select a supplier to see the YoY comparison
                     </div>
                  )}
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

                     {supplierAnalysisData.months.map((m, idx) => {
                        const xCenter = 60 + (idx * (880 / 11));
                        const hPrev = isNaN((supplierAnalysisData.totalsPrev[idx] / supplierAnalysisData.maxSpend) * 200) ? 0 : (supplierAnalysisData.totalsPrev[idx] / supplierAnalysisData.maxSpend) * 200;
                        const hCurr = isNaN((supplierAnalysisData.totalsCurrent[idx] / supplierAnalysisData.maxSpend) * 200) ? 0 : (supplierAnalysisData.totalsCurrent[idx] / supplierAnalysisData.maxSpend) * 200;
                        const yPrev = 230 - hPrev, yCurr = 230 - hCurr, barWidth = 20, gap = 4;
                        let xPrev = xCenter - barWidth - (gap / 2), xCurr = xCenter + (gap / 2);

                        return (
                           <g key={`bars-${idx}`}>
                              {hPrev > 0 && <path d={generateRoundedBar(xPrev, yPrev, barWidth, hPrev, 4)} fill="url(#barPrev)" />}
                              {hCurr > 0 && <path d={generateRoundedBar(xCurr, yCurr, barWidth, hCurr, 4)} fill="url(#barCurr)" />}
                              <text x={xCenter} y="250" textAnchor="middle" className={`text-[11px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-600'}`}>{m}</text>
                           </g>
                        );
                     })}

                     {/* Garis % YoY Change per bulan (sumbu kanan) */}
                     {(() => {
                        const vals = supplierAnalysisData.monthlyYoy;
                        const valid = vals.filter((v) => v !== null);
                        if (valid.length === 0) return null;
                        const rawMax = Math.max(...valid, 0);
                        const rawMin = Math.min(...valid, 0);
                        const span = (rawMax - rawMin) || 1;
                        const yTop = 45, yBottom = 215;
                        const yOf = (v) => yBottom - ((v - rawMin) / span) * (yBottom - yTop);
                        const fmtPct = (v) => {
                           const sign = v > 0 ? '+' : '';
                           return Math.abs(v) >= 1000 ? `${sign}${(v / 1000).toFixed(1)}k%` : `${sign}${v.toFixed(0)}%`;
                        };
                        const pts = vals.map((v, idx) => (v === null ? null : { x: 60 + idx * (880 / 11), y: yOf(v), v }));
                        const d = generateMonotoneSvgPath(pts);
                        const zeroY = yOf(0);
                        return (
                           <g>
                              <line x1="60" y1={zeroY} x2="940" y2={zeroY} stroke="#F59E0B" strokeOpacity="0.5" strokeDasharray="3 3" strokeWidth="1" />
                              <text x="948" y={zeroY + 3} textAnchor="start" className="text-[10px] fill-amber-500">0%</text>
                              {rawMax > 0 && <text x="948" y={yOf(rawMax) + 3} textAnchor="start" className="text-[10px] fill-amber-500">{fmtPct(rawMax)}</text>}
                              {rawMin < 0 && <text x="948" y={yOf(rawMin) + 3} textAnchor="start" className="text-[10px] fill-amber-500">{fmtPct(rawMin)}</text>}
                              {d && <path d={d} fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0px 3px 4px rgba(245, 158, 11, 0.25))' }} />}
                              {pts.map((pt, idx) => pt && (
                                 <g key={`yoy-${idx}`}>
                                    <circle cx={pt.x} cy={pt.y} r="4.5" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} stroke="#F59E0B" strokeWidth="2" />
                                    <text x={pt.x} y={pt.y - 10} textAnchor="middle" className={`text-[10px] font-semibold ${pt.v >= 0 ? 'fill-emerald-500' : 'fill-red-500'}`}>{fmtPct(pt.v)}</text>
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
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Click on any category to view its Pareto analysis</p>
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
                  {/* Breadcrumb */}
                  <div className={`flex items-center gap-2 text-xs font-medium mb-4 flex-wrap ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    <button onClick={() => setSelectedCategory(null)} className={`hover:underline ${isDarkMode ? 'hover:text-white' : 'hover:text-gray-900'}`}>Analytics</button>
                    <i className="fa-solid fa-chevron-right text-[9px]"></i>
                    <button onClick={() => setSelectedCategory(null)} className={`hover:underline ${isDarkMode ? 'hover:text-white' : 'hover:text-gray-900'}`}>Category Breakdown</button>
                    <i className="fa-solid fa-chevron-right text-[9px]"></i>
                    <span className={`font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-700'}`}>{selectedCategory}</span>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className={`mt-0.5 w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center transition-colors ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        <i className="fa-solid fa-arrow-left"></i>
                      </button>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedCategory}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>Category Detail</span>
                        </div>
                        <p className={`text-xs mt-1 max-w-md ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          Detailed analysis of PO value, supplier contribution and transaction trend for {selectedCategory}.
                        </p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${isDarkMode ? 'border-slate-700 bg-[#0F172A] text-slate-300' : 'border-gray-200 bg-white text-gray-600'}`}>
                      <i className="fa-regular fa-calendar"></i>
                      <input
                        type="date"
                        value={effectiveDetailStart}
                        max={effectiveDetailEnd || undefined}
                        onChange={(e) => setCategoryDetailStart(e.target.value)}
                        className={`bg-transparent outline-none ${isDarkMode ? 'text-slate-200 [color-scheme:dark]' : 'text-gray-700'}`}
                      />
                      <i className="fa-solid fa-arrow-right text-[10px] opacity-50"></i>
                      <input
                        type="date"
                        value={effectiveDetailEnd}
                        min={effectiveDetailStart || undefined}
                        onChange={(e) => setCategoryDetailEnd(e.target.value)}
                        className={`bg-transparent outline-none ${isDarkMode ? 'text-slate-200 [color-scheme:dark]' : 'text-gray-700'}`}
                      />
                      {(categoryDetailStart || categoryDetailEnd) && (
                        <button
                          onClick={() => { setCategoryDetailStart(''); setCategoryDetailEnd(''); }}
                          title="Reset to full range"
                          className={`ml-1 ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          <i className="fa-solid fa-rotate-left text-[10px]"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {!categoryDetail ? (
                    <div className={`h-48 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-700 text-slate-500' : 'bg-gray-50/50 border-gray-200 text-gray-400'}`}>
                      No data found for this category in the selected date range.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Stat cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                          { label: 'Average PO Value', value: formatUSD(categoryDetail.avgPO), change: categoryDetail.avgChange, icon: 'fa-coins' },
                          { label: 'Total PO', value: categoryDetail.totalPO.toLocaleString(), change: categoryDetail.poChange, icon: 'fa-file-lines' },
                          { label: 'Total Spend', value: formatUSD(categoryDetail.totalSpend), change: categoryDetail.spendChange, icon: 'fa-sack-dollar' },
                        ].map((card, idx) => (
                          <div key={idx} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-gray-50 border-gray-200/80'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-gray-500 border border-gray-200'}`}>
                                <i className={`fa-solid ${card.icon} text-xs`}></i>
                              </div>
                              <span className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{card.label}</span>
                            </div>
                            <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{card.value}</p>
                            <p className={`text-xs mt-1 font-semibold flex items-center gap-1 ${card.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              <i className={`fa-solid ${card.change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} text-[10px]`}></i>
                              {Math.abs(card.change).toFixed(1)}% vs previous period
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* PO Value Trend + Supplier Contribution */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-gray-50 border-gray-200/80'}`}>
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>PO Value Trend</h4>
                            <div className={`flex items-center gap-3 text-[10px] font-semibold ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                              {categoryDetail.yearPrevT && <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>{categoryDetail.yearPrevT}</div>}
                              {categoryDetail.yearCurrT && <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>{categoryDetail.yearCurrT}</div>}
                            </div>
                          </div>
                          {(() => {
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const prevVals = categoryDetail.monthly.map((m) => m.prev);
                            const currVals = categoryDetail.monthly.map((m) => m.curr);
                            const maxV = Math.max(...prevVals, ...currVals, 1);
                            const chartL = 55, chartR = 610, yTop = 15, yBottom = 190;
                            const xOf = (i) => chartL + (i * (chartR - chartL)) / 11;
                            const yOf = (v) => yBottom - (v / maxV) * (yBottom - yTop);
                            const prevPts = prevVals.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
                            const currPts = currVals.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
                            const areaPath = `${generateMonotoneSvgPath(currPts)} L ${xOf(11)} ${yBottom} L ${xOf(0)} ${yBottom} Z`;
                            return (
                              <div className="w-full h-52">
                                <svg viewBox="0 0 640 220" className="w-full h-full overflow-visible font-sans">
                                  <defs>
                                    <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#F87171" stopOpacity="0.35" />
                                      <stop offset="100%" stopColor="#F87171" stopOpacity="0" />
                                    </linearGradient>
                                  </defs>
                                  {[0, 25, 50, 75, 100].map((pct) => {
                                    const y = yOf((maxV * pct) / 100);
                                    return (
                                      <g key={`tg-${pct}`}>
                                        <line x1={chartL} y1={y} x2={chartR} y2={y} stroke={isDarkMode ? '#334155' : '#E5E7EB'} strokeDasharray="4 4" strokeWidth="1" />
                                        <text x={chartL - 8} y={y + 3} textAnchor="end" className={`text-[9px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>{formatShortNumber((maxV * pct) / 100)}</text>
                                      </g>
                                    );
                                  })}
                                  <path d={areaPath} fill="url(#trendAreaFill)" stroke="none" />
                                  <path d={generateMonotoneSvgPath(prevPts)} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
                                  <path d={generateMonotoneSvgPath(currPts)} fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
                                  {prevPts.map((pt, i) => <circle key={`pv-${i}`} cx={pt.x} cy={pt.y} r="3" fill={isDarkMode ? '#1E293B' : '#fff'} stroke="#3B82F6" strokeWidth="2" />)}
                                  {currPts.map((pt, i) => <circle key={`cv-${i}`} cx={pt.x} cy={pt.y} r="3" fill={isDarkMode ? '#1E293B' : '#fff'} stroke="#EF4444" strokeWidth="2" />)}
                                  {months.map((m, i) => (
                                    <text key={`tm-${i}`} x={xOf(i)} y="207" textAnchor="middle" className={`text-[9px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-600'}`}>{m}</text>
                                  ))}
                                </svg>
                              </div>
                            );
                          })()}
                        </div>

                        <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-gray-50 border-gray-200/80'}`}>
                          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                            <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Supplier Contribution (Pareto Analysis)</h4>
                            <div className={`inline-flex p-0.5 rounded-lg text-[10px] font-semibold ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                              {[['supplier', 'By PO Value'], ['po', 'By PO']].map(([key, label]) => (
                                <button
                                  key={key}
                                  onClick={() => setParetoMode(key)}
                                  className={`px-2 py-1 rounded-md transition-colors ${paretoMode === key ? 'bg-red-600 text-white shadow-sm' : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800')}`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {(() => {
                            const { rows, total } = categoryParetoData;
                            if (rows.length === 0) {
                              return <div className={`h-52 flex items-center justify-center text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No data.</div>;
                            }
                            const shown = rows.slice(0, 6);
                            const n = shown.length;
                            const chartL = 40, chartR = 610, yTop = 15, yBottom = 165;
                            const band = (chartR - chartL) / n;
                            const barW = Math.min(50, band * 0.55);
                            const cx = (i) => chartL + band * i + band / 2;
                            const yOfPct = (pct) => yBottom - (pct / 100) * (yBottom - yTop);
                            const linePts = shown.map((r, i) => ({ x: cx(i), y: yOfPct(r.cumPct) }));
                            const trunc = (t, m) => (t.length > m ? `${t.slice(0, m - 1)}…` : t);
                            return (
                              <div className="w-full h-52">
                                <svg viewBox="0 0 640 200" className="w-full h-full overflow-visible font-sans">
                                  {[0, 25, 50, 75, 100].map((pct) => {
                                    const y = yOfPct(pct);
                                    return <line key={`sg-${pct}`} x1={chartL} y1={y} x2={chartR} y2={y} stroke={isDarkMode ? '#334155' : '#E5E7EB'} strokeDasharray="4 4" strokeWidth="1" />;
                                  })}
                                  {shown.map((r, i) => {
                                    const h = total > 0 ? (r.spend / total) * (yBottom - yTop) : 0;
                                    const x = cx(i) - barW / 2;
                                    const y = yBottom - h;
                                    return (
                                      <g key={`sb-${i}`}>
                                        <title>{`${r.name}: ${formatUSD(r.spend)} (${r.share.toFixed(1)}%)`}</title>
                                        <path d={generateRoundedBar(x, y, barW, h, 3)} fill="#3B82F6" />
                                        <text x={cx(i)} y={y - 6} textAnchor="middle" className={`text-[9px] font-bold ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}>{r.share.toFixed(0)}%</text>
                                        <text x={cx(i)} y="180" textAnchor="middle" className={`text-[9px] font-medium ${isDarkMode ? 'fill-slate-400' : 'fill-gray-600'}`}>{trunc(r.name, 10)}</text>
                                      </g>
                                    );
                                  })}
                                  <path d={generateMonotoneSvgPath(linePts)} fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                                  {linePts.map((pt, i) => <circle key={`sc-${i}`} cx={pt.x} cy={pt.y} r="3" fill={isDarkMode ? '#1E293B' : '#fff'} stroke="#EF4444" strokeWidth="2" />)}
                                </svg>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Category Contribution + Top Suppliers */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-gray-50 border-gray-200/80'}`}>
                          <h4 className={`font-bold text-sm mb-3 ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Category Contribution</h4>
                          <div className="overflow-x-auto">
                            <table className={`w-full text-left text-xs ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                              <thead className={`uppercase border-b ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-gray-200 text-gray-400'}`}>
                                <tr>
                                  <th className="py-2 pr-2 font-semibold">Subcategory</th>
                                  <th className="py-2 pr-2 font-semibold text-right">PO Value</th>
                                  <th className="py-2 pl-2 font-semibold">% of Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {categoryDetail.subRows.map((r, i) => (
                                  <tr key={i} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                                    <td className="py-2 pr-2 font-medium">{r.name}</td>
                                    <td className="py-2 pr-2 text-right whitespace-nowrap">{formatUSD(r.value)}</td>
                                    <td className="py-2 pl-2 w-32">
                                      <div className="flex items-center gap-2">
                                        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-gray-200'}`}>
                                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(r.pct, 100)}%` }}></div>
                                        </div>
                                        <span className="w-9 text-right font-semibold">{r.pct.toFixed(1)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {categoryDetail.subRows.length === 0 && (
                                  <tr><td colSpan={3} className={`py-4 text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No subcategory data.</td></tr>
                                )}
                                <tr className="font-bold">
                                  <td className={`py-2 pr-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total</td>
                                  <td className={`py-2 pr-2 text-right whitespace-nowrap ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(categoryDetail.totalSpend)}</td>
                                  <td className={`py-2 pl-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>100%</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-gray-50 border-gray-200/80'}`}>
                          <h4 className={`font-bold text-sm mb-3 ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Top Suppliers</h4>
                          <div className="overflow-x-auto">
                            <table className={`w-full text-left text-xs ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                              <thead className={`uppercase border-b ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-gray-200 text-gray-400'}`}>
                                <tr>
                                  <th className="py-2 pr-2 font-semibold">#</th>
                                  <th className="py-2 pr-2 font-semibold">Supplier</th>
                                  <th className="py-2 pr-2 font-semibold text-right">Total PO</th>
                                  <th className="py-2 pr-2 font-semibold text-right">Avg PO Value</th>
                                  <th className="py-2 pl-2 font-semibold text-right">Total Spend</th>
                                </tr>
                              </thead>
                              <tbody>
                                {categoryDetail.topSuppliers.map((s, i) => (
                                  <tr key={i} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                                    <td className="py-2 pr-2">{i + 1}</td>
                                    <td className="py-2 pr-2 font-medium">{s.name}</td>
                                    <td className="py-2 pr-2 text-right">{s.count}</td>
                                    <td className="py-2 pr-2 text-right whitespace-nowrap">{formatUSD(s.avg)}</td>
                                    <td className="py-2 pl-2 text-right whitespace-nowrap font-semibold">{formatUSD(s.spend)}</td>
                                  </tr>
                                ))}
                                {categoryDetail.topSuppliers.length === 0 && (
                                  <tr><td colSpan={5} className={`py-4 text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No supplier data.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Recent Transactions */}
                      <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-gray-50 border-gray-200/80'}`}>
                        <h4 className={`font-bold text-sm mb-3 ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>Recent Transactions</h4>
                        <div className="overflow-x-auto">
                          <table className={`w-full text-left text-xs ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                            <thead className={`uppercase border-b ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-gray-200 text-gray-400'}`}>
                              <tr>
                                <th className="py-2 pr-2 font-semibold">PO Number</th>
                                <th className="py-2 pr-2 font-semibold">Date</th>
                                <th className="py-2 pr-2 font-semibold">Supplier</th>
                                <th className="py-2 pr-2 font-semibold">Subcategory</th>
                                <th className="py-2 pr-2 font-semibold text-right">PO Value</th>
                                <th className="py-2 pl-2 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {categoryDetail.recentTransactions.map((o, i) => {
                                const statusStyle = /complete/i.test(o.status)
                                  ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                                  : /progress/i.test(o.status)
                                    ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                    : (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600');
                                return (
                                  <tr key={i} className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                                    <td className="py-2 pr-2 font-medium">{o.poNumber || '-'}</td>
                                    <td className="py-2 pr-2 whitespace-nowrap">{formatDateID(o.date)}</td>
                                    <td className="py-2 pr-2">{getOrderSupplier(o)}</td>
                                    <td className="py-2 pr-2">{getOrderSubcategory(o)}</td>
                                    <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold">{formatUSD(getOrderTotal(o))}</td>
                                    <td className="py-2 pl-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle}`}>{o.status}</span></td>
                                  </tr>
                                );
                              })}
                              {categoryDetail.recentTransactions.length === 0 && (
                                <tr><td colSpan={6} className={`py-4 text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>No transactions found.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
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

                <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-slate-800 bg-[#1E293B]' : 'border-gray-200 bg-white'}`}>
                  <div className="p-5 pb-4">
                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {compareSupplierData.rows.map((row) => (
                        <span
                          key={row.name}
                          className={`inline-flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-full text-sm font-semibold border ${isDarkMode ? 'bg-transparent border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'}`}
                        >
                          <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ backgroundColor: row.color }}></span>
                          {row.name}
                          <button
                            onClick={() => handleRemoveCompareSupplier(row.name)}
                            className={`ml-0.5 flex items-center justify-center text-sm cursor-pointer transition-colors ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </span>
                      ))}
                    </div>

                    <p className={`text-[11px] mb-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      {compareGrowthChart.mode === 'year'
                        ? 'Perubahan total pengeluaran 30 hari terakhir dibanding awal rentang (0% = titik awal). Arahkan kursor ke grafik untuk melihat nilainya.'
                        : 'Pengeluaran per periode dibanding rata-rata masing-masing supplier (0% = rata-rata). Arahkan kursor ke grafik untuk melihat nilainya.'}
                    </p>
                    <div className="w-full h-80 relative">
                      {compareGrowthChart.labels.length === 0 ? (
                        <div className={`h-full flex items-center justify-center text-sm text-center px-6 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                          Belum ada data order pada rentang waktu ini.
                        </div>
                      ) : (
                      <svg
                        viewBox="0 0 1000 300"
                        className="w-full h-full overflow-visible"
                        onMouseMove={(e) => {
                          const svg = e.currentTarget;
                          const ctm = svg.getScreenCTM();
                          if (!ctm) return;
                          const pt = svg.createSVGPoint();
                          pt.x = e.clientX; pt.y = e.clientY;
                          const p = pt.matrixTransform(ctm.inverse());
                          const n = compareGrowthChart.labels.length;
                          const idx = n > 1 ? Math.round(((p.x - 40) / 920) * (n - 1)) : 0;
                          setCompareHoverIdx(Math.max(0, Math.min(n - 1, idx)));
                        }}
                        onMouseLeave={() => setCompareHoverIdx(null)}
                      >
                        {compareGrowthChart.mode === 'year' ? compareGrowthChart.ticks.map((t) => {
                          const n = compareGrowthChart.labels.length;
                          const x = n > 1 ? (t.idx / (n - 1)) * 920 + 40 : 500;
                          return (
                            <line key={`vt-${t.idx}`} x1={x} y1="20" x2={x} y2="260" stroke={isDarkMode ? '#334155' : '#E5E7EB'} strokeWidth="1" />
                          );
                        }) : [0, 1, 2, 3].map((step) => {
                          const x = 40 + step * (920 / 3);
                          return (
                            <line key={`v-${step}`} x1={x} y1="20" x2={x} y2="260" stroke={isDarkMode ? '#334155' : '#E5E7EB'} strokeWidth="1" />
                          );
                        })}

                        {compareGrowthChart.mode === 'year' && (
                          <g>
                            {compareGrowthChart.yTicks.map((v) => {
                              const y = mapPercentToY(v, compareGrowthChart.minNormalized, compareGrowthChart.maxNormalized, 25, 260);
                              return (
                                <text key={`yt-${v}`} x="32" y={y + 4} textAnchor="end" className={`text-[11px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>{v}%</text>
                              );
                            })}
                            <line
                              x1="40" x2="960"
                              y1={mapPercentToY(0, compareGrowthChart.minNormalized, compareGrowthChart.maxNormalized, 25, 260)}
                              y2={mapPercentToY(0, compareGrowthChart.minNormalized, compareGrowthChart.maxNormalized, 25, 260)}
                              stroke={isDarkMode ? '#64748B' : '#9CA3AF'} strokeDasharray="1 5" strokeWidth="1.5" strokeLinecap="round"
                            />
                          </g>
                        )}

                        {compareGrowthChart.mode !== 'year' && [0, 1, 2, 3, 4].map((step) => {
                          const y = 25 + step * 58.75;
                          const gridVal = compareGrowthChart.maxNormalized - (step * (compareGrowthChart.maxNormalized - compareGrowthChart.minNormalized)) / 4;
                          const isZeroLine = Math.abs(gridVal) < ((compareGrowthChart.maxNormalized - compareGrowthChart.minNormalized) / 8);
                          return (
                            <g key={step}>
                              {isZeroLine && (
                                <line x1="40" y1={y} x2="960" y2={y} stroke={isDarkMode ? '#64748B' : '#9CA3AF'} strokeDasharray="2 4" strokeWidth="1.5" strokeLinecap="round" />
                              )}
                              <text x="32" y={y + 4} textAnchor="end" className={`text-[11px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>
                                {gridVal.toFixed(0)}%
                              </text>
                            </g>
                          );
                        })}

                        {compareGrowthChart.rows.map((row) => {
                          const n = row.normalized.length;
                          const points = row.normalized.map((val, idx) => ({
                            x: n > 1 ? (idx / (n - 1)) * 920 + 40 : 500,
                            y: mapPercentToY(val, compareGrowthChart.minNormalized, compareGrowthChart.maxNormalized, 25, 260)
                          }));
                          return (
                            <path
                              key={row.name}
                              d={points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ')}
                              fill="none"
                              stroke={row.color}
                              strokeWidth={compareGrowthChart.mode === 'year' ? 2 : 2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          );
                        })}

                        {compareGrowthChart.rows.map((row) => {
                          const n = row.normalized.length;
                          const lastIdx = n - 1;
                          const x = n > 1 ? (lastIdx / (n - 1)) * 920 + 40 : 500;
                          const y = mapPercentToY(row.normalized[lastIdx], compareGrowthChart.minNormalized, compareGrowthChart.maxNormalized, 25, 260);
                          return (
                            <circle
                              key={`${row.name}-dot`}
                              cx={x} cy={y} r="5"
                              fill={row.color}
                            />
                          );
                        })}

                        {compareGrowthChart.mode === 'year' && compareGrowthChart.ticks.map((t) => {
                          const n = compareGrowthChart.labels.length;
                          const x = n > 1 ? (t.idx / (n - 1)) * 920 + 40 : 500;
                          return (
                            <text key={`xt-${t.idx}`} x={x} y="284" textAnchor="middle" className={`text-[11px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>{t.label}</text>
                          );
                        })}

                        {compareGrowthChart.mode !== 'year' && compareGrowthChart.labels.map((label, idx, arr) => {
                          const step = Math.max(1, Math.ceil(arr.length / 6));
                          if (idx % step !== 0 && idx !== arr.length - 1) return null;
                          const x = arr.length > 1 ? (idx / (arr.length - 1)) * 920 + 40 : 500;
                          return (
                            <text key={idx} x={x} y="284" textAnchor="middle" className={`text-[11px] ${isDarkMode ? 'fill-slate-400' : 'fill-gray-500'}`}>{label}</text>
                          );
                        })}

                        {compareHoverIdx !== null && compareHoverIdx < compareGrowthChart.labels.length && (() => {
                          const n = compareGrowthChart.labels.length;
                          const i = compareHoverIdx;
                          const x = n > 1 ? (i / (n - 1)) * 920 + 40 : 500;
                          const rows = compareGrowthChart.rows;
                          const lineH = 15;
                          const boxW = 236;
                          const boxH = 30 + rows.length * lineH;
                          const boxX = x > 560 ? x - boxW - 12 : x + 12;
                          return (
                            <g pointerEvents="none">
                              <line x1={x} y1="20" x2={x} y2="260" stroke={isDarkMode ? '#94A3B8' : '#6B7280'} strokeDasharray="3 3" strokeWidth="1" />
                              {rows.map((row) => (
                                <circle
                                  key={`hv-${row.name}`}
                                  cx={x}
                                  cy={mapPercentToY(row.normalized[i], compareGrowthChart.minNormalized, compareGrowthChart.maxNormalized, 25, 260)}
                                  r="4.5" fill={row.color} stroke={isDarkMode ? '#1E293B' : '#FFFFFF'} strokeWidth="1.5"
                                />
                              ))}
                              <rect x={boxX} y="22" width={boxW} height={boxH} rx="8" fill={isDarkMode ? '#0F172A' : '#FFFFFF'} stroke={isDarkMode ? '#334155' : '#E5E7EB'} />
                              <text x={boxX + 10} y="38" className={`text-[11px] font-semibold ${isDarkMode ? 'fill-slate-200' : 'fill-gray-800'}`}>{compareGrowthChart.labels[i]}</text>
                              {rows.map((row, r) => {
                                const pct = row.normalized[i];
                                const shortName = row.name.length > 14 ? `${row.name.slice(0, 13)}…` : row.name;
                                return (
                                  <g key={`tt-${row.name}`}>
                                    <circle cx={boxX + 14} cy={50 + r * lineH} r="3.5" fill={row.color} />
                                    <text x={boxX + 24} y={54 + r * lineH} className={`text-[10px] ${isDarkMode ? 'fill-slate-300' : 'fill-gray-600'}`}>
                                      {shortName}: {formatUSD(row.spend[i])} ({pct >= 0 ? '+' : ''}{pct.toFixed(0)}%)
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })()}
                      </svg>
                      )}
                    </div>
                  </div>

                  <div className={`flex flex-wrap items-center gap-1 px-4 py-3 border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                    {['1D', '5D', '1M', '6M', 'YTD', '1Y', '2Y', '3Y', '4Y', '5Y', 'MAX'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCompareTimeRange(r)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          compareTimeRange === r
                            ? (isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900')
                            : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800')
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      </AppLayout>
    </>
  );
}