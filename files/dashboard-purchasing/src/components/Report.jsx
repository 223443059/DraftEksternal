import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../hooks/useTheme';
import AppLayout from './AppLayout'; // header + sidebar + top menu bar (same as Dashboard)
import { API_ENDPOINTS } from '../utils/api.config';

// Report history endpoint: use API_ENDPOINTS.REPORTS if available, otherwise derive it from the PURCHASE_ORDERS address
const REPORTS_ENDPOINT =
  API_ENDPOINTS.REPORTS || API_ENDPOINTS.PURCHASE_ORDERS.replace(/\/purchase-orders\/?$/, '/reports');

// ---------------------------------------------------------------------------
// INDEXEDDB CACHE — so the Report page shows the latest saved data instantly
// (from disk) while fresh data is fetched from the backend in the background.
// This cache is separate from PurchaseOrders.jsx (different JSON structure),
// so the two never conflict.
// ---------------------------------------------------------------------------
const REPORT_IDB_NAME = 'DetpakReport_DB';
const REPORT_IDB_STORE = 'report_cache';
const REPORT_CACHE_KEY = 'purchaseOrdersRaw';

const initReportIDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(REPORT_IDB_NAME, 1);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(REPORT_IDB_STORE)) {
      db.createObjectStore(REPORT_IDB_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const setReportCache = async (rows) => {
  try {
    const db = await initReportIDB();
    const tx = db.transaction(REPORT_IDB_STORE, 'readwrite');
    tx.objectStore(REPORT_IDB_STORE).put(rows, REPORT_CACHE_KEY);
  } catch (err) {
    console.warn('Failed to save Report cache to IndexedDB:', err);
  }
};

const getReportCache = async () => {
  try {
    const db = await initReportIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(REPORT_IDB_STORE, 'readonly');
      const req = tx.objectStore(REPORT_IDB_STORE).get(REPORT_CACHE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
};

export default function Report({ changePage, onLogout, orders: propOrders }) {
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');
  const EXCHANGE_RATE = 15500;

  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

  // "Year" filter: a window of 3 consecutive years (e.g. 2024 -> columns 2024, 2025, 2026)
  const YEAR_SPAN = 3;
  const currentYear = new Date().getFullYear();
  const [startYear, setStartYear] = useState(currentYear - (YEAR_SPAN - 1));
  const [isYearOpen, setIsYearOpen] = useState(false);
  const yearDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target)) {
        setIsYearOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('All Statuses');
  const [filterSupplier, setFilterSupplier] = useState('All Suppliers');

  // Theme (light/dark), clock, profile & logout are now handled by AppLayout + useTheme (same as Dashboard)
  const [isDarkMode, setIsDarkMode] = useTheme();

  // Minimum time the loading bar stays visible, so even if data is ready early
  // (e.g. found right away in the IndexedDB cache), the animation still sweeps
  // fully from left to right before hiding — instead of just flashing.
  const MIN_LOADING_MS = 900;

  // FETCH PURCHASE ORDERS DATA FROM THE BACKEND DATABASE
  useEffect(() => {
    const loadStartedAt = Date.now();
    const hideLoadingSoftly = () => {
      const elapsed = Date.now() - loadStartedAt;
      const remaining = MIN_LOADING_MS - elapsed;
      if (remaining > 0) {
        setTimeout(() => setIsLoadingOrders(false), remaining);
      } else {
        setIsLoadingOrders(false);
      }
    };

    const fetchPurchaseOrders = async () => {
      if (Array.isArray(propOrders) && propOrders.length > 0) {
        setOrders(propOrders);
        hideLoadingSoftly();
        return;
      }

      // 1. Show the latest cached data first (if any) — so the page appears
      //    immediately without waiting for the network, with no empty screen or long loading.
      const cached = await getReportCache();
      if (Array.isArray(cached) && cached.length > 0) {
        setOrders(cached);
        hideLoadingSoftly();
      }

      // 2. Still fetch the latest data from the backend in the background, then update
      //    the table + cache once done (without blocking the initial view).
      try {
        const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS);
        if (response.ok) {
          const data = await response.json();
          setOrders(data);
          setReportCache(data);
          return;
        }
      } catch (e) {
        console.error('Failed to fetch Purchase Orders from the backend:', e);
      } finally {
        hideLoadingSoftly();
      }
    };

    fetchPurchaseOrders();
  }, [propOrders]);

  const getOrderTotalIDR = (order) => {
    if (!order) return 0;
    const rawValue = order.total_amount ?? order.totalCost ?? order.totalNilai ?? order.TotalNilai ?? order.total_nilai ?? order.grandTotal ?? order.total ?? 0;

    if ((!rawValue || Number(rawValue) === 0) && order.items && Array.isArray(order.items)) {
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

  const getOrderDate = (order) => {
    const d = order.receipt_date || order.po_date || order.date || order.tanggal || order.orderDate || order.order_date;
    if (!d) return '-';
    return typeof d === 'string' && d.includes('T') ? d.split('T')[0] : d;
  };

  const getOrderCategory = (order) => order.category || order.kategori || order.categoryName || 'Raw Material';
  const getOrderSupplier = (order) => order.supplier_name || order.supplier || order.supplierName || order.namaSupplier || '-';

  const getOrderStatus = (order) => {
    const status = order.order_status || order.status || order.statusPesanan || order.orderStatus || 'Pending';
    const statusMap = {
      'menunggu approval': 'Waiting for Approval',
      'disetujui': 'Approved',
      'diproses': 'Processing',
      'dikirim': 'Shipped',
      'selesai': 'Completed',
      'dibatalkan': 'Cancelled',
      'unsubmitted': 'Pending',
      'pending': 'Pending'
    };
    return statusMap[String(status).toLowerCase()] || status;
  };

  const getPoNumber = (order) => order.po_number || order.po_no || order.poNumber || order.noPO || order.nomorPO || '-';

  // === Columns specific to the "Purchase Spending (Import)" table ===
  // (follows the purchase_orders table structure: Product Group, Qty Received, UOM, Spending USD, Year, Local/Import)
  const getProductGroup = (order) =>
    order.product_group || order.productGroup || order.ProductGroup || 'Other';

  const getQtyReceived = (order) => {
    const raw = order.qty_received ?? order.qtyReceived ?? order.QtyReceived ?? order.quantity ?? order.qty ?? 0;
    if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
    return parseFloat(raw) || 0;
  };

  const getUOM = (order) => order.uom || order.UOM || order.satuan || '-';

  const getSpendingUSD = (order) => {
    const raw = order.spending_usd ?? order.spendingUSD ?? order.spending_USD ?? order.SpendingUSD;
    if (raw !== undefined && raw !== null && raw !== '') {
      if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
      return parseFloat(raw) || 0;
    }
    // fallback: calculate from the total IDR value if the Spending USD column is missing
    return getOrderTotalIDR(order) / EXCHANGE_RATE;
  };

  const getLocalImport = (order) =>
    order.local_import || order.localImport || order['Local/Import'] || order.localOrImport || '-';

  const getOrderYear = (order) => {
    const raw = order.year || order.Year;
    if (raw) return String(raw);
    const d = getOrderDate(order);
    if (d && d !== '-') {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return String(parsed.getFullYear());
    }
    return null;
  };

  // "Purchase Spending" summary: one row per Product Group (same names as on the Purchase Orders page),
  // one column group per year found in the data (Quantity, Spending (USD), Price/UOM) — dynamic based on the data.
  // All data is used (not filtered by Local/Import).
  const purchaseSpendingReport = useMemo(() => {
    const years = [...new Set(orders.map(getOrderYear).filter(Boolean))].sort();

    const byClass = {};
    orders.forEach((o) => {
      const cls = getProductGroup(o);
      const yr = getOrderYear(o);
      if (!yr) return;
      if (!byClass[cls]) byClass[cls] = { uomCounts: {}, years: {} };

      const uom = getUOM(o);
      byClass[cls].uomCounts[uom] = (byClass[cls].uomCounts[uom] || 0) + 1;

      if (!byClass[cls].years[yr]) byClass[cls].years[yr] = { qty: 0, spendUSD: 0 };
      byClass[cls].years[yr].qty += getQtyReceived(o);
      byClass[cls].years[yr].spendUSD += getSpendingUSD(o);
    });

    const rows = Object.entries(byClass).map(([className, data]) => {
      // Displayed UOM = the most frequently used UOM for this Product Group
      const uom = Object.entries(data.uomCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      return { className, uom, years: data.years };
    });

    return { years, rows };
  }, [orders]);

  // Dropdown options: start year from (current year - 5) or the oldest year in the data, up to (current year - 1)
  const yearOptions = useMemo(() => {
    const dataYears = purchaseSpendingReport.years.map(Number).filter(Boolean);
    const first = Math.min(currentYear - 5, ...(dataYears.length ? dataYears : [currentYear]));
    const last = currentYear - 1;
    const opts = [];
    for (let y = first; y <= last; y++) {
      opts.push({ value: y, label: `${y} (${y} \u2013 ${y + YEAR_SPAN - 1})` });
    }
    return opts;
  }, [purchaseSpendingReport.years, currentYear]);

  const selectedYearLabel = `${startYear} (${startYear} \u2013 ${startYear + YEAR_SPAN - 1})`;
  const reportYears = Array.from({ length: YEAR_SPAN }, (_, i) => String(startYear + i));

  const formatQty = (number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number || 0);

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

  // EXPORT EXCEL (Purchase Spending table for the selected year window)
  // & save the history to the 'reports' table in MySQL
  const handleExportExcel = async () => {
    if (purchaseSpendingReport.rows.length === 0) {
      alert('There is no data to export!');
      return;
    }

    const fileName = `Purchase_Spending_${reportYears[0]}-${reportYears[reportYears.length - 1]}_${new Date().toISOString().slice(0, 10)}.csv`;

    // 1. Save the history record to the 'reports' table in MySQL
    try {
      await fetch(REPORTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_name: fileName,
          generated_by: user?.username || 'Admin',
          file_path: `/exports/${fileName}`
        })
      });
    } catch (error) {
      console.error('Failed to save report history to the database:', error);
    }

    // 2. Download the CSV file (opens in Excel) in the browser
    const escapeStr = (str) => `"${String(str).replace(/"/g, '""')}"`;

    const headers = [
      'Category',
      'UOM',
      ...reportYears.flatMap((yr) => [`${yr} Quantity`, `${yr} Spending (USD)`, `${yr} Price/UOM`]),
    ];

    const rows = purchaseSpendingReport.rows.map((row) => [
      escapeStr(row.className),
      escapeStr(row.uom),
      ...reportYears.flatMap((yr) => {
        const qty = row.years[yr]?.qty || 0;
        const spendUSD = row.years[yr]?.spendUSD || 0;
        const priceUOM = qty > 0 ? spendUSD / qty : 0;
        return [qty.toFixed(2), spendUSD.toFixed(2), priceUOM.toFixed(2)];
      }),
    ]);

    const csvString = [headers.map(escapeStr).join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

  const statusOptions = ['All Statuses', 'Waiting for Approval', 'Approved', 'Processing', 'Shipped', 'Completed', 'Cancelled', 'Pending'];

  // PAGINATION: the table only renders one page at a time, not the whole filteredOrders.
  // Without this, thousands/hundreds of thousands of rows would hang the browser while rendering.
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterSupplier, startDate, endDate]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage]);

  const getStatusColor = (status) => {
    const s = String(status).toLowerCase();
    if (s.includes('completed')) {
      return isDarkMode ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold' : 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold';
    }
    if (s.includes('shipped') || s.includes('processing') || s.includes('approved')) {
      return isDarkMode ? 'bg-blue-950/80 text-blue-400 border border-blue-800 font-semibold' : 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold';
    }
    return isDarkMode ? 'bg-amber-950/80 text-amber-400 border border-amber-800 font-bold' : 'bg-amber-100 text-amber-800 border border-amber-300 font-bold';
  };

  const cellBorder = isDarkMode ? 'border-slate-700' : 'border-gray-200';
  // Category & UOM columns are sticky (stay in place when the table scrolls sideways) -> background must be solid
  const stickyHeadBg = isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-50';
  const stickyBodyBg = isDarkMode ? 'bg-[#1E293B] group-hover:bg-slate-800' : 'bg-white group-hover:bg-gray-50';
  const stickyShadow = 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]';

  return (
    <AppLayout
      activePage="report"
      changePage={changePage}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
    >
      {/* TOP LOADING BAR */}
      {isLoadingOrders && (
        <div className="fixed top-0 left-0 w-full h-[3px] z-[100] bg-transparent overflow-hidden">
          <style>{`
            @keyframes dashboardTopLoadingBar {
              0% { left: -40%; width: 40%; opacity: 1; }
              90% { left: 100%; width: 40%; opacity: 1; }
              100% { left: 100%; width: 40%; opacity: 0; }
            }
          `}</style>
          <div
            className="absolute top-0 h-full bg-gradient-to-r from-red-500 via-red-600 to-red-500 shadow-[0_0_8px_rgba(220,38,38,0.6)]"
            style={{ animation: 'dashboardTopLoadingBar 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
          />
        </div>
      )}

          {/* PURCHASE REPORT: Purchase Spending — summary per Product Group x Year (3-year window filter) */}
            <div className="space-y-6">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                  <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Purchase Spending</h1>
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Summary of quantity, spending, and total purchase value to compare performance over a selected period.
                  </p>
                </div>

                <div className="flex flex-wrap items-stretch gap-3">
                {/* YEAR FILTER */}
                <div className="flex items-stretch">
                  <div className={`flex items-center gap-2.5 px-5 rounded-l-xl border border-r-0 text-sm font-semibold ${isDarkMode ? 'bg-[#1E293B] border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-[#1F2937]'}`}>
                    <i className={`fa-regular fa-calendar ${isDarkMode ? 'text-slate-300' : 'text-[#0C3B7C]'}`}></i>
                    <span>Year</span>
                  </div>
                  <div className="relative" ref={yearDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsYearOpen((prev) => !prev)}
                      className={`h-full min-w-[200px] flex items-center justify-between gap-6 px-4 py-2.5 rounded-r-xl border-2 text-sm font-semibold cursor-pointer transition-colors ${
                        isDarkMode ? 'bg-[#1E293B] text-white' : 'bg-white text-[#0C3B7C]'
                      } ${isYearOpen ? 'border-blue-500' : isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}
                    >
                      <span>{selectedYearLabel}</span>
                      <i className={`fa-solid ${isYearOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs`}></i>
                    </button>

                    {isYearOpen && (
                      <ul className={`absolute right-0 top-full mt-1.5 w-full min-w-[220px] z-50 rounded-xl border shadow-lg py-1.5 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                        {yearOptions.map((opt) => {
                          const isSelected = opt.value === startYear;
                          return (
                            <li key={opt.value}>
                              <button
                                type="button"
                                onClick={() => {
                                  setStartYear(opt.value);
                                  setIsYearOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left cursor-pointer transition-colors ${
                                  isSelected
                                    ? isDarkMode ? 'bg-blue-950/60 text-blue-300 font-semibold' : 'bg-blue-50 text-[#1A56DB] font-semibold'
                                    : isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                <span>{opt.label}</span>
                                {isSelected && <i className="fa-solid fa-check text-xs"></i>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* EXPORT EXCEL */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={purchaseSpendingReport.rows.length === 0}
                  className="bg-[#008A52] hover:bg-[#007344] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 rounded-xl text-sm flex items-center gap-2.5 transition-all shadow-xs cursor-pointer"
                >
                  <i className="fa-solid fa-file-excel text-sm"></i>
                  <span>Export Excel</span>
                </button>
                </div>
              </div>

              {/* TABLE: PURCHASE SPENDING */}
              <div className={`rounded-2xl border shadow-xs p-5 ${isDarkMode ? 'bg-[#1E293B]/90 border-slate-800' : 'bg-white/80 border-gray-100'}`}>
                <div className={`overflow-x-auto rounded-lg border-t border-l ${cellBorder}`}>
                  <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-0">
                    <thead>
                      <tr className={`font-semibold text-xs uppercase ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-slate-50 text-gray-500'}`}>
                        <th rowSpan={2} className={`py-4 px-4 align-middle border-b border-r ${cellBorder} sticky left-0 z-20 w-[190px] min-w-[190px] ${stickyHeadBg}`}>Category</th>
                        <th rowSpan={2} className={`py-4 px-4 align-middle text-center border-b border-r ${cellBorder} sticky left-[190px] z-20 w-[80px] min-w-[80px] ${stickyHeadBg} ${stickyShadow}`}>UOM</th>
                        {reportYears.map((yr) => (
                          <th
                            key={yr}
                            colSpan={3}
                            className={`py-3 px-4 text-center text-sm normal-case border-b border-r ${cellBorder} ${isDarkMode ? 'text-slate-200 bg-[#1E293B]' : 'text-gray-800 bg-white'}`}
                          >
                            {yr}
                          </th>
                        ))}
                      </tr>
                      <tr className={`font-semibold text-[11px] uppercase ${isDarkMode ? 'bg-[#0F172A] text-slate-500' : 'bg-slate-50 text-gray-400'}`}>
                        {reportYears.map((yr) => (
                          <React.Fragment key={yr}>
                            <th className={`py-2.5 px-4 text-center border-b border-r ${cellBorder}`}>Quantity</th>
                            <th className={`py-2.5 px-4 text-center border-b border-r ${cellBorder}`}>Spending (USD)</th>
                            <th className={`py-2.5 px-4 text-center border-b border-r ${cellBorder}`}>Price/UOM</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={isDarkMode ? 'text-slate-300' : 'text-gray-700'}>
                      {purchaseSpendingReport.rows.length === 0 ? (
                        <tr>
                          <td colSpan={2 + reportYears.length * 3} className="py-10 text-center text-gray-400">
                            No purchase data found.
                          </td>
                        </tr>
                      ) : (
                        purchaseSpendingReport.rows.map((row) => (
                          <tr key={row.className} className="group">
                            <td className={`py-4 px-4 font-bold border-b border-r ${cellBorder} sticky left-0 z-10 w-[190px] min-w-[190px] transition-colors ${stickyBodyBg} ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{row.className}</td>
                            <td className={`py-4 px-4 text-center border-b border-r ${cellBorder} sticky left-[190px] z-10 w-[80px] min-w-[80px] transition-colors ${stickyBodyBg} ${stickyShadow} ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{row.uom}</td>
                            {reportYears.map((yr) => {
                              const cell = row.years[yr];
                              const qty = cell?.qty || 0;
                              const spendUSD = cell?.spendUSD || 0;
                              const priceUOM = qty > 0 ? spendUSD / qty : 0;
                              return (
                                <React.Fragment key={yr}>
                                  <td className={`py-4 px-4 text-right border-b border-r ${cellBorder} transition-colors ${isDarkMode ? 'group-hover:bg-slate-800/50' : 'group-hover:bg-gray-50'}`}>{formatQty(qty)}</td>
                                  <td className={`py-4 px-4 text-right border-b border-r ${cellBorder} transition-colors ${isDarkMode ? 'group-hover:bg-slate-800/50' : 'group-hover:bg-gray-50'}`}>{formatUSD(spendUSD)}</td>
                                  <td className={`py-4 px-4 text-right font-bold border-b border-r ${cellBorder} transition-colors ${isDarkMode ? 'text-white group-hover:bg-slate-800/50' : 'text-gray-900 group-hover:bg-gray-50'}`}>{formatUSD(priceUOM)}</td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
    </AppLayout>
  );
}