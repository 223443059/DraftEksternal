import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';

// === KOMPONEN GRAFIK TREN HARGA (SVG Dynamic Chart) ===
function CommodityChart({ history, isDarkMode, unit }) {
  const chartData = [...history].reverse();
  
  if (!chartData || chartData.length === 0) return null;

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  const range = maxPrice - minPrice || 1;
  const padding = range * 0.15;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  const width = 800;
  const height = 280; 
  const margin = { top: 40, right: 30, bottom: 40, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const points = chartData.map((d, index) => {
    const x = margin.left + (index / (chartData.length - 1 || 1)) * chartWidth;
    const y = margin.top + chartHeight - ((d.price - yMin) / (yMax - yMin)) * chartHeight;
    return { x, y, ...d };
  });

  let pathD = points.length > 0 ? `M ${points[0].x} ${points[0].y}` : '';
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const cp1x = p1.x + (p2.x - p1.x) / 2;
    const cp1y = p1.y;
    const cp2x = p1.x + (p2.x - p1.x) / 2;
    const cp2y = p2.y;
    
    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${margin.top + chartHeight} L ${points[0].x} ${margin.top + chartHeight} Z`;

  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + (yMax - yMin) * (i / 4));
  }

  const isDense = points.length > 30;
  const circleRadius = isDense ? 2 : 5; 
  
  const xLabelInterval = Math.ceil(points.length / 6);

  return (
    <div className="w-full flex flex-col">
      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
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
            if (i !== 0 && i !== points.length - 1 && i % xLabelInterval !== 0) return null;
            return (
              <text 
                key={`x-${i}`} 
                x={p.x} 
                y={height - 10} 
                textAnchor="middle" 
                fontSize="11" 
                fontWeight="500"
                fill={isDarkMode ? '#94A3B8' : '#64748B'}
              >
                {p.date}
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
                {p.price}
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

// === DATA BAWAAN ===
const defaultCommodities = {
  crude: {
    name: 'Crude Oil (WTI/Brent)',
    unit: 'USD / Barrel',
    currentPrice: 82.34,
    change: '+0.28%',
    isPositive: true,
    open: 82.11,
    high: 82.50,
    low: 82.02,
    vol: '10.00K',
    description: 'WTI & Brent Crude Oil are used as global oil price benchmarks and for estimating energy, plastics, and logistics costs.',
    history: [
      { date: '10/08/2026', price: 82.34, open: 82.11, high: 82.50, low: 82.02, vol: '10.00K', change: '+0.28%' },
      { date: '08/08/2026', price: 82.11, open: 78.55, high: 82.38, low: 77.80, vol: '1.66K', change: '+4.23%' },
      { date: '08/07/2026', price: 78.78, open: 78.55, high: 79.41, low: 78.35, vol: '-', change: '+0.77%' },
      { date: '08/06/2026', price: 78.18, open: 78.17, high: 78.77, low: 76.53, vol: '241.22K', change: '+1.15%' },
      { date: '08/05/2026', price: 77.29, open: 75.14, high: 78.51, low: 74.57, vol: '246.26K', change: '+2.75%' },
    ]
  },
  nbsk: {
    name: 'NBSK Pulp (Softwood)',
    unit: 'USD / MT',
    currentPrice: 725.00,
    change: '-1.53%',
    isPositive: false,
    open: 736.29,
    high: 737.29,
    low: 723.04,
    vol: '3.73M',
    description: 'Northern Bleached Softwood Kraft (NBSK) is high-quality long-fiber pulp raw material for paper packaging.',
    history: [
      { date: '10/08/2026', price: 725.00, open: 736.29, high: 737.29, low: 723.04, vol: '3.73M', change: '-1.53%' },
      { date: '07/08/2026', price: 736.28, open: 734.98, high: 738.88, low: 732.21, vol: '6.78M', change: '+0.29%' },
      { date: '06/08/2026', price: 734.14, open: 734.12, high: 736.86, low: 731.34, vol: '8.98M', change: '-0.08%' },
      { date: '05/08/2026', price: 734.76, open: 736.19, high: 736.67, low: 733.90, vol: '7.19M', change: '-0.06%' },
      { date: '04/08/2026', price: 735.20, open: 734.51, high: 736.65, low: 732.01, vol: '3.76M', change: '-0.02%' },
    ]
  },
  bhkp: {
    name: 'BHKP Pulp (Hardwood)',
    unit: 'USD / MT',
    currentPrice: 610.00,
    change: '-5.40%',
    isPositive: false,
    open: 643.08,
    high: 644.54,
    low: 607.55,
    vol: '8.23M',
    description: 'Bleached Hardwood Kraft Pulp (BHKP) is short-fiber pulp used for manufacturing various paper and packaging products.',
    history: [
      { date: '10/08/2026', price: 610.00, open: 643.08, high: 644.54, low: 607.55, vol: '8.23M', change: '-5.40%' },
      { date: '07/08/2026', price: 644.80, open: 639.71, high: 646.75, low: 635.96, vol: '2.75M', change: '+0.60%' },
      { date: '06/08/2026', price: 640.93, open: 644.06, high: 646.20, low: 638.09, vol: '6.14M', change: '-0.24%' },
      { date: '05/08/2026', price: 642.44, open: 644.19, high: 647.62, low: 641.34, vol: '1.59M', change: '+0.01%' },
      { date: '04/08/2026', price: 642.35, open: 640.52, high: 645.80, low: 639.12, vol: '5.93M', change: '+0.21%' },
    ]
  },
  recycled: {
    name: 'Recycled Paper',
    unit: 'EUR / MT',
    currentPrice: 129.00,
    change: '-0.14%',
    isPositive: false,
    open: 128.85,
    high: 129.62,
    low: 127.78,
    vol: '3.06M',
    description: 'Recycled paper produced by reprocessing paper and cardboard waste into eco-friendly new products.',
    history: [
      { date: '10/08/2026', price: 129.00, open: 128.85, high: 129.62, low: 127.78, vol: '3.06M', change: '-0.14%' },
      { date: '07/08/2026', price: 129.18, open: 128.89, high: 129.32, low: 128.69, vol: '2.78M', change: '+0.36%' },
      { date: '06/08/2026', price: 128.72, open: 129.48, high: 129.79, low: 127.98, vol: '4.48M', change: '-0.61%' },
      { date: '05/08/2026', price: 129.51, open: 129.21, high: 129.84, low: 128.46, vol: '1.99M', change: '+0.54%' },
      { date: '04/08/2026', price: 128.81, open: 128.24, high: 129.90, low: 127.55, vol: '2.97M', change: '+0.33%' },
    ]
  },
  woodIDN: {
    name: 'Wood (Paper) IDN',
    unit: 'IDR / Share',
    currentPrice: 218.00,
    change: '0.00%',
    isPositive: true,
    open: 218.00,
    high: 222.00,
    low: 214.00,
    vol: '479.70K',
    description: 'Indonesian local timber commodity index for domestic paper industry and manufacturing raw materials.',
    history: [
      { date: '07/08/2026', price: 218.00, open: 218.00, high: 222.00, low: 214.00, vol: '479.70K', change: '0.00%' },
      { date: '06/08/2026', price: 218.00, open: 220.00, high: 222.00, low: 208.00, vol: '6.58M', change: '-0.91%' },
      { date: '05/08/2026', price: 220.00, open: 220.00, high: 228.00, low: 216.00, vol: '4.21M', change: '0.00%' },
      { date: '04/08/2026', price: 220.00, open: 238.00, high: 238.00, low: 220.00, vol: '7.65M', change: '-6.78%' },
      { date: '03/08/2026', price: 236.00, open: 236.00, high: 240.00, vol: '1.97M', low: 230.00, change: '0.00%' },
    ]
  }
};

export default function MarketPrice({ changePage, onLogout }) {
  const { hasPermission, user } = useRole();
  const canManageUsers = hasPermission('manage_users');
  // profile lama dihapus (hardcode) - sekarang pakai `user` dari RoleContext
  const [showProfileCard, setShowProfileCard] = useState(false);
  const profileRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [commodities, setCommodities] = useState(() => {
    const savedData = localStorage.getItem('detpak_commodities');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        console.error("Gagal membaca data dari localStorage", e);
        return defaultCommodities;
      }
    }
    return defaultCommodities;
  });

  useEffect(() => {
    localStorage.setItem('detpak_commodities', JSON.stringify(commodities));
  }, [commodities]);

  const [selectedKey, setSelectedKey] = useState('crude');
  const [timeFilter, setTimeFilter] = useState('All'); 
  const activeItem = commodities[selectedKey];

  // === FUNGSI IMPORT EXCEL (PERBAIKAN HEADER & FORMAT PERSENTASE) ===
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Helper: Pastikan angka bersih dari koma ribuan
    const parseNumber = (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        return parseFloat(val.replace(/,/g, '')) || 0; 
      }
      return 0;
    };

    // Helper: Tangani format persentase (karena excel sering convert persentase ke desimal)
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
      
      // 1. Deteksi Baris Header yang Sebenarnya
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
      let startRow = 0;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase() === 'date' || cell.toLowerCase().includes('price') || cell.toLowerCase() === 'tanggal'))) {
          startRow = i;
          break;
        }
      }

      // 2. Ekstrak data dimulai tepat dari baris header (menghindari baris judul di atasnya)
      const data = XLSX.utils.sheet_to_json(ws, { range: startRow, cellDates: true });
      
      if (data.length > 0) {
        const latest = data[0]; 
        
        // Memfasilitasi header multi-bahasa (Inggris/Indonesia) atau dari sumber yang beda penamaannya
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
        
        // ✅ TAMBAHAN: POST setiap market price ke backend
        data.forEach(row => {
          const changePercent = parseFloat(row.change || row.Change || row['Change %'] || row['Perubahan%']) || 0;
          const recordedDate = row.date || row.Date || row['Tanggal'] || new Date().toISOString().split('T')[0];
          
          saveMarketPriceToBackend({
            item_name: selectedKey,
            price: parseNumber(row.price || row.Price || row['Terakhir']),
            unit: 'USD',
            change_percent: changePercent,
            recorded_date: recordedDate
          });
        });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
  };

  // ✅ TAMBAHAN: Fungsi async untuk POST Market Price ke backend
  const saveMarketPriceToBackend = async (priceData) => {
    try {
      // ✅ Helper: Konversi berbagai format tanggal ke YYYY-MM-DD
      const formatDateToYYYYMMDD = (dateInput) => {
        if (!dateInput) return new Date().toISOString().split('T')[0];
        
        // Jika sudah string YYYY-MM-DD, return as is
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
          return dateInput;
        }
        
        // Jika ISO datetime string (2025-06-30T16:59:48.000Z)
        if (typeof dateInput === 'string' && dateInput.includes('T')) {
          return dateInput.split('T')[0];
        }
        
        // Jika Date object
        if (dateInput instanceof Date) {
          return dateInput.toISOString().split('T')[0];
        }
        
        // Jika string format lain, coba parse
        if (typeof dateInput === 'string') {
          const date = new Date(dateInput);
          if (!isNaN(date)) {
            return date.toISOString().split('T')[0];
          }
        }
        
        // Default: hari ini
        return new Date().toISOString().split('T')[0];
      };

      const response = await fetch('http://localhost:5000/api/market-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item_name: priceData.item_name || 'Unknown',
          price: priceData.price || 0,
          unit: priceData.unit || 'USD',
          change_percent: priceData.change_percent || 0,
          recorded_date: formatDateToYYYYMMDD(priceData.recorded_date)
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error:', errorData);
        return false;
      }

      const result = await response.json();
      console.log('✅ Market Price berhasil disimpan ke database:', result);
      return true;
    } catch (error) {
      console.error('❌ Error saat POST ke backend:', error);
      return false;
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

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

  // === LOGIKA FILTER WAKTU GRAFIK ===
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
      '1W': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
      '6M': 180 * 24 * 60 * 60 * 1000,
      '1Y': 365 * 24 * 60 * 60 * 1000,
    }[timeFilter];

    const cutoffTime = latestTime - filterDuration;
    return history.filter(h => parseDate(h.date) >= cutoffTime);
  };

  const filteredHistory = getFilteredHistory(activeItem.history);

  const handleResetData = () => {
    if (window.confirm("Apakah Anda yakin ingin mereset data kembali ke versi awal (default)? Semua data excel yang telah diupload akan hilang.")) {
      setCommodities(defaultCommodities);
      localStorage.removeItem('detpak_commodities');
    }
  };

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
              <button onClick={() => changePage?.('marketPrice')} className="bg-[#E31837] text-white px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all shadow-xs">Market Price</button>
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
                      {(user?.username || 'AD').slice(0, 2)}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user?.username || '-'}</h4>
                      <p className="text-sm text-gray-400 truncate">{user?.email || '-'}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded">{user?.role || '-'}</span>
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

      {/* BODY SIDEBAR & CONTENT */}
      <div className="flex flex-1 overflow-hidden">
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => changePage && changePage('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => changePage && changePage('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage && changePage('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage && changePage('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage && changePage('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => changePage && changePage('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button onClick={() => changePage && changePage('userManagement')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-400 rounded-xl hover:bg-slate-800/80 hover:text-amber-300 transition-colors text-left cursor-pointer">
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Global Commodity Market Price</h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Real-time benchmark raw material prices for packaging & paper production</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleResetData}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}
              >
                <i className="fa-solid fa-rotate-left"></i> Reset
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
            </div>
          </div>

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
                    <span className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.currentPrice.toLocaleString('en-US')}</span>
                    <span className={`text-xs font-semibold ${item.isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                      {item.change}
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
                <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{activeItem.name}</h2>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{activeItem.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>
                  {activeItem.currentPrice.toLocaleString('en-US')} <span className={`text-xs font-normal ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{activeItem.unit}</span>
                </span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${activeItem.isPositive ? (isDarkMode ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-emerald-100 text-emerald-700') : (isDarkMode ? 'bg-red-950/80 text-red-400 border border-red-800' : 'bg-red-100 text-red-700')}`}>
                  {activeItem.change}
                </span>
              </div>
            </div>

            <div className="pt-2 pb-4">
              <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Price Movement Trend</h3>
                
                <div className="flex items-center gap-1.5 p-1 rounded-lg border shadow-sm select-none" style={{ backgroundColor: isDarkMode ? '#0F172A' : '#F3F4F6', borderColor: isDarkMode ? '#334155' : '#E5E7EB' }}>
                  {['1W', '1M', '6M', '1Y', 'All'].map(filterOption => (
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
                      {filterOption === '1W' ? '1 Week' : filterOption === '1M' ? '1 Month' : filterOption === '6M' ? '6 Months' : filterOption === '1Y' ? '1 Year' : 'All'}
                    </button>
                  ))}
                </div>
              </div>
              <CommodityChart history={filteredHistory} isDarkMode={isDarkMode} unit={activeItem.unit} />
            </div>

            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
              <div>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Open Price</span>
                <span className={`text-base font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{activeItem.open}</span>
              </div>
              <div>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>High Price</span>
                <span className="text-base font-semibold text-emerald-500">{activeItem.high}</span>
              </div>
              <div>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Low Price</span>
                <span className="text-base font-semibold text-red-500">{activeItem.low}</span>
              </div>
              <div>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Trading Volume</span>
                <span className={`text-base font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{activeItem.vol}</span>
              </div>
            </div>
          </div>

          <div className={`border rounded-2xl shadow-xs overflow-hidden pb-6 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Commodity Price History</h3>
              <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Data Source: Market Feed (August 2026)</span>
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
                  {filteredHistory.map((row, idx) => (
                    <tr key={idx} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                      <td className={`px-6 py-3.5 font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-900'}`}>{row.date}</td>
                      <td className={`px-6 py-3.5 font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>{row.price}</td>
                      <td className={`px-6 py-3.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>{row.open}</td>
                      <td className="px-6 py-3.5 text-emerald-500 font-medium">{row.high}</td>
                      <td className="px-6 py-3.5 text-red-500 font-medium">{row.low}</td>
                      <td className={`px-6 py-3.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>{row.vol}</td>
                      <td className={`px-6 py-3.5 font-semibold ${row.change && row.change.startsWith('+') ? 'text-emerald-500' : row.change && row.change.startsWith('-') ? 'text-red-500' : isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        {row.change}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}