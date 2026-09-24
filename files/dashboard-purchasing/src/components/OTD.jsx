import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';
import AppLayout from './AppLayout';

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'];

// API Base URL - diubah ke IP lokal agar bisa diakses perangkat lain di jaringan yang sama
const API_BASE_URL = 'http://idws-n26010:5000/api';

const KPICard = ({ title, value, color = '#3b82f6', isDarkMode }) => (
  <div className={`border rounded-xl p-4 flex flex-col justify-between shadow-sm transition-colors ${
    isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-gray-200'
  }`}>
    <span className={`text-xs font-semibold uppercase tracking-wider ${
      isDarkMode ? 'text-slate-400' : 'text-gray-500'
    }`}>{title}</span>
    <span className="text-2xl font-bold mt-2" style={{ color }}>{value}</span>
  </div>
);

// Format mata uang & persentase
const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
const formatPercent = (num) => `${(num || 0).toFixed(1)}%`;

export default function OTD({ changePage: propChangePage, onLogout, activePage: propActivePage = 'otd' }) {
  const { hasPermission, user } = useRole();
  const canManageUsers = hasPermission('manage_users');
  
  // Pengecekan apakah user memiliki hak akses Admin
  const isAdmin = user?.role?.toLowerCase()?.trim() === 'admin' || canManageUsers;

  // === UI & THEME STATE ===
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : false;
  });

  // Efek untuk menyimpan perubahan tema agar tersinkronisasi antar halaman
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const [localActivePage, setLocalActivePage] = useState(propActivePage);
  const activePage = propActivePage || localActivePage;
  const changePage = propChangePage || ((page) => setLocalActivePage(page));

  // DATA DIAMBIL DARI DATABASE (bukan lagi dari localStorage)
  const [rawData, setRawData] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [filterMonth, setFilterMonth] = useState(''); // '' = tampilkan semua periode, format "YYYY-MM"

  const fileInputRef = useRef(null);

  // -------------------------------------------------------------
  // AMBIL DATA OTD PERFORMANCE DARI DATABASE
  // -------------------------------------------------------------
  const fetchOtdData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/otd-performance`);
      if (response.ok) {
        const data = await response.json();
        setRawData(data);
        console.log('✓ OTD data loaded from DB:', data.length);
      }
    } catch (error) {
      console.error('❌ Error fetching OTD data:', error);
    }
  };

  useEffect(() => {
    fetchOtdData();
  }, []);

  // -------------------------------------------------------------
  // FUNGSI IMPORT EXCEL (format KPI.xlsx)
  // -------------------------------------------------------------
  const handleFileUpload = (e) => {
    if (!isAdmin) return;

    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    setStatusMessage('');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { raw: false });

      setStatusMessage(`Menyimpan ${json.length} data ke database...`);
      let successCount = 0;

      for (const row of json) {
        const saved = await saveOTDPerformanceToBackend(row);
        if (saved) successCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await fetchOtdData();

      setIsImporting(false);
      setStatusMessage(`✓ Berhasil menyimpan ${successCount}/${json.length} data.`);
      setTimeout(() => setStatusMessage(''), 5000);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const saveOTDPerformanceToBackend = async (otdData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/otd-performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          po_number: otdData['PO Number'] || otdData['po_number'] || '',
          supplier_name: otdData['Supplier'] || otdData['supplier_name'] || '',
          category: otdData['Category'] || otdData['category'] || null,
          delivery_status: otdData['On-Time?'] === 'Yes' ? 'On-Time' : 'Late',
          cycle_time_days: parseFloat(otdData['Cycle Time (Days)']) || 0,
          spend_impact: parseFloat(otdData['Approved Amount (US$)']) || 0,
          record_date: otdData['Order Date'] || otdData['record_date'] || new Date().toISOString().split('T')[0]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error:', errorData);
        return false;
      }

      const result = await response.json();
      console.log('✅ OTD Performance berhasil disimpan ke database:', result);
      return true;
    } catch (error) {
      console.error('❌ Error saat POST ke backend:', error);
      return false;
    }
  };

  // -------------------------------------------------------------
  // HAPUS SEMUA DATA OTD PERFORMANCE DI DATABASE
  // -------------------------------------------------------------
  const clearOtdData = async () => {
    if (!isAdmin) return;

    setIsClearing(true);
    setStatusMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/system/clear-data`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: ['otdPerformance'] })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Gagal menghapus data');
      }

      await fetchOtdData();
      setStatusMessage('✓ Semua data OTD Performance berhasil dihapus.');
    } catch (error) {
      console.error('❌ Error Clear Data:', error);
      setStatusMessage(`Gagal menghapus data: ${error.message}`);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
      setTimeout(() => setStatusMessage(''), 5000);
    }
  };

  // -------------------------------------------------------------
  // PENGOLAHAN DATA KHUSUS OTD PERFORMANCE
  // -------------------------------------------------------------
  const filteredData = useMemo(() => {
    if (!filterMonth) return rawData;
    return rawData.filter(row => {
      if (!row.record_date) return false;
      const rowMonth = new Date(row.record_date).toISOString().slice(0, 7);
      return rowMonth === filterMonth;
    });
  }, [rawData, filterMonth]);

  const dashboardData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    let totalPOs = filteredData.length;
    let onTimeCount = 0;
    let lateCount = 0;
    let totalCycleTime = 0;
    let totalSpend = 0;

    const supplierMap = {};
    const categoryMap = {};
    const trendMap = {};
    const uniqueSuppliers = new Set();

    filteredData.forEach(row => {
      const approved = parseFloat(row.spend_impact) || 0;
      const cycleTime = parseFloat(row.cycle_time_days) || 0;
      const category = row.category || 'Unknown';
      const supplier = row.supplier_name || 'Unknown';
      const dateStr = row.record_date;

      const isOnTime = (row.delivery_status === 'On-Time');

      totalSpend += approved;
      totalCycleTime += cycleTime;
      if (isOnTime) {
        onTimeCount++;
      } else {
        lateCount++;
      }
      uniqueSuppliers.add(supplier);

      if (!supplierMap[supplier]) supplierMap[supplier] = { total: 0, onTime: 0 };
      supplierMap[supplier].total += 1;
      if (isOnTime) supplierMap[supplier].onTime += 1;

      if (!categoryMap[category]) categoryMap[category] = { total: 0, onTime: 0 };
      categoryMap[category].total += 1;
      if (isOnTime) categoryMap[category].onTime += 1;

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

    const supplierData = Object.keys(supplierMap).map(k => ({
      name: k,
      "OTD %": parseFloat(((supplierMap[k].onTime / supplierMap[k].total) * 100).toFixed(1))
    }));

    const categoryData = Object.keys(categoryMap).map(k => ({
      name: k,
      "OTD %": parseFloat(((categoryMap[k].onTime / categoryMap[k].total) * 100).toFixed(1))
    }));

    const deliveryStatusData = [
      { name: 'On-Time', value: onTimeCount },
      { name: 'Late Delivery', value: lateCount }
    ];

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

  }, [filteredData]);

  const tickColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    color: isDarkMode ? '#ffffff' : '#0f172a'
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
        {/* UPLOAD FILE SECTION */}
        <div className={`flex flex-wrap justify-between items-center gap-4 p-4 rounded-xl border transition-colors shadow-sm ${
          isDarkMode ? 'bg-[#1E293B] border-slate-700/60' : 'bg-white border-gray-200'
        }`}>
          <div>
            <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Upload KPI Data</h3>
            <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Import your <span className="font-semibold italic">format KPI.xlsx</span> file here to update the OTD Performance dashboard.
            </p>
            {statusMessage && (
              <p className={`text-sm mt-1 font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{statusMessage}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Bulan & Tahun */}
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className={`border px-3 py-2.5 rounded-lg text-sm font-medium shadow-xs outline-none cursor-pointer transition-colors ${
                isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-300 focus:border-slate-500' : 'bg-white border-slate-200 text-slate-600 focus:border-blue-400'
              }`}
            />
            {filterMonth && (
              <button
                onClick={() => setFilterMonth('')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer ${
                  isDarkMode ? 'bg-[#0F172A] border border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title="Tampilkan semua periode"
              >
                Semua Periode
              </button>
            )}

            {/* Tombol Import Excel & Clear Data hanya tampil untuk Admin */}
            {isAdmin && (
              <>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isImporting}
                />
                <button
                  onClick={() => fileInputRef.current.click()}
                  disabled={isImporting}
                  className={`px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-sm flex items-center gap-2 ${
                    isImporting ? 'bg-slate-400 cursor-not-allowed text-white' : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  }`}
                >
                  <i className={`fa-solid ${isImporting ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
                  {isImporting ? 'Syncing...' : 'Import Excel'}
                </button>

                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isClearing || rawData.length === 0}
                  className={`px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-sm flex items-center gap-2 cursor-pointer ${
                    isClearing || rawData.length === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  <i className="fa-solid fa-trash"></i> Clear Data
                </button>
              </>
            )}
          </div>
        </div>

        {/* MODAL KONFIRMASI CLEAR DATA */}
        {showClearConfirm && isAdmin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={`w-full max-w-sm rounded-xl p-6 shadow-xl ${isDarkMode ? 'bg-[#1E293B] text-slate-100' : 'bg-white text-gray-800'}`}>
              <h3 className="text-lg font-bold mb-2">Hapus semua data OTD Performance?</h3>
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Tindakan ini akan menghapus seluruh data OTD Performance dari database secara permanen dan tidak bisa dibatalkan.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${
                    isDarkMode ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Batal
                </button>
                <button
                  onClick={clearOtdData}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white cursor-pointer flex items-center gap-2"
                >
                  {isClearing && <i className="fa-solid fa-spinner fa-spin"></i>}
                  Ya, Hapus Semua
                </button>
              </div>
            </div>
          </div>
        )}

        {!dashboardData ? (
          <div className={`flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-xl transition-colors ${
            isDarkMode ? 'border-slate-700 bg-[#1E293B]/40' : 'border-gray-300 bg-white/50'
          }`}>
            <i className={`fa-solid fa-truck-fast text-6xl mb-4 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}></i>
            <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>No Data Available</h3>
            <p className={`mt-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>
              Please import the <span className="italic">format KPI.xlsx</span> file to view OTD metrics.
            </p>
          </div>
        ) : (
          <>
            {/* KPI CARDS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard title="Total POs" value={dashboardData.kpi.totalPOs} color="#60a5fa" isDarkMode={isDarkMode} />
              <KPICard title="On-Time Delivery %" value={formatPercent(dashboardData.kpi.otdPercent)} color={dashboardData.kpi.otdPercent >= 90 ? "#10b981" : "#f59e0b"} isDarkMode={isDarkMode} />
              <KPICard title="Total On-Time" value={dashboardData.kpi.onTimePOs} color="#10b981" isDarkMode={isDarkMode} />
              <KPICard title="Total Late" value={dashboardData.kpi.latePOs} color="#ef4444" isDarkMode={isDarkMode} />
              <KPICard title="Avg Cycle Time (Days)" value={dashboardData.kpi.avgCycleTime.toFixed(1)} color="#a78bfa" isDarkMode={isDarkMode} />
              <KPICard title="Active Suppliers" value={dashboardData.kpi.activeSuppliers} color="#fb923c" isDarkMode={isDarkMode} />
              <KPICard title="Total Spend Impact" value={formatCurrency(dashboardData.kpi.totalSpend)} color="#60a5fa" isDarkMode={isDarkMode} />
            </div>

            {/* BAR CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`border rounded-xl p-5 shadow-sm transition-colors ${
                isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-center font-semibold mb-4 text-base ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>OTD % by Supplier</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardData.charts.supplierData} margin={{ top: 5, right: 10, left: 10, bottom: 85 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: tickColor }} />
                      <YAxis tick={{ fontSize: 11, fill: tickColor }} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '12px', color: tickColor }} />
                      <Bar dataKey="OTD %" name="On-Time Delivery (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`border rounded-xl p-5 shadow-sm transition-colors ${
                isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-center font-semibold mb-4 text-base ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>OTD % by Category</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardData.charts.categoryData} margin={{ top: 5, right: 10, left: 10, bottom: 65 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: tickColor }} />
                      <YAxis tick={{ fontSize: 11, fill: tickColor }} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '12px', color: tickColor }} />
                      <Bar dataKey="OTD %" name="On-Time Delivery (%)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* LINE & PIE CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`border rounded-xl p-5 shadow-sm transition-colors ${
                isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-center font-semibold mb-4 text-base ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>Monthly OTD % Trend</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboardData.charts.trendData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} />
                      <YAxis tick={{ fontSize: 11, fill: tickColor }} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '12px', color: tickColor }} />
                      <Line type="monotone" dataKey="OTD %" name="On-Time Delivery (%)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`border rounded-xl p-5 shadow-sm transition-colors ${
                isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-center font-semibold mb-4 text-base ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>Delivery Status Breakdown</h3>
                <div className="h-72 flex justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={dashboardData.charts.deliveryStatusData} dataKey="value" cx="50%" cy="50%" outerRadius={95} fill="#8884d8" stroke="none">
                        {dashboardData.charts.deliveryStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', color: tickColor }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}