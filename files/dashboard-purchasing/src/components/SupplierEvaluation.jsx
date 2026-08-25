import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

export default function SupplierEvaluation({ changePage, onLogout }) {
  // === STATE MANAGEMENT UNTUK HEADER & MODE ===
  const [profile] = useState({ name: 'Admin', email: 'admin@detpak.com', role: 'Administrator' });
  const [showProfileCard, setShowProfileCard] = useState(false);
  const profileRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // State Dark/Light Mode
  const [isDarkMode, setIsDarkMode] = useState(true);

  // === STATE UNTUK DATA EXCEL (PERSISTENT VIA LOCALSTORAGE) ===
  const defaultKpi = {
    total: 0,
    avgScore: '0.00',
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    topSupplier: '-',
    topScore: '0.00',
    criteriaStats: [],
    pieData: [],
    topSupplierRadarData: []
  };

  const [supplierData, setSupplierData] = useState(() => {
    const saved = localStorage.getItem('supplierData');
    return saved ? JSON.parse(saved) : [];
  });

  const [kpi, setKpi] = useState(() => {
    const saved = localStorage.getItem('kpiData');
    return saved ? JSON.parse(saved) : defaultKpi;
  });

  // Effect untuk menjalankan Real-time Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  // Handler klik luar popover profil
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

  // === HANDLER IMPORT EXCEL ===
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const wsname = wb.SheetNames[0]; 
      const ws = wb.Sheets[wsname];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      
      processImportedData(jsonData);
    };
    reader.readAsArrayBuffer(file);
  };

  const processImportedData = (data) => {
    const validData = data.filter(row => row['Supplier Name'] && row['Weighted Score (/5)'] !== undefined);
    
    let sumScore = 0;
    let excellent = 0, good = 0, fair = 0, poor = 0;
    let topScore = -1, topSupplier = '-', topSupplierRow = null;

    validData.forEach(row => {
      const score = parseFloat(row['Weighted Score (/5)']);
      sumScore += score;
      
      const tier = (row['Rating Tier'] || '').toString().toLowerCase();
      if (tier.includes('excellent')) excellent++;
      else if (tier.includes('good')) good++;
      else if (tier.includes('fair')) fair++;
      else if (tier.includes('poor')) poor++;
      
      if (score > topScore) {
        topScore = score;
        topSupplier = row['Supplier Name'];
        topSupplierRow = row;
      }
    });

    const total = validData.length;
    const avgScore = total > 0 ? (sumScore / total).toFixed(2) : '0.00';
    
    // Data Kriteria untuk Bar Chart
    const criteriaList = ['Quality', 'Delivery / On-Time', 'Cost / Pricing', 'Responsiveness / Service', 'Compliance / Risk', 'Sustainability'];
    const criteriaStats = criteriaList.map(crit => {
      let sum = 0, count = 0;
      validData.forEach(row => {
        if(row[crit] !== undefined) {
          sum += parseFloat(row[crit]);
          count++;
        }
      });
      return { 
        name: crit.split('/')[0].trim(), 
        avg: count > 0 ? (sum / count).toFixed(2) : 0 
      };
    });

    // Data Pie Chart
    const pieData = [
      { name: 'Excellent', value: excellent, color: '#4F81BD' }, // Biru
      { name: 'Good', value: good, color: '#C0504D' },           // Merah
      { name: 'Fair', value: fair, color: '#9BBB59' },           // Hijau terang
      { name: 'Poor', value: poor, color: '#8064A2' }            // Ungu
    ].filter(d => d.value > 0); 

    // Data Radar Chart dari Top Supplier
    const topSupplierRadarData = topSupplierRow ? [
      { subject: 'Quality', score: topSupplierRow['Quality'] || 0, fullMark: 5 },
      { subject: 'Sustainability', score: topSupplierRow['Sustainability'] || 0, fullMark: 5 },
      { subject: 'Compliance / Risk', score: topSupplierRow['Compliance / Risk'] || 0, fullMark: 5 },
      { subject: 'Responsiveness / Service', score: topSupplierRow['Responsiveness / Service'] || 0, fullMark: 5 },
      { subject: 'Cost / Pricing', score: topSupplierRow['Cost / Pricing'] || 0, fullMark: 5 },
      { subject: 'Delivery / On-Time', score: topSupplierRow['Delivery / On-Time'] || 0, fullMark: 5 },
    ] : [];

    const calculatedKpi = {
      total,
      avgScore,
      excellent,
      good,
      fair,
      poor,
      topSupplier,
      topScore: topScore !== -1 ? topScore.toFixed(2) : '0.00',
      criteriaStats,
      pieData,
      topSupplierRadarData
    };

    // Update State
    setSupplierData(validData);
    setKpi(calculatedKpi);

    // Simpan ke localStorage agar tidak hilang saat pindah halaman
    localStorage.setItem('supplierData', JSON.stringify(validData));
    localStorage.setItem('kpiData', JSON.stringify(calculatedKpi));
  };

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* HEADER UTAMA */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
            <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage?.('dashboard')}>
              <span className={`text-[36px] font-bold tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-[#004797]'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Det<span className="border-b-[4px] border-[#E31837] pb-1">pak</span>
              </span>
            </div>
            
            <nav className="hidden md:flex items-center h-full gap-3 text-lg font-semibold">
              <button onClick={() => changePage?.('dashboard')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Dashboard</button>
              <button onClick={() => changePage?.('marketPrice')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Market Price</button>
              <button onClick={() => changePage?.('supplierEvaluation')} className="bg-[#E31837] text-white px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all shadow-xs">Supplier Evaluation</button>
              <button onClick={() => changePage?.('otd')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>OTD Performance</button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`text-xl cursor-pointer transition-colors ${isDarkMode ? 'text-amber-400 hover:text-amber-300' : 'text-gray-600 hover:text-gray-900'}`} title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
            
            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-lg text-base font-semibold ${isDarkMode ? 'bg-[#1E293B] text-slate-200 border-slate-700' : 'bg-[#F3F4F6] text-[#4A5568] border-gray-200'}`}>
              <i className="fa-regular fa-clock text-blue-500"></i>
              <span>{formattedTime}</span>
            </div>

            <div className="relative" ref={profileRef}>
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>
                Admin <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>
              
              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">AD</div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{profile.name}</h4>
                      <p className="text-sm text-gray-400 truncate">{profile.email}</p>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button onClick={() => { setShowProfileCard(false); handleLogout(); }} className="w-full text-left px-3 py-2 text-base text-red-500 hover:bg-red-500/10 rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer">
                      <i className="fa-solid fa-arrow-right-from-bracket text-red-500 text-sm"></i> Keluar
                    </button>
                  </div>
                </div>
              )}
              
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            {['dashboard', 'suppliers', 'purchaseOrders', 'analytics', 'report', 'settings'].map(page => (
              <button key={page} onClick={() => changePage?.(page)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer capitalize">
                <i className={`fa-solid ${page === 'suppliers' ? 'fa-users' : page === 'settings' ? 'fa-gear' : 'fa-border-all'} w-5 text-lg`}></i> {page.replace(/([A-Z])/g, ' $1').trim()}
              </button>
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          
          <div className="flex justify-between items-center">
            <div>
              <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Supplier Evaluation Dashboard</h1>
            </div>
            
            <div>
              <label className="bg-[#004797] hover:bg-[#003370] text-white px-5 py-2.5 rounded-xl cursor-pointer shadow-sm transition-colors font-semibold flex items-center gap-2">
                <i className="fa-solid fa-file-excel"></i> Import Excel Data
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Suppliers Evaluated', value: kpi.total, color: isDarkMode ? 'text-blue-400' : 'text-[#2A5C8D]' },
              { label: 'Average Weighted Score', value: kpi.avgScore, color: isDarkMode ? 'text-blue-300' : 'text-[#2E86C1]' },
              { label: 'Excellent Suppliers', value: kpi.excellent, color: isDarkMode ? 'text-emerald-400' : 'text-[#27AE60]' },
              { label: 'Good Suppliers', value: kpi.good, color: isDarkMode ? 'text-sky-400' : 'text-[#2980B9]' },
              { label: 'Fair Suppliers', value: kpi.fair, color: isDarkMode ? 'text-amber-400' : 'text-[#D4AC0D]' },
              { label: 'Poor Suppliers (At Risk)', value: kpi.poor, color: isDarkMode ? 'text-red-400' : 'text-[#C0392B]' },
              { label: 'Top Supplier', value: kpi.topSupplier, color: isDarkMode ? 'text-blue-400' : 'text-[#2A5C8D]' },
              { label: 'Top Score', value: kpi.topScore, color: isDarkMode ? 'text-emerald-400' : 'text-[#27AE60]' }
            ].map((card, index) => (
              <div key={index} className={`border shadow-sm flex flex-col text-center rounded-lg overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className={`py-1 border-b text-xs font-bold ${isDarkMode ? 'bg-[#0F172A] border-slate-800 text-slate-400' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>{card.label}</div>
                <div className={`py-4 ${card.label === 'Top Supplier' && card.value.length > 10 ? 'text-xl' : 'text-3xl'} font-bold ${card.color}`}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* BAR CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`p-6 border shadow-sm min-h-[300px] flex flex-col rounded-xl ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-lg font-bold text-center mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Overall Weighted Score by Supplier</h3>
              {supplierData.length > 0 ? (
                <div className="flex-1 overflow-y-auto max-h-[250px] space-y-4 pr-2">
                  {supplierData.map((sup, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className={isDarkMode ? 'text-white' : 'text-gray-800'}>{sup['Supplier Name']}</span>
                        <span className={isDarkMode ? 'text-blue-400' : 'text-[#004797]'}>{parseFloat(sup['Weighted Score (/5)']).toFixed(2)}</span>
                      </div>
                      <div className={`w-full h-2.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${(parseFloat(sup['Weighted Score (/5)']) / 5) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`flex-1 border-2 border-dashed rounded-lg flex items-center justify-center ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className={`text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    <i className="fa-solid fa-chart-bar text-4xl mb-2"></i>
                    <p className="text-sm font-medium">Impor data Excel untuk melihat grafik</p>
                  </div>
                </div>
              )}
            </div>

            <div className={`p-6 border shadow-sm min-h-[300px] flex flex-col rounded-xl ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-lg font-bold text-center mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Average Score by Criterion</h3>
              {kpi.criteriaStats.length > 0 ? (
                <div className="flex-1 flex flex-col justify-center gap-4">
                  {kpi.criteriaStats.map((crit, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className={isDarkMode ? 'text-white' : 'text-gray-800'}>{crit.name}</span>
                        <span className={isDarkMode ? 'text-emerald-400' : 'text-[#27AE60]'}>{crit.avg}</span>
                      </div>
                      <div className={`w-full h-2.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(crit.avg / 5) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`flex-1 border-2 border-dashed rounded-lg flex items-center justify-center ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className={`text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    <i className="fa-solid fa-chart-column text-4xl mb-2"></i>
                    <p className="text-sm font-medium">Impor data Excel untuk melihat grafik</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PIE & RADAR CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">
            {/* PIE CHART */}
            <div className={`p-6 border shadow-sm min-h-[400px] flex flex-col rounded-xl ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-lg font-bold text-center mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Supplier Count by Rating Tier</h3>
              <div className="flex-1 w-full flex items-center justify-center">
                {supplierData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={kpi.pieData}
                        cx="40%"
                        cy="50%"
                        outerRadius={110}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {kpi.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: isDarkMode ? '#1E293B' : '#fff', borderColor: isDarkMode ? '#334155' : '#ccc' }} 
                        itemStyle={{ color: isDarkMode ? '#F8FAFC' : '#111827' }}
                      />
                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ color: isDarkMode ? '#CBD5E1' : '#334155' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`w-full h-full border-2 border-dashed rounded-lg flex items-center justify-center ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className={`text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      <i className="fa-solid fa-chart-pie text-4xl mb-2"></i>
                      <p className="text-sm font-medium">Impor data untuk melihat grafik</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RADAR CHART */}
            <div className={`p-6 border shadow-sm min-h-[400px] flex flex-col rounded-xl ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-lg font-bold text-center mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Top Supplier Profile</h3>
              <div className="flex-1 w-full flex items-center justify-center">
                {supplierData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart cx="45%" cy="50%" outerRadius={100} data={kpi.topSupplierRadarData}>
                      <PolarGrid stroke={isDarkMode ? '#334155' : '#ccc'} />
                      <PolarAngleAxis 
                        dataKey="subject" 
                        tick={{ fill: isDarkMode ? '#cbd5e1' : '#475569', fontSize: 11 }} 
                      />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                      <Radar 
                        name={kpi.topSupplier} 
                        dataKey="score" 
                        stroke="#4F81BD" 
                        fill="#4F81BD" 
                        fillOpacity={0.8} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: isDarkMode ? '#1E293B' : '#fff', borderColor: isDarkMode ? '#334155' : '#ccc' }}
                      />
                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ color: isDarkMode ? '#CBD5E1' : '#334155', fontSize: '12px' }}/>
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`w-full h-full border-2 border-dashed rounded-lg flex items-center justify-center ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className={`text-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      <i className="fa-solid fa-connectdevelop text-4xl mb-2"></i>
                      <p className="text-sm font-medium">Impor data untuk melihat profil</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}