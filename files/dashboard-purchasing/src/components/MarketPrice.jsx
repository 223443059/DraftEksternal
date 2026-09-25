import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';
import AppLayout from './AppLayout'; // Sesuaikan path import jika berbeda

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

// === KOMPONEN GRAFIK TREN HARGA (SVG Dynamic Chart) ===
function CommodityChart({ history, isDarkMode, unit }) {
  const chartData = history ? [...history].reverse() : [];
  
  if (!chartData || chartData.length === 0) {
    return (
      <div className="w-full h-[280px] flex flex-col items-center justify-center border-2 border-dashed rounded-xl" style={{ borderColor: isDarkMode ? '#334155' : '#E2E8F0' }}>
        <i className={`fa-solid fa-chart-area text-4xl mb-3 ${isDarkMode ? 'text-slate-600' : 'text-gray-300'}`}></i>
        <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Grafik kosong. Silakan Import Excel untuk melihat tren data.</p>
      </div>
    );
  }

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  const range = maxPrice - minPrice || 1;
  const padding = range * 0.15;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  const width = 800;
  const height = 320;
  const margin = { top: 40, right: 30, bottom: 70, left: 60 };
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

  // Ambil label tanggal secara merata by index (bukan modulo) supaya tidak bertindihan,
  // lalu ditampilkan miring supaya tetap muat walau jaraknya rapat.
  const maxLabels = Math.min(points.length, isDense ? 8 : 6);
  const labelIndexSet = new Set();
  for (let i = 0; i < maxLabels; i++) {
    const idx = Math.round((i / (maxLabels - 1 || 1)) * (points.length - 1));
    labelIndexSet.add(idx);
  }

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
                {formatDisplayDate(p.date)}
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
  
  // Endpoint API 
  const API_URL = 'http://idws-n26010:5000/api/market-prices';
  
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

  // FETCH DATA DARI BACKEND SAAT KOMPONEN DIMUAT
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch(API_URL);
        if (response.ok) {
          const dbData = await response.json();
          
          if (Array.isArray(dbData) && dbData.length > 0) {
            let updatedCommodities = JSON.parse(JSON.stringify(emptyCommodities));
            
            dbData.forEach(row => {
              const key = row.item_name;
              if (updatedCommodities[key]) {
                const changeStr = row.change_percent ? (row.change_percent > 0 ? `+${row.change_percent}%` : `${row.change_percent}%`) : '0.00%';
                
                updatedCommodities[key].history.push({
                  date: row.recorded_date,
                  price: row.price,
                  open: row.open || 0,
                  high: row.high || 0,
                  low: row.low || 0,
                  vol: row.vol || '0',
                  change: changeStr
                });

                updatedCommodities[key].currentPrice = row.price;
                updatedCommodities[key].change = changeStr;
                updatedCommodities[key].isPositive = parseFloat(row.change_percent) >= 0;
                if(row.open) updatedCommodities[key].open = row.open;
                if(row.high) updatedCommodities[key].high = row.high;
                if(row.low) updatedCommodities[key].low = row.low;
                if(row.vol) updatedCommodities[key].vol = row.vol;
              }
            });
            setCommodities(updatedCommodities);
          } else if (dbData && dbData.crude && dbData.crude.history) {
            setCommodities(dbData);
          }
        }
      } catch (error) {
        console.error("Gagal mengambil data dari API:", error);
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

  const saveMarketPriceToBackend = async (priceData) => {
    try {
      const formatDateToYYYYMMDD = (dateInput) => {
        if (!dateInput) return new Date().toISOString().split('T')[0];
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
        if (typeof dateInput === 'string' && dateInput.includes('T')) return dateInput.split('T')[0];
        if (dateInput instanceof Date) return dateInput.toISOString().split('T')[0];
        if (typeof dateInput === 'string') {
          const date = new Date(dateInput);
          if (!isNaN(date)) return date.toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0];
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: priceData.item_name || 'Unknown',
          price: priceData.price || 0,
          unit: priceData.unit || 'USD',
          change_percent: priceData.change_percent || 0,
          recorded_date: formatDateToYYYYMMDD(priceData.recorded_date)
        })
      });

      if (!response.ok) return false;
      return true;
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
      '1W': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
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
      await fetch(API_URL, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error("Gagal menghapus data di API:", error);
    }
    
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
                {activeItem?.currentPrice === 0 ? '0' : activeItem?.currentPrice.toLocaleString('en-US')} <span className={`text-xs font-normal ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{activeItem?.unit}</span>
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
              <span className={`text-base font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{activeItem?.vol || '-'}</span>
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