import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';
import AppLayout from './AppLayout'; // Sesuaikan path import jika berbeda
import API_BASE_URL from '../utils/api.config';

// Format tanggal untuk ditampilkan: menerima "DD/MM/YYYY", ISO datetime ("...T17:00:00.000Z"),
// atau format lain, lalu dikembalikan dalam bentuk singkat "28 Jun 25" supaya tidak
// bertindihan di axis chart maupun kepanjangan di tabel.
const formatDisplayDate = (dateInput) => {
  if (!dateInput) return '-';
  let d;
  if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
    const [day, month, year] = dateInput.split('/');
    d = new Date(`${year}-${month}-${day}`);
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

// Format bulan & tahun untuk sumbu X grafik, contoh: "Feb 26"
const formatMonthYear = (dateInput) => {
  if (!dateInput) return '-';
  let d;
  if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
    const [day, month, year] = dateInput.split('/');
    d = new Date(`${year}-${month}-${day}`);
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

// Kurva halus "monotone cubic" (Fritsch-Carlson): melewati semua titik tanpa melonjak
// melewati nilai tertinggi/terendah, jadi hasilnya alami seperti grafik harga pada umumnya.
const buildSmoothPath = (pts) => {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;

  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }

  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const tau = 3 / Math.sqrt(sum);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i].x + h} ${pts[i].y + t[i] * h}, ${pts[i + 1].x - h} ${pts[i + 1].y - t[i + 1] * h}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
};

// === KOMPONEN GRAFIK TREN HARGA (SVG Dynamic Chart) ===
function CommodityChart({ history, isDarkMode, unit }) {
  // Ukur lebar kontainer dalam piksel CSS. Grafik digambar 1:1 dengan lebar itu (tinggi tetap),
  // jadi saat browser di-zoom (Ctrl +/-) teks & titik ikut membesar/mengecil seperti elemen lain,
  // bukan ikut "melar" mengikuti lebar layar.
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [Boolean(history && history.length)]);

  const chartData = history ? [...history].reverse() : [];
  
  if (!chartData || chartData.length === 0) {
    return (
      <div className="w-full h-[280px] flex flex-col items-center justify-center border-2 border-dashed rounded-xl" style={{ borderColor: isDarkMode ? '#334155' : '#E2E8F0' }}>
        <i className={`fa-solid fa-chart-area text-4xl mb-3 ${isDarkMode ? 'text-slate-600' : 'text-gray-300'}`}></i>
        <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Grafik kosong. Silakan Import Excel untuk melihat tren data.</p>
      </div>
    );
  }

  // Satu titik per bulan = rata-rata harga bulan itu (data diurutkan lama -> baru).
  const monthlyData = [];
  const monthIndex = {};
  chartData.forEach((d) => {
    const t = dateValue(d.date);
    const key = t ? `${new Date(t).getFullYear()}-${new Date(t).getMonth()}` : String(d.date);
    if (monthIndex[key] === undefined) {
      monthIndex[key] = monthlyData.length;
      monthlyData.push({ date: d.date, sum: 0, count: 0 });
    }
    const bucket = monthlyData[monthIndex[key]];
    bucket.sum += Number(d.price) || 0;
    bucket.count += 1;
  });
  const monthlyPoints = monthlyData.map((b) => ({ date: b.date, price: b.sum / b.count }));

  const prices = monthlyPoints.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  const range = maxPrice - minPrice || 1;
  const padding = range * 0.15;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  const width = Math.max(containerWidth || 800, 320);
  const height = 320;
  const margin = { top: 40, right: 30, bottom: 70, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const points = monthlyPoints.map((d, index) => {
    const x = margin.left + (index / (monthlyPoints.length - 1 || 1)) * chartWidth;
    const y = margin.top + chartHeight - ((d.price - yMin) / (yMax - yMin)) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = buildSmoothPath(points);

  const areaD = `${pathD} L ${points[points.length - 1].x} ${margin.top + chartHeight} L ${points[0].x} ${margin.top + chartHeight} Z`;

  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + (yMax - yMin) * (i / 4));
  }

  // Padat = jarak antar titik kurang dari ~8px (bukan lagi sekadar jumlah titik)
  const isDense = chartWidth / Math.max(points.length - 1, 1) < 8;
  const circleRadius = isDense ? 2 : 5;

  // Label sumbu X = bulan & tahun saja ("Feb 26"). Diambil dari titik pertama tiap bulan,
  // lalu dijarangkan merata kalau terlalu banyak untuk lebar grafik.
  const monthKey = (d) => {
    const t = dateValue(d);
    if (!t) return String(d);
    const dt = new Date(t);
    return `${dt.getFullYear()}-${dt.getMonth()}`;
  };
  const firstOfMonth = [];
  points.forEach((p, i) => {
    if (i === 0 || monthKey(p.date) !== monthKey(points[i - 1].date)) firstOfMonth.push(i);
  });
  const maxLabels = Math.max(2, Math.floor(chartWidth / 70));
  const labelIndexSet = new Set();
  if (firstOfMonth.length <= maxLabels) {
    firstOfMonth.forEach((i) => labelIndexSet.add(i));
  } else {
    for (let k = 0; k < maxLabels; k++) {
      const pos = Math.round((k / (maxLabels - 1)) * (firstOfMonth.length - 1));
      labelIndexSet.add(firstOfMonth[pos]);
    }
  }

  return (
    <div className="w-full flex flex-col">
      <div ref={containerRef} className="relative w-full overflow-hidden">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E31837" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#E31837" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick, i) => {
            const yPos = margin.top + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
            return (
              <g key={`y-${i}`}>
                <line 
                  x1={margin.left} 
                  y1={yPos} 
                  x2={width - margin.right} 
                  y2={yPos} 
                  stroke={isDarkMode ? '#334155' : '#E2E8F0'} 
                  strokeWidth="1" 
                  strokeDasharray="4 4" 
                />
                <text 
                  x={margin.left - 15} 
                  y={yPos + 4} 
                  textAnchor="end" 
                  fontSize="11" 
                  fontWeight="500"
                  fill={isDarkMode ? '#94A3B8' : '#64748B'}
                >
                  {tick.toFixed(2)}
                </text>
              </g>
            );
          })}

          {points.map((p, i) => {
            if (!labelIndexSet.has(i)) return null;
            const labelY = margin.top + chartHeight + 22;
            return (
              <text
                key={`x-${i}`}
                x={p.x}
                y={labelY}
                textAnchor="end"
                fontSize="10"
                fontWeight="500"
                fill={isDarkMode ? '#94A3B8' : '#64748B'}
                transform={`rotate(-35, ${p.x}, ${labelY})`}
              >
                {formatMonthYear(p.date)}
              </text>
            );
          })}

          <path d={areaD} fill="url(#chartGradient)" />
          <path d={pathD} fill="none" stroke="#E31837" strokeWidth={isDense ? "1.5" : "3"} strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) => (
            <g key={i} className="group cursor-pointer">
              <text 
                x={p.x} 
                y={p.y - 12} 
                textAnchor="middle" 
                fontSize="11" 
                fontWeight="bold" 
                fill={isDarkMode ? '#F8FAFC' : '#1E293B'} 
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {Number(p.price).toFixed(2)}
              </text>
              <circle
                cx={p.x}
                cy={p.y}
                r={circleRadius}
                className="fill-[#E31837] stroke-transparent transition-all duration-200 group-hover:scale-[2]"
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// === KONFIGURASI API ===
// Alamat server diambil dari api.config (sama seperti halaman Analytics), jadi kalau alamat
// backend berubah cukup ubah di satu tempat. Rute Market Price memakai bentuk jamak
// "/api/market-prices" (sesuai backend yang sudah dipakai sebelumnya).
// Rute dicoba berurutan: jamak dulu, lalu tunggal (sesuai entri MARKET_PRICE di api.config).
// Rute yang tidak menghasilkan 404 dipakai untuk semua permintaan berikutnya (GET/POST/DELETE).
const MARKET_PRICES_PATHS = ['/api/market-prices', '/api/market-price'];

// fetch dengan batas waktu, supaya tidak menggantung selamanya kalau server tidak terjangkau
const fetchWithTimeout = async (url, options = {}, ms = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Ubah tanggal jadi "YYYY-MM-DD" berdasarkan zona waktu LOKAL.
// (toISOString() memakai UTC sehingga tanggal bisa mundur 1 hari di WIB.)
const toLocalYMD = (dateInput) => {
  const pad = (n) => String(n).padStart(2, '0');
  const fromDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => fromDate(new Date());

  if (!dateInput) return today();
  if (dateInput instanceof Date) return isNaN(dateInput) ? today() : fromDate(dateInput);
  if (typeof dateInput === 'number') {
    return fromDate(new Date(Math.round((dateInput - 25569) * 86400 * 1000)));
  }
  if (typeof dateInput === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
      const [dd, mm, yyyy] = dateInput.split('/');
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(dateInput);
    if (!isNaN(d)) return fromDate(d);
  }
  return today();
};

// Ubah nilai "change" dari Excel (0.0123 atau "1.23%") menjadi angka persen (1.23).
const toPercentNumber = (val) => {
  if (typeof val === 'number') return parseFloat((val * 100).toFixed(2));
  if (typeof val === 'string') return parseFloat(val.replace('%', '').replace(/,/g, '')) || 0;
  return 0;
};

// Tanggal urutan terbaru -> terlama (history di UI diasumsikan terbaru di index 0)
const dateValue = (d) => {
  if (!d) return 0;
  if (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split('/');
    return new Date(`${yyyy}-${mm}-${dd}`).getTime();
  }
  const t = new Date(d).getTime();
  return isNaN(t) ? 0 : t;
};

// === TEMPLATE KOSONG ===
const emptyCommodities = {
  crude: {
    name: 'Crude Oil (WTI/Brent)',
    unit: 'USD / Barrel',
    currentPrice: 0,
    change: '0.00%',
    isPositive: true,
    open: 0,
    high: 0,
    low: 0,
    vol: '0',
    description: 'WTI & Brent Crude Oil are used as global oil price benchmarks and for estimating energy, plastics, and logistics costs.',
    history: []
  },
  nbsk: {
    name: 'NBSK Pulp (Softwood)',
    unit: 'USD / MT',
    currentPrice: 0,
    change: '0.00%',
    isPositive: true,
    open: 0,
    high: 0,
    low: 0,
    vol: '0',
    description: 'Northern Bleached Softwood Kraft (NBSK) is high-quality long-fiber pulp raw material for paper packaging.',
    history: []
  },
  bhkp: {
    name: 'BHKP Pulp (Hardwood)',
    unit: 'USD / MT',
    currentPrice: 0,
    change: '0.00%',
    isPositive: true,
    open: 0,
    high: 0,
    low: 0,
    vol: '0',
    description: 'Bleached Hardwood Kraft Pulp (BHKP) is short-fiber pulp used for manufacturing various paper and packaging products.',
    history: []
  },
  recycled: {
    name: 'Recycled Paper',
    unit: 'EUR / MT',
    currentPrice: 0,
    change: '0.00%',
    isPositive: true,
    open: 0,
    high: 0,
    low: 0,
    vol: '0',
    description: 'Recycled paper produced by reprocessing paper and cardboard waste into eco-friendly new products.',
    history: []
  },
  woodIDN: {
    name: 'Wood (Paper) IDN',
    unit: 'IDR / Share',
    currentPrice: 0,
    change: '0.00%',
    isPositive: true,
    open: 0,
    high: 0,
    low: 0,
    vol: '0',
    description: 'Indonesian local timber commodity index for domestic paper industry and manufacturing raw materials.',
    history: []
  }
};

export default function MarketPrice({ changePage, onLogout, activePage = 'marketPrice' }) {  
  const { user } = useRole();
  const isAdmin = user?.role_id === 1;
  
  // Endpoint API (dari api.config)
  const apiUrlRef = useRef(null);
  const getApiUrl = () => apiUrlRef.current || `${API_BASE_URL}${MARKET_PRICES_PATHS[0]}`;
  
  // === UI & PROFILE STATE ===
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : false;
  });

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);  

  const [showResetModal, setShowResetModal] = useState(false);
  const [commodities, setCommodities] = useState(emptyCommodities);
  const [loadError, setLoadError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');

  // FETCH DATA DARI BACKEND SAAT KOMPONEN DIMUAT
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        let response = null;
        for (const path of MARKET_PRICES_PATHS) {
          const url = `${API_BASE_URL}${path}`;
          response = await fetchWithTimeout(url);
          if (response.status !== 404) {
            apiUrlRef.current = url;
            break;
          }
        }
        if (!response.ok) {
          setLoadError(
            response.status === 404
              ? `Rute data harga tidak ditemukan di server (404). Sudah dicoba: ${MARKET_PRICES_PATHS.map(p => API_BASE_URL + p).join(' dan ')}. Pastikan rutenya ada di backend dan backend sudah di-restart.`
              : `Server merespons dengan status ${response.status}.`
          );
          return;
        }
        setLoadError('');
        {
          const dbData = await response.json();
          
          if (Array.isArray(dbData) && dbData.length > 0) {
            let updatedCommodities = JSON.parse(JSON.stringify(emptyCommodities));
            
            // Urutkan terbaru -> terlama supaya history[0] selalu data terbaru
            // (grafik & harga terkini bergantung pada urutan ini).
            const sortedRows = [...dbData].sort((a, b) => dateValue(b.recorded_date) - dateValue(a.recorded_date));
            
            sortedRows.forEach(row => {
              const key = row.item_name;
              const item = updatedCommodities[key];
              if (!item) return;

              const pct = parseFloat(row.change_percent) || 0;
              const changeStr = pct === 0 ? '0.00%' : pct > 0 ? `+${pct}%` : `${pct}%`;

              // Baris pertama per komoditas = data terbaru -> jadi harga terkini.
              const isLatest = item.history.length === 0;

              item.history.push({
                date: row.recorded_date,
                price: Number(row.price) || 0,
                open: Number(row.open) || 0,
                high: Number(row.high) || 0,
                low: Number(row.low) || 0,
                vol: row.vol || '0',
                change: changeStr
              });

              if (isLatest) {
                item.currentPrice = Number(row.price) || 0;
                item.change = changeStr;
                item.isPositive = pct >= 0;
                item.open = Number(row.open) || 0;
                item.high = Number(row.high) || 0;
                item.low = Number(row.low) || 0;
                item.vol = row.vol || '0';
              }
            });
            setCommodities(updatedCommodities);
          } else if (dbData && dbData.crude && dbData.crude.history) {
            setCommodities(dbData);
          }
        }
      } catch (error) {
        console.error("Gagal mengambil data dari API:", error);
        setLoadError(`Tidak bisa terhubung ke server data (${API_BASE_URL}). Pastikan backend menyala dan bisa diakses dari laptop ini.`);
      }
    };
    
    fetchMarketData();
  }, []);

  const [selectedKey, setSelectedKey] = useState('crude');
  const [timeFilter, setTimeFilter] = useState('All'); 
  const activeItem = commodities[selectedKey];

  const handleFileUpload = (e) => {
    if (!isAdmin) return;
    const file = e.target.files[0];
    if (!file) return;

    const parseNumber = (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        return parseFloat(val.replace(/,/g, '')) || 0; 
      }
      return 0;
    };

    const formatChange = (val) => {
      if (typeof val === 'number') {
        const percentage = (val * 100).toFixed(2);
        return percentage > 0 ? `+${percentage}%` : `${percentage}%`;
      }
      if (typeof val === 'string') return val;
      return '0.00%';
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
      let startRow = 0;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase() === 'date' || cell.toLowerCase().includes('price') || cell.toLowerCase() === 'tanggal'))) {
          startRow = i;
          break;
        }
      }

      const data = XLSX.utils.sheet_to_json(ws, { range: startRow, cellDates: true });
      
      if (data.length > 0) {
        const latest = data[0]; 
        
        setCommodities(prev => ({
          ...prev,
          [selectedKey]: {
            ...prev[selectedKey],
            currentPrice: parseNumber(latest.price || latest.Price || latest['Terakhir'] || latest['Terakhir'] || prev[selectedKey].currentPrice),
            open: parseNumber(latest.open || latest.Open || latest['Pembukaan'] || prev[selectedKey].open),
            high: parseNumber(latest.high || latest.High || latest['Tertinggi'] || prev[selectedKey].high),
            low: parseNumber(latest.low || latest.Low || latest['Terendah'] || prev[selectedKey].low),
            vol: latest.vol || latest.Volume || latest['Vol.'] || prev[selectedKey].vol,
            change: formatChange(latest.change || latest.Change || latest['Change %'] || latest['Perubahan%'] || prev[selectedKey].change),
            
            history: data.map(row => {
              let parsedDate = row.date || row.Date || row['Tanggal'];
              
              if (parsedDate instanceof Date) {
                parsedDate = `${parsedDate.getDate().toString().padStart(2, '0')}/${(parsedDate.getMonth() + 1).toString().padStart(2, '0')}/${parsedDate.getFullYear()}`;
              } else if (typeof parsedDate === 'number') {
                 const d = new Date(Math.round((parsedDate - 25569) * 86400 * 1000));
                 parsedDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
              }

              return {
                date: parsedDate,
                price: parseNumber(row.price || row.Price || row['Terakhir']),
                open: parseNumber(row.open || row.Open || row['Pembukaan']),
                high: parseNumber(row.high || row.High || row['Tertinggi']),
                low: parseNumber(row.low || row.Low || row['Terendah']),
                vol: row.vol || row.Volume || row['Vol.'],
                change: formatChange(row.change || row.Change || row['Change %'] || row['Perubahan%'])
              };
            })
          }
        }));
        
        // Simpan SEMUA baris ke backend supaya laptop lain juga melihat data yang sama.
        const targetKey = selectedKey;
        const rowsToSave = data.map(row => ({
          item_name: targetKey,
          price: parseNumber(row.price || row.Price || row['Terakhir']),
          open: parseNumber(row.open || row.Open || row['Pembukaan']),
          high: parseNumber(row.high || row.High || row['Tertinggi']),
          low: parseNumber(row.low || row.Low || row['Terendah']),
          vol: String(row.vol || row.Volume || row['Vol.'] || '0'),
          unit: 'USD',
          change_percent: toPercentNumber(row.change || row.Change || row['Change %'] || row['Perubahan%']),
          recorded_date: toLocalYMD(row.date || row.Date || row['Tanggal'])
        }));

        (async () => {
          setUploadStatus(`Menyimpan ${rowsToSave.length} baris ke server...`);
          let failed = 0;
          const batchSize = 10;
          for (let i = 0; i < rowsToSave.length; i += batchSize) {
            const results = await Promise.all(
              rowsToSave.slice(i, i + batchSize).map(r => saveMarketPriceToBackend(r))
            );
            failed += results.filter(ok => !ok).length;
          }
          setUploadStatus(
            failed === 0
              ? `Berhasil menyimpan ${rowsToSave.length} baris ke server.`
              : `${failed} dari ${rowsToSave.length} baris gagal disimpan ke server. Data hanya terlihat di laptop ini sampai penyimpanan berhasil.`
          );
        })();
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
  };

  const saveMarketPriceToBackend = async (priceData) => {
    try {
      const response = await fetchWithTimeout(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: priceData.item_name || 'Unknown',
          price: priceData.price || 0,
          open: priceData.open || 0,
          high: priceData.high || 0,
          low: priceData.low || 0,
          vol: priceData.vol || '0',
          unit: priceData.unit || 'USD',
          change_percent: priceData.change_percent || 0,
          recorded_date: toLocalYMD(priceData.recorded_date)
        })
      });
      return response.ok;
    } catch (error) {
      console.error('❌ Error saat POST ke backend:', error);
      return false;
    }
  };

  const getFilteredHistory = (history) => {
    if (timeFilter === 'All') return history;
    if (!history || history.length === 0) return history;

    const parseDate = (dStr) => {
      if (!dStr) return 0;
      const parts = dStr.split('/');
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
      return new Date(dStr).getTime();
    };

    const latestTime = Math.max(...history.map(h => parseDate(h.date)));
    
    const filterDuration = {
      '6M': 180 * 24 * 60 * 60 * 1000,
      '1Y': 365 * 24 * 60 * 60 * 1000,
    }[timeFilter];

    const cutoffTime = latestTime - filterDuration;
    return history.filter(h => parseDate(h.date) >= cutoffTime);
  };

  const filteredHistory = getFilteredHistory(activeItem?.history || []);

  const handleResetDataClick = () => {
    if (!isAdmin) return;
    setShowResetModal(true);
  };

  const confirmResetData = async () => {
    try {
      const response = await fetchWithTimeout(getApiUrl(), { method: 'DELETE' });
      if (!response.ok) {
        setShowResetModal(false);
        setLoadError(`Gagal menghapus data di server (status ${response.status}). Data belum dihapus.`);
        return;
      }
    } catch (error) {
      console.error("Gagal menghapus data di API:", error);
      setShowResetModal(false);
      setLoadError('Gagal menghapus data: server tidak terjangkau. Data belum dihapus.');
      return;
    }

    setLoadError('');
    setUploadStatus('');
    setCommodities(emptyCommodities);
    setShowResetModal(false);
  };

  return (
    <AppLayout
      activePage={activePage}
      changePage={changePage}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Global Commodity Market Price</h1>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Real-time benchmark raw material prices for packaging & paper production</p>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <>
                <button 
                  onClick={handleResetDataClick}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}
                >
                  <i className="fa-solid fa-trash-can"></i> Reset
                </button>

                <label className="cursor-pointer bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-md flex items-center gap-2">
                  <i className="fa-solid fa-file-excel"></i> Import Excel
                  <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>

        {loadError && (
          <div className={`px-4 py-3 rounded-lg text-sm border ${isDarkMode ? 'bg-red-950/60 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {loadError}
          </div>
        )}
        {uploadStatus && (
          <div className={`px-4 py-3 rounded-lg text-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
            {uploadStatus}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.keys(commodities).map((key) => {
            const item = commodities[key];
            const isSelected = selectedKey === key;
            return (
              <div
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`p-4 border rounded-xl shadow-xs cursor-pointer transition-all ${
                  isSelected 
                    ? isDarkMode ? 'border-red-500 ring-2 ring-red-500/20 bg-slate-800' : 'border-[#004797] ring-2 ring-[#004797]/20 bg-blue-50/20' 
                    : isDarkMode ? 'bg-[#1E293B] border-slate-800 hover:border-slate-700' : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className={`text-xs font-semibold truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{item.name}</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {item.currentPrice === 0 ? '-' : item.currentPrice.toLocaleString('en-US')}
                  </span>
                  <span className={`text-xs font-semibold ${item.currentPrice === 0 ? 'text-gray-500' : item.isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {item.change === '0.00%' && item.currentPrice === 0 ? '-' : item.change}
                  </span>
                </div>
                <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{item.unit}</p>
              </div>
            );
          })}
        </div>

        <div className={`p-6 border rounded-2xl shadow-xs space-y-6 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4 ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <div>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{activeItem?.name}</h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{activeItem?.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>
                {!activeItem?.currentPrice ? '-' : activeItem.currentPrice.toLocaleString('en-US')} <span className={`text-xs font-normal ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{activeItem?.unit}</span>
              </span>
              {activeItem?.currentPrice !== 0 && (
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${activeItem?.isPositive ? (isDarkMode ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-emerald-100 text-emerald-700') : (isDarkMode ? 'bg-red-950/80 text-red-400 border border-red-800' : 'bg-red-100 text-red-700')}`}>
                  {activeItem?.change}
                </span>
              )}
            </div>
          </div>

          <div className="pt-2 pb-4">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
              <h3 className={`text-sm font-bold ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Price Movement Trend</h3>
              
              <div className="flex items-center gap-1.5 p-1 rounded-lg border shadow-sm select-none" style={{ backgroundColor: isDarkMode ? '#0F172A' : '#F3F4F6', borderColor: isDarkMode ? '#334155' : '#E5E7EB' }}>
                {['6M', '1Y', 'All'].map(filterOption => (
                  <button 
                    key={filterOption}
                    onClick={() => setTimeFilter(filterOption)}
                    className={`px-3.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      timeFilter === filterOption 
                        ? 'bg-[#E31837] text-white shadow-md' 
                        : isDarkMode 
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' 
                          : 'text-gray-500 hover:text-gray-800 hover:bg-white'
                    }`}
                  >
                    {filterOption === '6M' ? '6 Months' : filterOption === '1Y' ? '1 Year' : 'All'}
                  </button>
                ))}
              </div>
            </div>
            <CommodityChart history={filteredHistory} isDarkMode={isDarkMode} unit={activeItem?.unit} />
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
            <div>
              <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Open Price</span>
              <span className={`text-base font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{activeItem?.open || '-'}</span>
            </div>
            <div>
              <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>High Price</span>
              <span className="text-base font-semibold text-emerald-500">{activeItem?.high || '-'}</span>
            </div>
            <div>
              <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Low Price</span>
              <span className="text-base font-semibold text-red-500">{activeItem?.low || '-'}</span>
            </div>
            <div>
              <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Trading Volume</span>
              <span className={`text-base font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{activeItem?.vol && activeItem.vol !== '0' ? activeItem.vol : '-'}</span>
            </div>
          </div>
        </div>

        <div className={`border rounded-2xl shadow-xs overflow-hidden pb-6 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`px-6 py-4 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Commodity Price History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className={`text-xs font-semibold uppercase border-b ${isDarkMode ? 'bg-[#0F172A] border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Last Price</th>
                  <th className="px-6 py-3">Open</th>
                  <th className="px-6 py-3">High</th>
                  <th className="px-6 py-3">Low</th>
                  <th className="px-6 py-3">Volume</th>
                  <th className="px-6 py-3">Change %</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-200 text-gray-700'}`}>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan="7" className={`px-6 py-10 text-center font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      <i className="fa-solid fa-folder-open text-3xl mb-3 block"></i>
                      Belum ada data histori. Silakan klik tombol "Import Excel" di atas.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((row, idx) => (
                    <tr key={idx} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                      <td className={`px-6 py-3.5 font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-900'}`}>{formatDisplayDate(row.date)}</td>
                      <td className={`px-6 py-3.5 font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>{row.price}</td>
                      <td className={`px-6 py-3.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>{row.open}</td>
                      <td className="px-6 py-3.5 text-emerald-500 font-medium">{row.high}</td>
                      <td className="px-6 py-3.5 text-red-500 font-medium">{row.low}</td>
                      <td className={`px-6 py-3.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>{row.vol}</td>
                      <td className={`px-6 py-3.5 font-semibold ${row.change && row.change.startsWith('+') ? 'text-emerald-500' : row.change && row.change.startsWith('-') ? 'text-red-500' : isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        {row.change}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* POPUP KONFIRMASI RESET */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl animate-fade-in-up ${isDarkMode ? 'bg-[#1E293B] border border-slate-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-red-500/20' : 'bg-red-100'}`}>
                <i className="fa-solid fa-triangle-exclamation text-2xl text-red-500"></i>
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Konfirmasi Hapus Data</h3>
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                Apakah Anda yakin ingin <span className="font-bold text-red-500">MENGHAPUS SEMUA DATA</span>? Layar dan grafik akan dikosongkan secara permanen.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button 
                  onClick={() => setShowResetModal(false)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isDarkMode ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Batal
                </button>
                <button 
                  onClick={confirmResetData}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}