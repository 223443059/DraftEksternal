import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { 
  Building2, Award, CheckCircle2, ThumbsUp, AlertTriangle, 
  XCircle, Crown, Star, Upload, Calendar, ChevronDown, Database, Trash2
} from 'lucide-react';
import { useRole } from '../context/RoleContext';

// API Base URL - Diatur ke IP Host agar bisa diakses teman di jaringan yang sama
const API_BASE_URL = 'http://idws-n26010:5000/api';

// Helper inisial nama untuk Avatar Profile
const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export default function SupplierEvaluationDashboard({ changePage: propChangePage, onLogout, activePage: propActivePage = 'supplierEvaluation' }) {
  const { hasPermission, user } = useRole();
  const canManageUsers = hasPermission ? hasPermission('manage_users') : false;
  const isAdmin = user?.role_id === 1;

  // === UI, TEMA & PROFILE STATE ===
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : false;
  });

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const [showProfileCard, setShowProfileCard] = useState(false);
  const [localActivePage, setLocalActivePage] = useState(propActivePage);
  const [time, setTime] = useState(new Date());

  const activePage = propActivePage || localActivePage;
  const changePage = propChangePage || ((page) => setLocalActivePage(page));

  const profileRef = useRef(null);
  
  // Ref & State untuk Clear Data Dropdown
  const clearDropdownRef = useRef(null);
  const [showClearDropdown, setShowClearDropdown] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Update Jam Realtime
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Handle Klik di Luar Card Profile & Clear Dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
      if (clearDropdownRef.current && !clearDropdownRef.current.contains(event.target)) {
        setShowClearDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    }
  };

  // === DATA STATE UNTUK SUPPLIER EVALUATION ===
  const [isUploading, setIsUploading] = useState(false);
  const [filterDate, setFilterDate] = useState(''); 
  const [suppliers, setSuppliers] = useState([]);
  const [rawEvaluations, setRawEvaluations] = useState([]); 
  const [supplierData, setSupplierData] = useState([]);
  const [saveMessage, setSaveMessage] = useState('');
  
  const [kpi, setKpi] = useState({
    total: 0,
    avgScore: "0.00",
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    topSupplier: "-",
    topScore: "0.00",
  });

  const [chartData, setChartData] = useState({
    criteriaStats: [],
    ratingTier: [],
    topSupplierRadar: []
  });

  const fetchSuppliers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/suppliers`);
      if (response.ok) {
        const data = await response.json();
        setSuppliers(data);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchEvaluations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/supplier-evaluations`);
      if (response.ok) {
        const data = await response.json();
        setRawEvaluations(data);
        console.log('✓ Evaluations loaded from DB:', data.length);
      }
    } catch (error) {
      console.error('Error fetching evaluations:', error);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchEvaluations();
  }, []);

  // === FITUR HAPUS DATA (TODAY, 1 WEEK, 1 MONTH) ===
  const handleClearData = async (period) => {
    if (!isAdmin) return;
    const periodLabels = {
      'today': 'Hari Ini',
      '1_week': '1 Minggu Terakhir',
      '1_month': '1 Bulan Terakhir',
      'all': 'Semua Waktu (All Time)'
    };

    if (!window.confirm(`Apakah Anda yakin ingin menghapus data evaluasi untuk periode: ${periodLabels[period]}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    
    setIsClearing(true);
    setShowClearDropdown(false);
    
    try {
      const response = await fetch(`${API_BASE_URL}/supplier-evaluations/clear?period=${period}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Berhasil: ${result.message}`);
        fetchEvaluations(); // Refresh data otomatis setelah dihapus
      } else {
        const err = await response.json();
        alert(`Gagal: ${err.message}`);
      }
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Terjadi kesalahan pada server saat menghapus data.');
    } finally {
      setIsClearing(false);
    }
  };

  // === HITUNG KPI, CHART, DAN TABEL ===
  const dbCriteriaKeys = ['quality', 'delivery_on_time', 'cost_pricing', 'responsiveness_service', 'compliance_risk', 'sustainability'];
  const criteriaLabels = {
    quality: 'Quality',
    delivery_on_time: 'Delivery / On-Time',
    cost_pricing: 'Cost / Pricing',
    responsiveness_service: 'Responsiveness / Service',
    compliance_risk: 'Compliance / Risk',
    sustainability: 'Sustainability'
  };

  useEffect(() => {
    const filteredRows = filterDate
      ? rawEvaluations.filter(row => {
          if (!row.evaluation_date) return false;
          const rowMonth = new Date(row.evaluation_date).toISOString().slice(0, 7); 
          return rowMonth === filterDate;
        })
      : rawEvaluations;

    if (!filteredRows || filteredRows.length === 0) {
      setKpi({ total: 0, avgScore: "0.00", excellent: 0, good: 0, fair: 0, poor: 0, topSupplier: "-", topScore: "0.00" });
      setChartData({ criteriaStats: [], ratingTier: [], topSupplierRadar: [] });
      setSupplierData([]);
      return;
    }

    let sumScore = 0;
    let excellent = 0, good = 0, fair = 0, poor = 0;
    let topScore = -1, topSupplier = '-', topRow = null;
    const criteriaSums = { quality: 0, delivery_on_time: 0, cost_pricing: 0, responsiveness_service: 0, compliance_risk: 0, sustainability: 0 };

    filteredRows.forEach(row => {
      const score = parseFloat(row.weighted_score);
      sumScore += score;

      const tier = (row.rating_tier || '').toString().toLowerCase();
      if (tier.includes('excellent')) excellent++;
      else if (tier.includes('good')) good++;
      else if (tier.includes('fair')) fair++;
      else if (tier.includes('poor')) poor++;

      if (score > topScore) {
        topScore = score;
        topSupplier = row.supplier_name || 'Unknown Supplier';
        topRow = row;
      }

      dbCriteriaKeys.forEach(key => {
        if (row[key] !== null && row[key] !== undefined) {
          criteriaSums[key] += parseFloat(row[key]);
        }
      });
    });

    const total = filteredRows.length;

    setKpi({
      total,
      avgScore: (sumScore / total).toFixed(2),
      excellent, good, fair, poor,
      topSupplier,
      topScore: topScore.toFixed(2)
    });

    setChartData({
      criteriaStats: dbCriteriaKeys.map(key => ({
        criterion: criteriaLabels[key].split('/')[0].trim(),
        average: total > 0 ? (criteriaSums[key] / total).toFixed(1) : 0,
        topSupplier: topRow && topRow[key] !== null && topRow[key] !== undefined ? parseFloat(topRow[key]) : 0
      })),
      ratingTier: [
        { name: 'Excellent', value: excellent, percentage: Math.round((excellent/total)*100)+'%', color: '#2563EB' },
        { name: 'Good', value: good, percentage: Math.round((good/total)*100)+'%', color: '#10B981' },
        { name: 'Fair', value: fair, percentage: Math.round((fair/total)*100)+'%', color: '#F59E0B' },
        { name: 'Poor', value: poor, percentage: Math.round((poor/total)*100)+'%', color: '#EF4444' },
      ].filter(d => d.value > 0),
      topSupplierRadar: topRow ? dbCriteriaKeys.map(key => ({
        subject: criteriaLabels[key].split('/')[0].trim(),
        score: topRow[key] !== null && topRow[key] !== undefined ? parseFloat(topRow[key]) : 0
      })) : []
    });

    const mappedSuppliers = filteredRows.map(row => ({
      name: row.supplier_name,
      score: parseFloat(row.weighted_score),
      tier: row.rating_tier
    })).sort((a, b) => b.score - a.score);

    setSupplierData(mappedSuppliers);
  }, [rawEvaluations, filterDate]);

  const saveToDatabase = async (evalData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/supplier-evaluations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          supplier_id: evalData.supplier_id,
          weighted_score: evalData.weighted_score,
          rating_tier: evalData.rating_tier,
          evaluation_date: evalData.evaluation_date,
          quality: evalData.quality,
          delivery_on_time: evalData.delivery_on_time,
          cost_pricing: evalData.cost_pricing,
          responsiveness_service: evalData.responsiveness_service,
          compliance_risk: evalData.compliance_risk,
          sustainability: evalData.sustainability
        })
      });

      if (!response.ok) throw new Error('Gagal menyimpan ke database');
      return true;
    } catch (error) {
      console.error('Error DB:', error);
      return false;
    }
  };

  const getOrCreateSupplierId = async (supplierName, localSuppliers) => {
    const found = localSuppliers.find(s => s.name?.toLowerCase() === supplierName?.toLowerCase());
    if (found) return found.id;

    try {
      const response = await fetch(`${API_BASE_URL}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: supplierName, status: 'Active' })
      });
      const result = await response.json();
      if (result.success && result.id) {
        localSuppliers.push({ id: result.id, name: supplierName });
        return result.id;
      }
    } catch (error) {
      console.error(`Gagal membuat supplier baru "${supplierName}":`, error);
    }
    return null;
  };

  const handleFileUpload = (e) => {
    if (!isAdmin) return;
    const file = e.target.files[0];
    if (!file) return;
    
    setIsUploading(true);
    const reader = new FileReader();
    
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const wsname = wb.SheetNames[0]; 
      const ws = wb.Sheets[wsname];
      const jsonData = XLSX.utils.sheet_to_json(ws, { raw: false });
      
      processImportedData(jsonData);
      setIsUploading(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const processImportedData = async (data) => {
    const validData = data.filter(row => row['Supplier Name'] && row['Weighted Score (/5)'] !== undefined);
    
    if(validData.length === 0) return alert('Format data Excel tidak sesuai!');

    const criteriaKeys = ['Quality', 'Delivery / On-Time', 'Cost / Pricing', 'Responsiveness / Service', 'Compliance / Risk', 'Sustainability'];
    const criteriaDbMap = {
      'Quality': 'quality',
      'Delivery / On-Time': 'delivery_on_time',
      'Cost / Pricing': 'cost_pricing',
      'Responsiveness / Service': 'responsiveness_service',
      'Compliance / Risk': 'compliance_risk',
      'Sustainability': 'sustainability'
    };

    setSaveMessage(`Menyimpan ${validData.length} data ke database...`);
    let successCount = 0;
    let skippedCount = 0;
    const localSuppliers = [...suppliers]; 

    for (const row of validData) {
      const rawScore = row['Weighted Score (/5)'].toString().replace(',', '.');
      const score = parseFloat(rawScore);

      const supplierId = await getOrCreateSupplierId(row['Supplier Name'], localSuppliers);
      if (!supplierId) {
        console.error(`Dilewati - gagal menentukan supplier_id untuk "${row['Supplier Name']}"`);
        skippedCount++;
        continue;
      }

      const criteriaValues = {};
      criteriaKeys.forEach(key => {
        criteriaValues[criteriaDbMap[key]] = row[key] !== undefined && row[key] !== ''
          ? parseFloat(row[key].toString().replace(',', '.'))
          : null;
      });

      const saved = await saveToDatabase({
        supplier_id: supplierId,
        supplier_name: row['Supplier Name'],
        weighted_score: score,
        rating_tier: row['Rating Tier'],
        evaluation_date: row['Evaluation Date'] || new Date().toISOString().split('T')[0],
        ...criteriaValues
      });

      if (saved) successCount++;
      await new Promise(resolve => setTimeout(resolve, 100)); 
    }

    setSuppliers(localSuppliers);
    await fetchEvaluations();

    setSaveMessage(`✓ Berhasil menyimpan ${successCount}/${validData.length} data.${skippedCount > 0 ? ` ${skippedCount} dilewati (gagal buat supplier).` : ''}`);
    setTimeout(() => setSaveMessage(''), 5000);
  };

  const kpiCards = [
    { title: "Suppliers Evaluated", value: kpi.total, icon: Building2, color: "text-blue-600" },
    { title: "Average Score (/5)", value: kpi.avgScore, icon: Star, color: "text-blue-500" },
    { title: "Excellent Suppliers", value: kpi.excellent, icon: Award, color: "text-emerald-500" },
    { title: "Good Suppliers", value: kpi.good, icon: ThumbsUp, color: "text-sky-500" },
    { title: "Fair Suppliers", value: kpi.fair, icon: AlertTriangle, color: "text-amber-500" },
    { title: "Poor Suppliers (At Risk)", value: kpi.poor, icon: XCircle, color: "text-red-500" },
    { title: "Top Supplier", value: kpi.topSupplier, icon: Crown, color: "text-indigo-600", isText: true },
    { title: "Top Score", value: kpi.topScore, icon: CheckCircle2, color: "text-emerald-600" }
  ];

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${
      isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'
    }`}>

      {/* HEADER UTAMA */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${
        isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'
      }`}>
        <div className={`flex items-center justify-between px-6 h-20 border-b ${
          isDarkMode ? 'border-slate-800' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-10 h-full">
            <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage('dashboard')}>
              <img
                src="/images/logo.png"
                alt="Detpak Logo"
                className="h-12 w-auto object-contain"
              />
            </div>
            <nav className="hidden md:flex items-center h-full gap-3 text-lg font-semibold">
              <button 
                onClick={() => changePage('dashboard')} 
                className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${
                  isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => changePage('marketPrice')} 
                className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${
                  isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                Market Price
              </button>
              <button onClick={() => changePage?.('supplierEvaluation')} className="bg-[#004797] text-white px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all shadow-xs">Supplier Evaluation</button>
              <button 
                onClick={() => changePage('otd')} 
                className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${
                  isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                OTD Performance
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`text-xl cursor-pointer transition-colors ${
                isDarkMode ? 'text-amber-400 hover:text-amber-300' : 'text-gray-600 hover:text-gray-900'
              }`}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>

            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-lg text-base font-semibold ${
              isDarkMode ? 'bg-[#1E293B] text-slate-200 border-slate-700' : 'bg-[#F3F4F6] text-[#4A5568] border-gray-200'
            }`}>
              <i className="fa-regular fa-clock text-blue-500"></i>
              <span>{formattedTime}</span>
            </div>

            <div className="relative" ref={profileRef}>
              <button 
                onClick={() => setShowProfileCard(!showProfileCard)} 
                className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${
                  isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                {user?.name || user?.username || 'Admin'} 
                <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>

              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${
                  isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'
                }`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      {getInitials(user?.name || user?.username)}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {user?.name || user?.username || '-'}
                      </h4>
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        {user?.email || '-'}
                      </p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded ${
                        isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-[#004797]'
                      }`}>
                        {user?.role || '-'}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button 
                      onClick={() => { setShowProfileCard(false); changePage('settings'); }} 
                      className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${
                        isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <i className="fa-solid fa-user-gear text-gray-400 text-sm"></i> Manage Profile
                    </button>
                    <button 
                      onClick={() => { setShowProfileCard(false); handleLogout(); }} 
                      className="w-full text-left px-3 py-2 text-base text-red-500 hover:bg-red-500/10 rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                    >
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

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 transition-colors duration-200 ${
          isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'
        }`}>
          <nav className="flex flex-col gap-2 px-4">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'fa-border-all' },
              { id: 'suppliers', label: 'Suppliers', icon: 'fa-users' },
              { id: 'purchaseOrders', label: 'Purchase Orders', icon: 'fa-cart-shopping' },
              { id: 'analytics', label: 'Analytics', icon: 'fa-chart-line' },
              { id: 'report', label: 'Report', icon: 'fa-file-lines' },
              { id: 'settings', label: 'Settings', icon: 'fa-gear' },
            ].map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => changePage(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                    isActive
                      ? 'bg-[#E31837] text-white font-bold shadow-xs'
                      : isDarkMode
                      ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'
                  }`}
                >
                  <i className={`fa-solid ${item.icon} w-5 text-lg`}></i> {item.label}
                </button>
              );
            })}

            {canManageUsers && (
              <button
                onClick={() => changePage('userManagement')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                  activePage === 'userManagement'
                    ? 'bg-[#E31837] text-white font-bold shadow-xs'
                    : isDarkMode
                    ? 'text-amber-400 hover:bg-slate-800/80 hover:text-amber-300 font-medium'
                    : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-medium'
                }`}
              >
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Supplier Evaluation Dashboard
              </h1>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Monthly supplier performance, quality and reliability across key criteria.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              
              <div className="flex items-center gap-2">
                <input 
                  type="month"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className={`flex items-center gap-2 border px-3 py-2.5 rounded-lg text-sm font-medium shadow-xs outline-none cursor-pointer transition-colors ${
                    isDarkMode ? 'bg-[#1E293B] border-slate-700 text-slate-300 focus:border-slate-500' : 'bg-white border-slate-200 text-slate-600 focus:border-blue-400'
                  }`}
                />
                {filterDate && (
                  <button
                    onClick={() => setFilterDate('')}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer ${
                      isDarkMode ? 'bg-[#1E293B] border border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Tampilkan semua periode"
                  >
                    Semua Periode
                  </button>
                )}
              </div>
              
              {/* === TOMBOL CLEAR DATA DROPDOWN === */}
              {isAdmin && (
              <div className="relative" ref={clearDropdownRef}>
                <button
                  onClick={() => setShowClearDropdown(!showClearDropdown)}
                  disabled={isClearing || rawEvaluations.length === 0}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer ${
                    isClearing || rawEvaluations.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60' : 
                    isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isClearing ? 'Clearing...' : 'Clear Data'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showClearDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showClearDropdown && (
                  <div className={`absolute right-0 mt-2 w-48 rounded-xl shadow-lg border overflow-hidden z-50 ${
                    isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'
                  }`}>
                    <div className="py-1">
                      <div className={`px-4 py-2 text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Hapus data untuk:
                      </div>
                      <button onClick={() => handleClearData('today')} className={`w-full text-left px-4 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                        Hari Ini
                      </button>
                      <button onClick={() => handleClearData('1_week')} className={`w-full text-left px-4 py-2 text-sm transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                        1 Minggu Terakhir
                      </button>
                      <button onClick={() => handleClearData('1_month')} className={`w-full text-left px-4 py-2 text-sm transition-colors text-red-500 ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-red-50'}`}>
                        1 Bulan Terakhir
                      </button>
                    {/* Garis pemisah */}
                          <div className={`my-1 border-t ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}></div>
                          
                          {/* Tombol Clear All */}
                          <button onClick={() => handleClearData('all')} className={`w-full text-left px-4 py-2 text-sm font-semibold transition-colors text-red-500 ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-red-50'}`}>
                            Semua Waktu (All Time)
                          </button>
                        </div>
                      </div>                )}
              </div>
              )}

              {isAdmin && (
              <label className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer ${
                  isUploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}>
                {isUploading ? <Database className="w-5 h-5 animate-pulse" /> : <Upload className="w-5 h-5" />}
                <span>{isUploading ? 'Syncing to DB...' : 'Import Excel Data'}</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
              )}

            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((card, idx) => {
              const Icon = card.icon;
              return (
                <div key={idx} className={`p-4 rounded-xl border shadow-xs flex items-center justify-between transition-colors ${
                  isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-slate-200/80'
                }`}>
                  <div className="space-y-1">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{card.title}</p>
                    <span className={`font-bold ${card.isText && String(card.value ?? '').length > 10 ? 'text-sm' : 'text-2xl'} ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}>
                      {card.value ?? '-'}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'} ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              );
            })}
          </div>

          {supplierData.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`p-5 rounded-xl border shadow-xs flex flex-col transition-colors ${
                  isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <h3 className={`text-sm font-bold mb-4 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Overall Weighted Score (/5)
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[260px] pr-2">
                    {supplierData.map((sup, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className={`truncate max-w-[200px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{sup.name}</span>
                          <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{sup.score}</span>
                        </div>
                        <div className={`w-full h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(sup.score / 5) * 100}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`p-5 rounded-xl border shadow-xs flex flex-col transition-colors ${
                  isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Average Score by Criterion
                    </h3>
                    <div className="flex items-center gap-3 text-[11px] font-medium">
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-700 rounded-xs"></span><span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Top Supplier</span></div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-200 rounded-xs"></span><span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Overall Average</span></div>
                    </div>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.criteriaStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="criterion" tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }} />
                        <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0', color: isDarkMode ? '#ffffff' : '#0f172a' }} />
                        <Bar dataKey="topSupplier" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="average" fill="#BFDBFE" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`p-5 rounded-xl border shadow-xs flex flex-col transition-colors ${
                  isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <h3 className={`text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Supplier Count by Rating Tier
                  </h3>
                  <div className="flex items-center justify-between flex-1">
                    <div className="w-[180px] h-[180px] relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartData.ratingTier} innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
                            {chartData.ratingTier.map((entry, idx) => (<Cell key={`cell-${idx}`} fill={entry.color} />))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute text-center">
                        <p className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{kpi.total}</p>
                        <p className="text-[10px] text-slate-400">Total Suppliers</p>
                      </div>
                    </div>
                    <div className="space-y-2 flex-1 ml-6">
                      {chartData.ratingTier.map((tier, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-medium">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tier.color }}></span>
                            <span className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>{tier.name} ({tier.value})</span>
                          </div>
                          <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{tier.percentage}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-xl border shadow-xs flex flex-col transition-colors ${
                  isDarkMode ? 'bg-[#182238] border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <h3 className={`text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Top Supplier Profile: <span className="text-blue-500">{kpi.topSupplier}</span>
                  </h3>
                  <div className="h-[200px] w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData.topSupplierRadar}>
                        <PolarGrid stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: isDarkMode ? '#94a3b8' : '#64748b' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} />
                        <Radar name={kpi.topSupplier} dataKey="score" stroke="#2563EB" fill="#3B82F6" fillOpacity={0.4} />
                        <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0', color: isDarkMode ? '#ffffff' : '#0f172a' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className={`w-full flex flex-col items-center justify-center py-20 border border-dashed rounded-xl shadow-xs transition-colors ${
              isDarkMode ? 'bg-[#182238] border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                isDarkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-500'
              }`}>
                <Database className="w-8 h-8" />
              </div>
              <h3 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                Tidak Ada Data Evaluasi
              </h3>
              <p className={`text-sm mb-6 text-center max-w-md ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Silahkan klik tombol <strong>"Import Excel Data"</strong> di atas untuk memasukkan data evaluasi supplier berdasarkan format yang ditentukan, lalu data akan disinkronkan ke Database.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}