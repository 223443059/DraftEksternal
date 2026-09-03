import React, { useState, useEffect, useRef } from 'react';
import { useRole } from '../context/RoleContext';

const API_BASE = 'http://localhost:5000/api/users';

const ROLES = [
  { id: 1, name: 'Admin' },
  { id: 2, name: 'User' },
];

const emptyCreateForm = { username: '', email: '', password: '', role_id: 2 };

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

  // Timer Effect
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
  const [showClearModal, setShowClearModal] = useState(false); // State Modal Clear All

  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [roleEditValue, setRoleEditValue] = useState('');
  const [pwEditValue, setPwEditValue] = useState('');

  const canManage = hasPermission('manage_users');

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/all`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal mengambil data user');
      
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
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

  const handleDelete = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Yakin mau hapus user ${selectedUser.username}?`)) return;
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

  // Handler Hapus Semua Data Operasional (Kecuali Akun User/Superadmin)
  const handleClearAllData = async () => {
    setError('');
    try {
      const res = await fetch('http://localhost:5000/api/system/clear-data', {
        method: 'DELETE',
        headers: authHeaders(),
      });

      // Cek apakah responnya JSON atau HTML error
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Endpoint backend belum dibuat atau URL server salah.');
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal membersihkan data operasional');
      }

      Object.keys(localStorage).forEach((key) => {
        if (key !== 'token' && key !== 'theme') {
          localStorage.removeItem(key);
        }
      });

      setShowClearModal(false);
      flash('Seluruh data modul berhasil dibersihkan!');
    } catch (err) {
      setError(err.message);
      setShowClearModal(false);
    }
  };

  const getRoleBadgeClass = (roleName) => {
    const role = (roleName || '').toLowerCase();
    if (role.includes('admin')) return 'bg-red-100 text-red-600';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* HEADER */}
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
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => changePage?.('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => changePage?.('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage?.('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage?.('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage?.('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            
            <button onClick={() => changePage?.('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManage && (
              <button onClick={() => changePage?.('userManagement')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 relative">
          <div className="max-w-7xl mx-auto">
            {/* Alert / Notice */}
            {notice && (
              <div className="mb-6 p-4 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-sm font-medium shadow-sm">
                {notice}
              </div>
            )}
            {error && (
              <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-xl text-sm font-medium shadow-sm">
                {error}
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
                          onClick={handleDelete}
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
                      {/* Tombol Clear All Data */}
                      <button
                        onClick={() => setShowClearModal(true)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold px-4 py-3 rounded-2xl transition-all text-sm cursor-pointer flex items-center gap-2"
                        title="Bersihkan semua data user"
                      >
                        <i className="fa-solid fa-trash-can"></i> Clear All Data
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
                              <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                                (u.role || '').toLowerCase().includes('admin') 
                                  ? 'bg-red-100 text-red-600' 
                                  : (isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-[#F1F3F5] text-[#5C6672]')
                              }`}>
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

      {/* ================= MODAL 4: CONFIRM CLEAR ALL DATA ================= */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-3xl w-full max-w-md p-6 shadow-2xl border animate-in fade-in zoom-in duration-150 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-2xl mb-4 border border-red-500/20">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                Konfirmasi Hapus Data
              </h3>
              
              <p className={`text-sm mb-6 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Apakah kamu yakin ingin membersihkan seluruh data operasional (Suppliers, PO, Report, dll)? <br/>
                <span className="font-bold text-emerald-500 mt-2 block">
                  Catatan: Data di modul lain akan dikosongkan, namun akun User & Superadmin tidak akan terhapus.
                </span>
              </p>

              <div className="flex items-center justify-end gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  className={`w-1/2 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="w-1/2 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md transition-colors cursor-pointer"
                >
                  Ya, Hapus Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}