import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx';

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'];

const KPICard = ({ title, value, color = '#3b82f6' }) => (
  <div className="bg-[#182238] border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between shadow-md">
    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
    <span className="text-2xl font-bold mt-2" style={{ color }}>{value}</span>
  </div>
);

// Format mata uang & persentase
const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
const formatPercent = (num) => `${(num || 0).toFixed(1)}%`;

export default function OTD({ changePage: propChangePage }) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [activePage, setActivePage] = useState('otd');
  const [time, setTime] = useState(new Date());
  
  // MENGAMBIL DATA DARI LOCAL STORAGE AGAR TIDAK HILANG SAAT PINDAH HALAMAN
  const [rawData, setRawData] = useState(() => {
    const savedData = localStorage.getItem('otdExcelData');
    return savedData ? JSON.parse(savedData) : [];
  });
  
  const profileRef = useRef(null);
  const fileInputRef = useRef(null);

  const profile = {
    name: 'Admin User',
    email: 'admin@detpak.com',
    role: 'Administrator',
  };

  const changePage = propChangePage || ((page) => setActivePage(page));

  // Update Jam Realtime
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Handle Klik di Luar Card Profile
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
    alert('Logged out successfully');
  };

  // -------------------------------------------------------------
  // FUNGSI IMPORT EXCEL (format KPI.xlsx)
  // -------------------------------------------------------------
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { raw: false }); // raw:false parses dates correctly
      
      // MENYIMPAN DATA BARU KE STATE DAN LOCAL STORAGE
      setRawData(json);
      localStorage.setItem('otdExcelData', JSON.stringify(json));
    };
    reader.readAsArrayBuffer(file);
  };

  // -------------------------------------------------------------
  // PENGOLAHAN DATA KHUSUS OTD PERFORMANCE
  // -------------------------------------------------------------
  const dashboardData = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;

    let totalPOs = rawData.length;
    let onTimeCount = 0;
    let lateCount = 0;
    let totalCycleTime = 0;
    let totalSpend = 0;

    const supplierMap = {};
    const categoryMap = {};
    const trendMap = {};
    const uniqueSuppliers = new Set();

    rawData.forEach(row => {
      const approved = parseFloat(row['Approved Amount (US$)']) || 0;
      const cycleTime = parseFloat(row['Cycle Time (Days)']) || 0;
      const category = row['Category'] || 'Unknown';
      const supplier = row['Supplier'] || 'Unknown';
      const onTimeStr = row['On-Time?'];
      const dateStr = row['Order Date'];
      
      const isOnTime = (onTimeStr === 'Yes');
      
      // Aggregates
      totalSpend += approved;
      totalCycleTime += cycleTime;
      if (isOnTime) {
          onTimeCount++;
      } else {
          lateCount++;
      }
      uniqueSuppliers.add(supplier);

      // Map untuk OTD by Supplier
      if (!supplierMap[supplier]) supplierMap[supplier] = { total: 0, onTime: 0 };
      supplierMap[supplier].total += 1;
      if (isOnTime) supplierMap[supplier].onTime += 1;

      // Map untuk OTD by Category
      if (!categoryMap[category]) categoryMap[category] = { total: 0, onTime: 0 };
      categoryMap[category].total += 1;
      if (isOnTime) categoryMap[category].onTime += 1;

      // Map untuk OTD Trend Bulanan
      if (dateStr) {
        const dateObj = new Date(dateStr);
        if (!isNaN(dateObj)) {
          const monthYear = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' });
          if (!trendMap[monthYear]) trendMap[monthYear] = { total: 0, onTime: 0 };
          trendMap[monthYear].total += 1;
          if (isOnTime) trendMap[monthYear].onTime += 1;
        }
      }
    });

    // Formatting hasil untuk Recharts
    const supplierData = Object.keys(supplierMap).map(k => ({ 
      name: k, 
      "OTD %": parseFloat(((supplierMap[k].onTime / supplierMap[k].total) * 100).toFixed(1))
    }));

    const categoryData = Object.keys(categoryMap).map(k => ({ 
      name: k, 
      "OTD %": parseFloat(((categoryMap[k].onTime / categoryMap[k].total) * 100).toFixed(1))
    }));

    // Data status breakdown (On-Time vs Late)
    const deliveryStatusData = [
      { name: 'On-Time', value: onTimeCount },
      { name: 'Late Delivery', value: lateCount }
    ];
    
    // Sort trend bulan secara kronologis
    const trendData = Object.keys(trendMap).map(k => ({ 
      month: k, 
      "OTD %": parseFloat(((trendMap[k].onTime / trendMap[k].total) * 100).toFixed(1)) 
    })).sort((a, b) => new Date(`1 ${a.month}`) - new Date(`1 ${b.month}`)); 

    return {
      kpi: {
        totalPOs,
        onTimePOs: onTimeCount,
        latePOs: lateCount,
        otdPercent: (onTimeCount / totalPOs) * 100 || 0,
        avgCycleTime: totalCycleTime / totalPOs || 0,
        activeSuppliers: uniqueSuppliers.size,
        totalSpend
      },
      charts: {
        categoryData,
        supplierData,
        deliveryStatusData,
        trendData
      }
    };

  }, [rawData]);

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* HEADER UTAMA */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
            <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage('dashboard')}>
              <span className={`text-[36px] font-bold tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-[#004797]'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Det<span className="border-b-[4px] border-[#E31837] pb-1">pak</span>
              </span>
            </div>
            
            <nav className="hidden md:flex items-center h-full gap-3 text-lg font-semibold">
              <button onClick={() => changePage('dashboard')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Dashboard</button>
              <button onClick={() => changePage('marketPrice')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Market Price</button>
              <button onClick={() => changePage('supplierEvaluation')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Supplier Evaluation</button>
              <button onClick={() => changePage('otd')} className="bg-[#E31837] text-white px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all shadow-xs">OTD Performance</button>
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
                Admin <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>
              
              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      AD
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{profile.name}</h4>
                      <p className="text-sm text-gray-400 truncate">{profile.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded">{profile.role}</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button onClick={() => { setShowProfileCard(false); changePage('settings'); }} className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'}`}>
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
            <button onClick={() => changePage('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => changePage('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => changePage('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>
          </nav>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          
          {/* UPLOAD FILE SECTION */}
          <div className="mb-6 flex justify-between items-center bg-[#1E293B] p-4 rounded-xl border border-slate-700/60 shadow-md">
            <div>
              <h3 className="text-lg font-bold text-white">Upload KPI Data</h3>
              <p className="text-sm text-slate-400">Import your <span className="font-semibold italic">format KPI.xlsx</span> file here to update the OTD Performance dashboard.</p>
            </div>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer shadow-sm flex items-center gap-2"
            >
              <i className="fa-solid fa-file-excel"></i> Import Excel
            </button>
          </div>

          {!dashboardData ? (
             <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-slate-600 rounded-xl">
                <i className="fa-solid fa-truck-fast text-6xl text-slate-500 mb-4"></i>
                <h3 className="text-xl font-semibold text-slate-300">No Data Available</h3>
                <p className="text-slate-500 mt-2">Please import the <span className="italic">format KPI.xlsx</span> file to view OTD metrics.</p>
             </div>
          ) : (
            <>
              {/* KPI CARDS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <KPICard title="Total POs" value={dashboardData.kpi.totalPOs} color="#60a5fa" />
                <KPICard title="On-Time Delivery %" value={formatPercent(dashboardData.kpi.otdPercent)} color={dashboardData.kpi.otdPercent >= 90 ? "#10b981" : "#f59e0b"} />
                <KPICard title="Total On-Time" value={dashboardData.kpi.onTimePOs} color="#10b981" />
                <KPICard title="Total Late" value={dashboardData.kpi.latePOs} color="#ef4444" />
                <KPICard title="Avg Cycle Time (Days)" value={dashboardData.kpi.avgCycleTime.toFixed(1)} color="#a78bfa" />
                <KPICard title="Active Suppliers" value={dashboardData.kpi.activeSuppliers} color="#fb923c" />
                <KPICard title="Total Spend Impact" value={formatCurrency(dashboardData.kpi.totalSpend)} color="#60a5fa" />
              </div>

              {/* BAR CHARTS ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-[#182238] border border-slate-700/60 rounded-xl p-5 shadow-md">
                  <h3 className="text-center font-semibold text-slate-200 mb-4 text-base">OTD % by Supplier</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboardData.charts.supplierData} margin={{ top: 5, right: 10, left: 10, bottom: 85 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} formatter={(value) => `${value}%`} />
                        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                        <Bar dataKey="OTD %" name="On-Time Delivery (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#182238] border border-slate-700/60 rounded-xl p-5 shadow-md">
                  <h3 className="text-center font-semibold text-slate-200 mb-4 text-base">OTD % by Category</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboardData.charts.categoryData} margin={{ top: 5, right: 10, left: 10, bottom: 65 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} formatter={(value) => `${value}%`} />
                        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                        <Bar dataKey="OTD %" name="On-Time Delivery (%)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* LINE & PIE CHARTS ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#182238] border border-slate-700/60 rounded-xl p-5 shadow-md">
                  <h3 className="text-center font-semibold text-slate-200 mb-4 text-base">Monthly OTD % Trend</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dashboardData.charts.trendData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} formatter={(value) => `${value}%`} />
                        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                        <Line type="monotone" dataKey="OTD %" name="On-Time Delivery (%)" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#182238] border border-slate-700/60 rounded-xl p-5 shadow-md">
                  <h3 className="text-center font-semibold text-slate-200 mb-4 text-base">Delivery Status Breakdown</h3>
                  <div className="h-72 flex justify-center items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dashboardData.charts.deliveryStatusData} cx="50%" cy="50%" outerRadius={95} fill="#8884d8" dataKey="value" stroke="none">
                          {dashboardData.charts.deliveryStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}