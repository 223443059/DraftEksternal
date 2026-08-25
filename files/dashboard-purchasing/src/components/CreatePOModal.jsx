import React, { useState, useEffect, useMemo, useRef } from 'react';

// Data Default yang Disesuaikan Persis dengan Tabel Purchase Orders Anda
const INITIAL_PO_DATA = [
  { poNumber: 'PO-1006', supplier: 'CV Bintang', tanggal: '2026-07-29', kategori: 'Hardware', prioritas: 'Normal', totalNilai: 'Rp 1.440.000', statusPesanan: 'MENUNGGU APPROVAL' },
  { poNumber: 'PO-1005', supplier: 'CV Melaju Bersama', tanggal: '2026-06-16', kategori: 'Hardware', prioritas: 'Normal', totalNilai: 'Rp 140.000.000', statusPesanan: 'SELESAI' },
  { poNumber: 'PO-1004', supplier: 'CV Bintang', tanggal: '2025-10-03', kategori: 'Furniture', prioritas: 'Normal', totalNilai: 'Rp 23.250.000', statusPesanan: 'SELESAI' },
  { poNumber: 'PO-1003', supplier: 'PT AE', tanggal: '2026-05-13', kategori: 'Services', prioritas: 'Normal', totalNilai: 'Rp 4.000.000', statusPesanan: 'SELESAI' },
  { poNumber: 'PO-1002', supplier: 'PT Rajendra Abadi', tanggal: '2026-06-28', kategori: 'Supplies', prioritas: 'Normal', totalNilai: 'Rp 17.100.000', statusPesanan: 'MENUNGGU APPROVAL' },
  { poNumber: 'PO-1001', supplier: 'PT Elektronik Maju', tanggal: '2026-07-28', kategori: 'Hardware', prioritas: 'Normal', totalNilai: 'Rp 50.000', statusPesanan: 'DIKIRIM' }
];

export default function Analytics({ changePage, onLogout }) {
  const [orders, setOrders] = useState([]);
  
  // Header & Profile State
  const [profile] = useState({ name: 'Ladeu Intern', email: 'intern@ladeu.com', role: 'Admin Procurement' });
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [hasNotif, setHasNotif] = useState(true);
  const profileRef = useRef(null);

  // === FUNGSI LOAD DATA TERBARU FROM STORAGE ===
  const fetchLatestPOData = () => {
    try {
      const saved =
        localStorage.getItem('dataPOV5') ||
        localStorage.getItem('purchaseOrders') ||
        localStorage.getItem('dataPOV3') ||
        localStorage.getItem('dataPurchaseOrdersLadeuV3');

      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrders(parsed);
          return;
        }
      }
      
      // Fallback data bawaan jika localStorage masih kosong
      setOrders(INITIAL_PO_DATA);
      localStorage.setItem('dataPOV5', JSON.stringify(INITIAL_PO_DATA));
    } catch (err) {
      console.error('Gagal mengambil data PO:', err);
      setOrders(INITIAL_PO_DATA);
    }
  };

  // === AUTO-SYNC LISTENER (SINKRONISASI REAL-TIME) ===
  useEffect(() => {
    fetchLatestPOData();

    const handleDataChange = () => fetchLatestPOData();

    // Listener untuk perubahan dalam tab yang sama maupun beda tab
    window.addEventListener('poDataUpdated', handleDataChange);
    window.addEventListener('storage', handleDataChange);

    return () => {
      window.removeEventListener('poDataUpdated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  // Popover Profil Handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // === HELPER MENGAMBIL ANGKA NOMINAL (EKSTRAK ANGKAMURNI) ===
  const parseAmount = (item) => {
    if (!item) return 0;
    
    // Cari field total harga yang ada di objek
    const raw = item.totalNilai || item.totalCost || item.totalHarga || item.total || item.grandTotal || 0;

    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const clean = raw.replace(/[^0-9]/g, '');
      return parseInt(clean, 10) || 0;
    }
    return 0;
  };

  // Helper Ambil Tahun dari String Tanggal ("2026-07-29")
  const getYear = (dateStr) => {
    if (!dateStr) return null;
    const match = String(dateStr).match(/\d{4}/);
    return match ? parseInt(match[0], 10) : null;
  };

  // Helper Ambil Bulan Index (0-11)
  const getMonthIndex = (dateStr) => {
    if (!dateStr) return null;
    const parts = String(dateStr).split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return parseInt(parts[1], 10) - 1; // YYYY-MM-DD
      if (parts[2].length === 4) return parseInt(parts[1], 10) - 1; // DD-MM-YYYY
    }
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.getMonth() : null;
  };

  // Format Rupiah
  const formatRupiah = (num) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);

  const formatShortRupiah = (val) => {
    if (!val || val === 0) return '0';
    if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1).replace('.0', '') + ' M';
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(1).replace('.0', '') + ' jt';
    if (val >= 1_000) return (val / 1_000).toFixed(0) + ' rb';
    return val.toString();
  };

  // === PERHITUNGAN ANGKANALYTICS SECARA OTOMATIS ===
  const stats = useMemo(() => {
    let spend2026 = 0;
    let spend2025 = 0;
    let completedCount = 0;
    let canceledCount = 0;

    orders.forEach((o) => {
      const val = parseAmount(o);
      const year = getYear(o.tanggal || o.date || o.orderDate);
      const status = String(o.statusPesanan || o.status || '').toUpperCase();

      if (year === 2026) spend2026 += val;
      if (year === 2025) spend2025 += val;

      if (status.includes('SELESAI') || status.includes('LUNAS') || status.includes('PAID')) {
        completedCount++;
      }
      if (status.includes('BATAL') || status.includes('CANCEL')) {
        canceledCount++;
      }
    });

    const completionRate = orders.length > 0 ? Math.round((completedCount / orders.length) * 100) : 0;

    return { spend2026, spend2025, completionRate, canceledCount };
  }, [orders]);

  // Data Grafik YoY
  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const data2025 = new Array(12).fill(0);
    const data2026 = new Array(12).fill(0);

    orders.forEach((o) => {
      const val = parseAmount(o);
      const year = getYear(o.tanggal || o.date);
      const mIdx = getMonthIndex(o.tanggal || o.date);

      if (mIdx !== null && mIdx >= 0 && mIdx < 12) {
        if (year === 2025) data2025[mIdx] += val;
        if (year === 2026) data2026[mIdx] += val;
      }
    });

    const maxVal = Math.max(...data2025, ...data2026, 150_000_000);
    return { months, data2025, data2026, maxVal };
  }, [orders]);

  // Data Rata-Rata per Kategori
  const categoryStats = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const cat = o.kategori || o.category || 'Lainnya';
      const val = parseAmount(o);

      if (!map[cat]) map[cat] = { total: 0, count: 0 };
      map[cat].total += val;
      map[cat].count += 1;
    });

    return Object.keys(map).map((catName) => ({
      name: catName,
      avg: Math.round(map[catName].total / map[catName].count),
      count: map[catName].count
    }));
  }, [orders]);

  // SVG Helper
  const generateSvgPath = (data, width, height, maxScale) => {
    if (!data || data.length === 0) return '';
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 80) + 40;
      const y = height - 30 - (val / maxScale) * (height - 60);
      return { x, y };
    });

    return points.reduce((acc, point, i, a) => {
      if (i === 0) return `M ${point.x},${point.y}`;
      const cpsX = (point.x + a[i - 1].x) / 2;
      return `${acc} C ${cpsX},${a[i - 1].y} ${cpsX},${point.y} ${point.x},${point.y}`;
    }, '');
  };

  return (
    <div className="bg-gray-100 text-gray-800 h-screen overflow-hidden flex flex-col">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0 relative">
        <div className="flex items-center gap-3">
          <div className="relative w-6 h-6 flex items-center">
            <div className="w-4 h-4 bg-red-600 rounded-full absolute left-0 opacity-90"></div>
            <div className="w-4 h-4 bg-gray-600 rounded-full absolute left-2 opacity-80"></div>
          </div>
          <span className="font-bold text-lg text-gray-900">Intern Ladeu</span>
        </div>

        <div className="flex items-center gap-5">
          <button className="text-gray-400 hover:text-red-600 transition-colors text-lg focus:outline-none cursor-pointer">
            <i className="fa-solid fa-magnifying-glass"></i>
          </button>

          <button onClick={() => setHasNotif(false)} className="relative text-gray-400 hover:text-red-600 transition-colors text-lg focus:outline-none mr-2 cursor-pointer">
            <i className="fa-regular fa-bell"></i>
            {hasNotif && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-white"></span>}
          </button>

          <div className="h-6 border-l border-gray-200"></div>

          {/* PROFILE POPUP */}
          <div className="relative" ref={profileRef}>
            <button onClick={() => setShowProfileCard(!showProfileCard)} className="flex items-center gap-2 hover:bg-gray-100 px-2 py-1.5 rounded-lg transition-colors focus:outline-none border border-transparent hover:border-gray-200 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                {profile.name ? profile.name.substring(0, 2) : 'LI'}
              </div>
              <span className="text-sm font-medium text-gray-700">{profile.name}</span>
              <i className={`fa-solid fa-chevron-down text-xs text-gray-400 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
            </button>

            {showProfileCard && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-50">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                  <div className="w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-sm uppercase shrink-0">
                    {profile.name.substring(0, 2)}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{profile.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded">
                      {profile.role}
                    </span>
                  </div>
                </div>

                <div className="pt-2 space-y-1">
                  <button onClick={() => { setShowProfileCard(false); changePage && changePage('settings'); }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-lg flex items-center gap-2.5 font-medium cursor-pointer">
                    <i className="fa-solid fa-user-gear text-gray-400 text-xs"></i> Kelola Profil
                  </button>
                  <button onClick={() => { setShowProfileCard(false); onLogout ? onLogout() : changePage && changePage('login'); }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2.5 font-medium cursor-pointer">
                    <i className="fa-solid fa-arrow-right-from-bracket text-red-500 text-xs"></i> Keluar (Logout)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY CONTENT */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col py-6 shrink-0 z-20">
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => changePage && changePage('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-red-600 text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => changePage && changePage('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-red-600 text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage && changePage('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-red-600 text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage && changePage('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-700 bg-red-50 border-r-4 border-red-600 rounded-l-xl text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage && changePage('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-red-600 text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => changePage && changePage('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-red-600 text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>
          </nav>
        </aside>

        {/* MAIN DISPLAY AREA */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Analisis mendalam ter-update otomatis berdasarkan data PO riil milikmu.</p>
          </div>

          {/* 1. TOP CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total Pengeluaran 2026</p>
              <p className="text-2xl font-black text-gray-900">{formatRupiah(stats.spend2026)}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total Pengeluaran 2025</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-gray-900">{formatRupiah(stats.spend2025)}</p>
                <span className="text-xs text-gray-400 font-medium">Tahun Lalu</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tingkat Penyelesaian PO</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-gray-900">{stats.completionRate}%</p>
                <span className="text-xs text-gray-400 font-medium">Status Selesai</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total PO Dibatalkan</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-gray-900">{stats.canceledCount}</p>
                <span className="text-xs text-gray-400 font-medium">All Time</span>
              </div>
            </div>
          </div>

          {/* 2. YoY CHART */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-sm">Perbandingan Pengeluaran: 2026 vs 2025 (YoY)</h3>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-slate-500"></span> Pengeluaran 2025
                </div>
                <div className="flex items-center gap-1.5 text-red-600">
                  <span className="w-3 h-3 rounded-full bg-red-600"></span> Pengeluaran 2026
                </div>
              </div>
            </div>

            <div className="w-full h-64 relative">
              <svg viewBox="0 0 1000 240" className="w-full h-full overflow-visible">
                {[1, 0.75, 0.5, 0.25, 0].map((val, i) => {
                  const y = 30 + i * 40;
                  return (
                    <g key={i}>
                      <line x1="40" y1={y} x2="960" y2={y} stroke="#F3F4F6" strokeDasharray="4 4" />
                      <text x="30" y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
                        {formatShortRupiah(val * chartData.maxVal)}
                      </text>
                    </g>
                  );
                })}

                <path
                  d={generateSvgPath(chartData.data2025, 1000, 240, chartData.maxVal)}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                />

                <path
                  d={generateSvgPath(chartData.data2026, 1000, 240, chartData.maxVal)}
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="3.5"
                />

                {chartData.months.map((m, idx) => {
                  const x = (idx / 11) * 920 + 40;
                  const val2026 = chartData.data2026[idx];
                  const y2026 = 190 - (val2026 / chartData.maxVal) * 160;

                  return (
                    <g key={idx}>
                      <circle cx={x} cy={y2026} r="5" fill="#FFFFFF" stroke="#DC2626" strokeWidth="3" />
                      {val2026 > 0 && (
                        <text x={x} y={y2026 - 10} textAnchor="middle" className="text-[10px] font-bold fill-gray-800">
                          {formatShortRupiah(val2026)}
                        </text>
                      )}
                      <text x={x} y="222" textAnchor="middle" className="text-[11px] fill-gray-400 font-medium">
                        {m}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* 3. CATEGORY CARDS */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
            <h3 className="font-bold text-gray-900 text-base">Rata-Rata Nilai PO per Kategori</h3>
            <p className="text-xs text-gray-400 mt-0.5">Rata-rata besaran nilai transaksi Purchase Order pada masing-masing kategori</p>

            {categoryStats.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl mt-4">
                Belum ada data
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                {categoryStats.map((item, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{item.name}</span>
                      <p className="text-xl font-bold text-gray-900 mt-1">{formatRupiah(item.avg)}</p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200/60 flex justify-between items-center text-xs text-gray-500">
                      <span>Total Pesanan:</span>
                      <span className="font-bold text-gray-700">{item.count} PO</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}