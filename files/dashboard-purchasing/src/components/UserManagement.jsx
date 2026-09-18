import React, { useState, useEffect, useRef } from 'react';
import { useRole } from '../context/RoleContext';

// ✅ Path relatif — otomatis diteruskan ke backend lewat proxy Vite (/api -> 10.62.11.92:5000)
const API_BASE = '/api/users';

const ROLES = [
  { id: 1, name: 'Admin' },
  { id: 2, name: 'User' },
];

const emptyCreateForm = { username: '', email: '', password: '', role_id: 2 };

// Helper function untuk memberi warna pada badge role
const getRoleBadgeClass = (role) => {
  if (!role) return 'bg-gray-100 text-gray-600';
  const r = role.toLowerCase();
  if (r.includes('admin')) return 'bg-red-100 text-red-600';
  return 'bg-[#F1F3F5] text-[#5C6672]';
};

export default function UserManagement({ changePage, onLogout, user: propUser }) {
  // === LAYOUT STATES ===
  const profileRef = useRef(null);
  const [showProfileCard, setShowProfileCard] = useState(false);
  
  // Sinkronisasi tema dengan Settings
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : true;
  });
  
  const [currentTime, setCurrentTime] = useState(new Date());

  // Default user jika tidak dikirim dari prop
  const user = propUser || { name: 'Admin', email: 'admin@detpak.com', role: 'Administrator' };

  // Timer Effect (Berjalan setiap 1 detik)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  // Theme Effect tersinkronisasi dengan Settings
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Click Outside Profile Card
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
    if (typeof onLogout === 'function') {
      onLogout();
    } else if (changePage) {
      changePage('login');
    }
  };

  const getInitials = (name) => {
    if (!name) return 'AD';
    return name.substring(0, 2).toUpperCase();
  };

  // === USER MANAGEMENT STATES ===
  const { hasPermission } = useRole();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedUser, setSelectedUser] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Modal Clear Data & Checkbox States
  const [showClearModal, setShowClearModal] = useState(false); 
  const [dataToClear, setDataToClear] = useState({
    suppliers: false,
    purchaseOrders: false,
    analytics: false,
    report: false
  });

  const [isLoadingClear, setIsLoadingClear] = useState(false); 
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [roleEditValue, setRoleEditValue] = useState('');
  const [pwEditValue, setPwEditValue] = useState('');

  const canManage = hasPermission('manage_users');

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  // ✅ FIX CORS: credentials: 'include' telah dihapus dari request fetch
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('[UserManagement] Fetching users from:', `${API_BASE}/all`);
      const token = localStorage.getItem('token');
      console.log('[UserManagement] Token exists:', !!token);
      
      const res = await fetch(`${API_BASE}/all`, { 
        headers: authHeaders()
      });
      
      console.log('[UserManagement] Response status:', res.status);
      
      const data = await res.json();
      console.log('[UserManagement] Response data:', data);
      
      if (!res.ok) {
        const errorMsg = data.message || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(errorMsg);
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Gagal mengambil data user');
      }
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Format data tidak valid');
      }
      
      console.log('[UserManagement] Users loaded:', data.data.length);
      setUsers(data.data);
      
      if (data.data.length > 0) {
        setSelectedUser((prev) => {
          if (!prev) return data.data[0];
          const found = data.data.find((u) => u.id === prev.id);
          return found || data.data[0];
        });
      } else {
        setSelectedUser(null);
      }
    } catch (err) {
      console.error('[UserManagement] Error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Gunakan useRef sebagai gembok agar proses fetch hanya berjalan 1 KALI
  const hasFetched = useRef(false);

  useEffect(() => {
    if (canManage && !hasFetched.current) {
      hasFetched.current = true;
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  // --- Handlers ---
  const handleCreateChange = (e) => setCreateForm({ ...createForm, [e.target.name]: e.target.value });

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_BASE}/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...createForm, role_id: Number(createForm.role_id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal membuat user');
      
      setCreateForm(emptyCreateForm);
      setShowCreateModal(false);
      flash('User berhasil dibuat');
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const openRoleModal = () => {
    if (!selectedUser) return;
    const current = ROLES.find((r) => r.name === selectedUser.role);
    setRoleEditValue(current ? current.id : ROLES[0].id);
    setShowRoleModal(true);
  };

  const submitRoleEdit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_BASE}/update-role`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ userId: selectedUser.id, role_id: Number(roleEditValue) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal mengubah role');
      
      setShowRoleModal(false);
      flash('Role berhasil diubah');
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const openPwModal = () => {
    if (!selectedUser) return;
    setPwEditValue('');
    setShowPwModal(true);
  };

  const submitPwEdit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pwEditValue || pwEditValue.length < 6) {
      setError('Password baru minimal 6 karakter');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ userId: selectedUser.id, newPassword: pwEditValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal reset password');
      
      setShowPwModal(false);
      flash('Password berhasil direset');
    } catch (err) {
      setError(err.message);
    }
  };

  const openDeleteModal = () => {
    if (!selectedUser) return;
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setShowDeleteModal(false);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/delete`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ userId: selectedUser.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal menghapus user');
      
      flash('User berhasil dihapus');
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handler Checkbox Data Clear
  const handleClearDataChange = (e) => {
    const { name, checked } = e.target;
    setDataToClear((prev) => ({ ...prev, [name]: checked }));
  };

  // Handler Hapus Data Spesifik
  const handleClearSelectedData = async () => {
    setError('');
    setIsLoadingClear(true); 
    
    const selectedModules = Object.keys(dataToClear).filter(key => dataToClear[key]);
    
    if (selectedModules.length === 0) {
      setIsLoadingClear(false);
      setError("Pilih minimal satu data yang ingin dibersihkan!");
      return;
    }
   
    try {
      console.log('🔄 Mengirim request delete ke backend...', { modules: selectedModules });
   
      const res = await fetch('/api/system/clear-data', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ modules: selectedModules }), 
      });
   
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Endpoint backend belum dibuat atau URL server salah.');
      }
   
      const data = await res.json();
   
      if (!res.ok) {
        throw new Error(data.message || `HTTP Error: ${res.status}`);
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Gagal membersihkan data operasional');
      }
   
      // Menutup modal jika berhasil
      setShowClearModal(false);
      
      setDataToClear({
        suppliers: false,
        purchaseOrders: false,
        analytics: false,
        report: false
      });
      
      flash('Data operasional terpilih berhasil dibersihkan!');
   
    } catch (err) {
      console.error('❌ Error saat clear data:', err);
      setError(`Gagal membersihkan data: ${err.message}`);
    } finally {
      setIsLoadingClear(false); 
    }
  };

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* HEADER */}
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
              <button onClick={() => changePage?.('marketPrice')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Market Price</button>
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
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>
                {user?.name || user?.username || 'Admin'} <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>

              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      {getInitials(user?.name || user?.username)}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user?.name || user?.username || '-'}</h4>
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{user?.email || '-'}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-[#004797]'}`}>{user?.role || '-'}</span>
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

      {/* BODY KONTEN */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => changePage?.('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}>
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => changePage?.('suppliers')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}>
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage?.('purchaseOrders')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}>
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage?.('analytics')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}>
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage?.('report')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}>
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            
            <button onClick={() => changePage?.('settings')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}>
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManage && (
              <button onClick={() => changePage?.('userManagement')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#004797] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
      <i className="fa-solid fa-users w-5 text-lg"></i>User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 relative">
          <div className="max-w-7xl mx-auto">
            
            {/* Global Success / Notice Alert */}
            {notice && (
              <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm ${
                isDarkMode 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <i className="fa-solid fa-circle-check mt-1 text-lg"></i>
                <div>
                  <p className="font-bold">Sukses</p>
                  <p className="text-sm mt-0.5">{notice}</p>
                </div>
              </div>
            )}

            {/* Global Error Alert */}
            {error && !showClearModal && (
              <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm ${
                isDarkMode 
                  ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <i className="fa-solid fa-circle-exclamation mt-1 text-lg"></i>
                <div>
                  <p className="font-bold">Error</p>
                  <p className="text-sm mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {!canManage ? (
              <div className="flex items-center justify-center h-64 text-red-500 font-semibold text-lg bg-white rounded-2xl shadow-sm">
                Kamu tidak punya akses ke halaman ini.
              </div>
            ) : loading ? (
              <div className="flex justify-center items-center h-64 text-slate-500 font-medium bg-white rounded-2xl shadow-sm">
                Memuat data user...
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* ================= PANEL KIRI: DETAIL USER AKTIF ================= */}
                <div className={`lg:col-span-4 rounded-[2rem] p-8 shadow-sm border flex flex-col items-center text-center transition-colors ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-slate-100'}`}>
                  {selectedUser ? (
                    <>
                      <div className="w-28 h-28 rounded-full bg-[#EF4444] text-white flex items-center justify-center font-bold text-5xl shadow-md my-2">
                        {selectedUser.username ? selectedUser.username.charAt(0).toUpperCase() : 'U'}
                      </div>

                      <h3 className={`text-2xl font-bold mt-4 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                        {selectedUser.username}
                      </h3>
                      <p className="text-slate-400 text-sm mt-1">{selectedUser.email}</p>

                      <span className={`mt-4 px-5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${getRoleBadgeClass(selectedUser.role)}`}>
                        {selectedUser.role || 'User'}
                      </span>

                      <div className="w-full mt-10 space-y-3.5">
                        <button
                          onClick={openRoleModal}
                          className="w-full py-3.5 px-4 bg-[#5B51D8] hover:bg-[#4338CA] text-white font-bold rounded-2xl shadow-sm transition-all cursor-pointer text-sm"
                        >
                          Edit Role
                        </button>
                        <button
                          onClick={openPwModal}
                          className="w-full py-3.5 px-4 bg-[#FFF9E6] hover:bg-[#FEF3C7] text-[#D99A29] font-bold rounded-2xl transition-all cursor-pointer text-sm"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={openDeleteModal}
                          className="w-full py-3.5 px-4 bg-[#FEECEB] hover:bg-[#FEE2E2] text-[#E74C3C] font-bold rounded-2xl transition-all cursor-pointer text-sm"
                        >
                          Delete User
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-400 py-12">Pilih user dari daftar</div>
                  )}
                </div>

                {/* ================= PANEL KANAN: LIST EMPLOYEES ================= */}
                <div className={`lg:col-span-8 rounded-[2rem] p-8 shadow-sm border transition-colors ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-slate-100'}`}>
                  
                  {/* Header List + Tombol Aksi */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                      Employee & Access Rights List
                    </h2>
                    
                    <div className="flex items-center gap-3">
                      {/* Tombol Clear Data */}
                      <button
                        onClick={() => { setError(''); setShowClearModal(true); }}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold px-4 py-3 rounded-2xl transition-all text-sm cursor-pointer flex items-center gap-2"
                        title="Bersihkan data operasional"
                      >
                        <i className="fa-solid fa-trash-can"></i> Clear Data
                      </button>

                      {/* Tombol Add New User */}
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-[#5B51D8] hover:bg-[#4338CA] text-white font-bold px-6 py-3 rounded-2xl shadow-sm transition-all text-sm cursor-pointer shrink-0"
                      >
                        Add New User
                      </button>
                    </div>
                  </div>

                  {/* List Cards */}
                  <div className="space-y-4">
                    {users.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">Belum ada user terdaftar.</div>
                    ) : (
                      users.map((u) => {
                        const isSelected = selectedUser?.id === u.id;
                        return (
                          <div
                            key={u.id}
                            onClick={() => setSelectedUser(u)}
                            className={`flex items-center justify-between p-4 px-5 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? (isDarkMode ? 'border-blue-500 bg-blue-900/20' : 'border-[#C7CEEA] bg-[#F0F2FA]')
                                : (isDarkMode ? 'border-slate-700 bg-[#0F172A] hover:bg-slate-800' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50')
                            }`}
                          >
                            <div className="flex items-center gap-5">
                              <div className="w-12 h-12 rounded-full bg-[#EF4444] text-white flex items-center justify-center font-bold text-lg shrink-0">
                                {u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <h4 className={`font-bold text-base leading-snug ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                                  {u.username}
                                </h4>
                                <p className="text-sm text-slate-400 mt-0.5">{u.email}</p>
                              </div>
                            </div>

                            <div>
                              <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${getRoleBadgeClass(u.role)}`}>
                                {u.role || 'User'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        </main>
      </div>

      {/* ================= MODAL 1: ADD NEW USER ================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-150 ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
            <h3 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              Add New User
            </h3>
            
            <form onSubmit={handleCreateSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Full Name</label>
                <input
                  name="username"
                  type="text"
                  value={createForm.username}
                  onChange={handleCreateChange}
                  required
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#5B51D8] focus:ring-1 focus:ring-[#5B51D8] transition-colors ${
                    isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Email Address</label>
                <input
                  name="email"
                  type="email"
                  value={createForm.email}
                  onChange={handleCreateChange}
                  required
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#5B51D8] focus:ring-1 focus:ring-[#5B51D8] transition-colors ${
                    isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Temporary Password</label>
                <input
                  name="password"
                  type="password"
                  value={createForm.password}
                  onChange={handleCreateChange}
                  required
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#5B51D8] focus:ring-1 focus:ring-[#5B51D8] transition-colors ${
                    isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Select Main Role</label>
                <select
                  name="role_id"
                  value={createForm.role_id}
                  onChange={handleCreateChange}
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#5B51D8] focus:ring-1 focus:ring-[#5B51D8] transition-colors ${
                    isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateForm(emptyCreateForm); }}
                  className={`px-6 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-[#F3F4F6] text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-[#5B51D8] text-white text-sm font-bold hover:bg-[#4338CA] transition-colors cursor-pointer"
                >
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: EDIT ROLE ================= */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-3xl w-full max-w-sm p-6 shadow-2xl ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
            <h3 className={`text-xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              Edit Role - {selectedUser.username}
            </h3>
            <form onSubmit={submitRoleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Pilih Role Baru</label>
                <select
                  value={roleEditValue}
                  onChange={(e) => setRoleEditValue(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#5B51D8] focus:ring-1 focus:ring-[#5B51D8] transition-colors ${
                    isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-[#F3F4F6] text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#5B51D8] text-white text-sm font-bold hover:bg-[#4338CA] cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: RESET PASSWORD ================= */}
      {showPwModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-3xl w-full max-w-sm p-6 shadow-2xl ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
            <h3 className={`text-xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              Reset Password - {selectedUser.username}
            </h3>
            <form onSubmit={submitPwEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Password Baru</label>
                <input
                  type="password"
                  placeholder="Min. 6 karakter"
                  value={pwEditValue}
                  onChange={(e) => setPwEditValue(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#5B51D8] focus:ring-1 focus:ring-[#5B51D8] transition-colors ${
                    isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPwModal(false)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-[#F3F4F6] text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#FFF9E6] text-[#D99A29] text-sm font-bold hover:bg-[#FEF3C7] cursor-pointer"
                >
                  Simpan Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: CONFIRM DELETE USER ================= */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-[1.5rem] w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in duration-150 ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-4 ${isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-500'}`}>
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                Hapus User?
              </h3>
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Yakin mau hapus user <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{selectedUser.username}</strong>? Tindakan ini tidak dapat dibatalkan.
              </p>

              <div className="flex gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-[#F3F4F6] text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 py-3 bg-[#E74C3C] hover:bg-[#C0392B] text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 5: CONFIRM CLEAR DATA ================= */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-[1.5rem] w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-150 ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
            <div className="flex flex-col">
              
              {/* Header: Ikon & Judul */}
              <div className={`flex items-center gap-4 mb-4 border-b pb-4 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-500'}`}>
                  <i className="fa-solid fa-trash-can"></i>
                </div>
                <h3 className={`text-[1.35rem] font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                  Pilih Data Untuk Dihapus
                </h3>
              </div>
              
              {/* TAMPILKAN ERROR MODAL DI SINI */}
              {error && (
                <div className={`mb-4 p-3 rounded-lg border ${
                  isDarkMode 
                    ? 'bg-red-500/20 border-red-500/50 text-red-400' 
                    : 'bg-red-50 border-red-200 text-red-600'
                }`}>
                  <div className="flex items-start gap-3">
                    <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
                    <div>
                      <p className="font-semibold">Peringatan</p>
                      <p className="text-sm mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Deskripsi */}
              <p className={`text-sm mb-5 leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Pilih modul operasional mana saja yang datanya ingin kamu kosongkan secara permanen:
              </p>

              {/* Checkboxes List */}
              <div className="space-y-3 mb-6">
                {[
                  { key: 'suppliers', label: 'Suppliers' },
                  { key: 'purchaseOrders', label: 'Purchase Orders' },
                  { key: 'analytics', label: 'Analytics' },
                  { key: 'report', label: 'Report' }
                ].map((item) => (
                  <label 
                    key={item.key} 
                    className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-all ${
                      isDarkMode 
                        ? 'border-slate-700 hover:bg-slate-800/50' 
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={item.key}
                      checked={dataToClear[item.key]}
                      onChange={handleClearDataChange}
                      className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] cursor-pointer"
                    />
                    <span className={`font-semibold text-base ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-4 w-full">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  className={`flex-1 py-3.5 rounded-xl text-[15px] font-bold transition-colors cursor-pointer ${
                    isDarkMode 
                      ? 'bg-slate-700 text-white hover:bg-slate-600' 
                      : 'bg-[#F3F4F6] text-slate-700 hover:bg-gray-200'
                  }`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleClearSelectedData}
                  disabled={isLoadingClear}
                  className={`flex-1 py-3.5 rounded-xl text-white text-[15px] font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                    isLoadingClear 
                      ? 'bg-[#DC2626]/60 cursor-not-allowed opacity-60'
                      : 'bg-[#DC2626] hover:bg-[#B91C1C]'
                  }`}
                >
                  {isLoadingClear ? (
                    <>
                      <i className="fa-solid fa-spinner animate-spin"></i>
                      Membersihkan...
                    </>
                  ) : (
                    'Bersihkan Data'
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}