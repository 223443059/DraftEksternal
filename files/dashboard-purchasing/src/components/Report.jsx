import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../hooks/useTheme';
import AppLayout from './AppLayout'; // header + sidebar + bar menu atas (sama seperti Dashboard)

// ---------------------------------------------------------------------------
// INDEXEDDB CACHE — supaya halaman Report langsung tampil dengan data terakhir
// (instan, dari disk) sambil data terbaru diambil dari backend di belakang layar.
// Cache-nya dibuat terpisah dari PurchaseOrders.jsx (struktur JSON beda), tidak
// bentrok satu sama lain.
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
  const [isReportOpen, setIsReportOpen] = useState(true);
  const [activeReportTab, setActiveReportTab] = useState('generate');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('All Statuses');
  const [filterSupplier, setFilterSupplier] = useState('All Suppliers');

  // Tema (terang/gelap), jam, profil & logout sekarang diurus AppLayout + useTheme (sama seperti Dashboard)
  const [isDarkMode, setIsDarkMode] = useTheme();

  // Durasi minimum garis loading tampil, supaya walau data sudah siap duluan
  // (mis. langsung ketemu di cache IndexedDB), animasinya tetap sempat menyapu
  // penuh dari kiri ke kanan dulu sebelum disembunyikan — tidak cuma "kedip".
  const MIN_LOADING_MS = 900;

  // FETCH DATA PURCHASE ORDERS DARI BACKEND DATABASE
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

      // 1. Tampilkan dulu data terakhir dari cache (kalau ada) — supaya halaman
      //    langsung keluar tanpa nunggu network, tidak ada layar kosong/loading lama.
      const cached = await getReportCache();
      if (Array.isArray(cached) && cached.length > 0) {
        setOrders(cached);
        hideLoadingSoftly();
      }

      // 2. Tetap ambil data terbaru dari backend di belakang layar, lalu update
      //    tabel + cache begitu selesai (tanpa mengunci tampilan awal).
      try {
        const response = await fetch('http://idws-n26010:5000/api/purchase-orders');
        if (response.ok) {
          const data = await response.json();
          setOrders(data);
          setReportCache(data);
          return;
        }
      } catch (e) {
        console.error('Gagal ngambil data Purchase Orders dari backend:', e);
      } finally {
        hideLoadingSoftly();
      }

      if (!cached) {
        const savedData = localStorage.getItem('dataPO_Ladeu');
        if (savedData) {
          try {
            setOrders(JSON.parse(savedData));
          } catch (e) {
            console.error('Gagal parse data dari localStorage:', e);
          }
        }
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
    const d = order.po_date || order.date || order.tanggal || order.orderDate || order.order_date;
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

  // === Kolom khusus untuk tabel "Purchase Spending (Import)" ===
  // (mengikuti struktur tabel purchase_orders: Product Group, Qty Received, UOM, Spending USD, Year, Local/Import)
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
    // fallback: hitung dari total nilai IDR kalau kolom Spending USD tidak ada
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

  // Rekap "Purchase Spending (Imperial)": baris per Product Group (nama sama seperti di halaman Purchase Orders),
  // kolom per tahun yang muncul di data (Quantity, Spending (USD), Price/UOM) — dinamis mengikuti data.
  // Semua data dipakai (tidak difilter Local/Import).
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
      // UOM yang ditampilkan = UOM paling sering muncul untuk Product Group ini
      const uom = Object.entries(data.uomCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      return { className, uom, years: data.years };
    });

    return { years, rows };
  }, [orders]);

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

  // EXPORT EXCEL & SIMPAN DISAAT YANG SAMA KE TABEL 'reports' DI MYSQL
  const handleExportExcel = async () => {
    if (filteredOrders.length === 0) {
      alert('Tidak ada data untuk diekspor!');
      return;
    }

    const fileName = `Purchase_Orders_Report_${new Date().toISOString().slice(0, 10)}.csv`;

    // 1. Simpan catatan riwayat ke tabel 'reports' di MySQL
    try {
      await fetch('http://idws-n26010:5000/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_name: fileName,
          generated_by: user?.username || 'Admin',
          file_path: `/exports/${fileName}`
        })
      });
    } catch (error) {
      console.error('Gagal menyimpan riwayat report ke database:', error);
    }

    // 2. Proses Download File CSV/Excel di Browser
    const headers = ['PO Number', 'Date', 'Supplier', 'Category', 'Status', 'Total Value (USD)'];
    const rows = filteredOrders.map((o) => {
      const idrValue = getOrderTotalIDR(o);
      const usdValue = idrValue / EXCHANGE_RATE;
      const escapeStr = (str) => `"${String(str).replace(/"/g, '""')}"`;

      return [
        escapeStr(getPoNumber(o)),
        escapeStr(getOrderDate(o)),
        escapeStr(getOrderSupplier(o)),
        escapeStr(getOrderCategory(o)),
        escapeStr(getOrderStatus(o)),
        usdValue.toFixed(2)
      ];
    });

    const csvString = [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\r\n');
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

  // PAGINATION: tabel hanya merender 1 halaman sekaligus, bukan seluruh filteredOrders.
  // Tanpa ini, data ribuan/ratusan-ribu baris akan bikin browser hang saat render tabel.
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

  return (
    <AppLayout
      activePage="report"
      changePage={changePage}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      submenu={{
        page: 'report',
        open: isReportOpen,
        onToggle: () => setIsReportOpen((prev) => !prev),
        items: [
          { id: 'generate', label: 'Generate Report', icon: 'fa-list-check' },
          { id: 'export', label: 'Export Excel', icon: 'fa-file-excel' },
        ],
        activeId: activeReportTab,
        onSelect: setActiveReportTab,
      }}
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

          {activeReportTab === 'export' ? (
            /* EXPORT EXCEL */
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-[#0C3B7C]'}`}>
                  Excel Export
                </h1>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-[#6B7280]'}`}>
                  Export data supplier dan laporan Purchase Order ke file Excel.
                </p>
              </div>

              <div className={`w-full rounded-2xl shadow-xs py-16 px-8 flex flex-col items-center text-center transition-colors ${isDarkMode ? 'bg-[#1E293B] border border-slate-800' : 'bg-white'}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shrink-0 ${isDarkMode ? 'bg-emerald-950/80 text-emerald-400' : 'bg-[#E2F7EB] text-[#008A52]'}`}>
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM13 3.5L18.5 9H13V3.5zM8.5 17.5l2-3.5-2-3.5h1.8l1.1 2.2 1.1-2.2h1.8l-2 3.5 2 3.5h-1.8l-1.1-2.2-1.1 2.2H8.5z"/>
                  </svg>
                </div>

                <h2 className={`text-lg font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>
                  Export Supplier Data via Excel
                </h2>

                <p className={`text-sm max-w-xl mb-6 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-[#6B7280]'}`}>
                  Export file .xlsx atau .xls untuk menyimpan data supplier dan laporan Purchase Order. Data yang diekspor akan menyesuaikan dengan filter yang dipilih.
                </p>

                <button
                  onClick={handleExportExcel}
                  className="bg-[#008A52] hover:bg-[#007344] active:scale-95 text-white font-medium px-5 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-all shadow-xs cursor-pointer"
                >
                  <i className="fa-solid fa-upload text-xs"></i>
                  <span>Export Excel File</span>
                </button>

                <p className={`text-xs mt-6 ${isDarkMode ? 'text-slate-500' : 'text-[#8A94A6]'}`}>
                  Saat ini ada {filteredOrders.length} supplier/PO di database.
                </p>

                <button
                  onClick={() => setActiveReportTab('generate')}
                  className="mt-6 text-sm font-semibold text-[#1A56DB] hover:underline flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <i className="fa-solid fa-arrow-left text-xs"></i>
                  <span>Kembali ke Generate Report</span>
                </button>
              </div>
            </div>
          ) : (
            /* GENERATE REPORT: Purchase Spending (Import) — rekap per Main Class x Tahun */
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Purchase Spending (Imperial)</h1>
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Rekap quantity, spending, dan price/UOM untuk seluruh pembelian, per kategori dan per tahun.</p>
                </div>
              </div>

              {/* TABLE: PURCHASE SPENDING */}
              <div className={`rounded-2xl border shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className={`border-b font-semibold text-xs uppercase ${isDarkMode ? 'bg-[#0F172A] border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        <th rowSpan={2} className="py-4 px-6 align-bottom">Category</th>
                        <th rowSpan={2} className="py-4 px-6 align-bottom">UOM</th>
                        {purchaseSpendingReport.years.map((yr, idx) => (
                          <th
                            key={yr}
                            colSpan={3}
                            className={`py-3 px-6 text-center ${idx > 0 ? (isDarkMode ? 'border-l border-slate-800' : 'border-l border-gray-200') : ''}`}
                          >
                            {yr}
                          </th>
                        ))}
                      </tr>
                      <tr className={`border-b font-semibold text-[11px] uppercase ${isDarkMode ? 'bg-[#0F172A] border-slate-800 text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                        {purchaseSpendingReport.years.map((yr, idx) => (
                          <React.Fragment key={yr}>
                            <th className={`py-2 px-4 text-right ${idx > 0 ? (isDarkMode ? 'border-l border-slate-800' : 'border-l border-gray-200') : ''}`}>Quantity</th>
                            <th className="py-2 px-4 text-right">Spending (USD)</th>
                            <th className="py-2 px-4 text-right">Price/UOM</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                      {purchaseSpendingReport.rows.length === 0 ? (
                        <tr>
                          <td colSpan={2 + purchaseSpendingReport.years.length * 3} className="py-10 text-center text-gray-400">
                            No purchase data found.
                          </td>
                        </tr>
                      ) : (
                        purchaseSpendingReport.rows.map((row) => (
                          <tr key={row.className} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                            <td className={`py-4 px-6 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{row.className}</td>
                            <td className={`py-4 px-6 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{row.uom}</td>
                            {purchaseSpendingReport.years.map((yr, idx) => {
                              const cell = row.years[yr];
                              const qty = cell?.qty || 0;
                              const spendUSD = cell?.spendUSD || 0;
                              const priceUOM = qty > 0 ? spendUSD / qty : 0;
                              return (
                                <React.Fragment key={yr}>
                                  <td className={`py-4 px-4 text-right ${idx > 0 ? (isDarkMode ? 'border-l border-slate-800' : 'border-l border-gray-200') : ''}`}>{formatQty(qty)}</td>
                                  <td className="py-4 px-4 text-right">{formatUSD(spendUSD)}</td>
                                  <td className={`py-4 px-4 text-right font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSD(priceUOM)}</td>
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
          )}
    </AppLayout>
  );
}