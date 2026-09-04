import React, { useState, useEffect, useRef } from 'react';
import { useRole } from '../context/RoleContext';

export default function Settings({ changePage, onLogout }) {
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  const [showProfileCard, setShowProfileCard] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mengambil preferensi tema dari localStorage agar tidak reset saat pindah halaman
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : true;
  });

  const profileRef = useRef(null);

  // Menyimpan perubahan mode warna ke localStorage setiap kali isDarkMode diubah
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    }
  };

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
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
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{user?.email || '-'}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-[#004797]'}`}>{user?.role || '-'}</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button onClick={() => setShowProfileCard(false)} className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'}`}>
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

      <div className="flex flex-1 overflow-hidden">
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
            <button onClick={() => changePage?.('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button onClick={() => changePage?.('userManagement')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-400 rounded-xl hover:bg-slate-800/80 hover:text-amber-300 transition-colors text-left cursor-pointer">
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex items-center gap-4 mb-8">
             <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-sm border ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-red-500 border-red-100'}`}>
                <i className="fa-solid fa-gear"></i>
             </div>
             <div>
               <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Pengaturan</h1>
               <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Kelola preferensi akun kamu.</p>
             </div>
          </div>

          <div className={`max-w-4xl rounded-2xl border shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
             <div className={`p-6 flex items-center justify-between border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
               <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-red-50 text-red-500'}`}>
                    <i className="fa-regular fa-user"></i>
                 </div>
                 <div>
                   <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Akun</h2>
                   <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Informasi akun dan akses sistem.</p>
                 </div>
               </div>
               <button className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer border ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
                 <i className="fa-solid fa-pen"></i> Edit Akun
               </button>
             </div>

             <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                  <div>
                    <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Username</p>
                    <p className={`font-bold ${isDarkMode ? 'text-slate-100' : 'text-[#004797]'}`}>{user?.username || 'admin'}</p>
                  </div>
                  <div>
                    <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Email</p>
                    <p className={`font-bold ${isDarkMode ? 'text-slate-100' : 'text-[#004797]'}`}>{user?.email || 'admin@detpakpackaging.com'}</p>
                  </div>
                  <div>
                    <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Role</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-red-100 text-red-500'}`}>{user?.role || 'Super Admin'}</span>
                  </div>
                </div>

                <div className={`pt-6 flex items-center justify-between border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                   <div className="flex items-center gap-3">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-red-50 text-red-500'}`}>
                        <i className="fa-regular fa-calendar"></i>
                     </div>
                     <div>
                        <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-[#004797]'}`}>Terakhir Ganti Password</p>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>20 Mei 2024, 10:45 WIB</p>
                     </div>
                   </div>
                   <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border ${isDarkMode ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' : 'bg-emerald-50 text-emerald-500 border-emerald-100'}`}>
                     <i className="fa-regular fa-circle-check"></i> Aktif
                   </div>
                </div>

                <div className={`pt-6 flex items-center justify-between border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-500'}`}>
                        <i className={isDarkMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun'}></i>
                     </div>
                     <div>
                      <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-[#004797]'}`}>Tampilan Gelap</p>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Ganti tema tampilan aplikasi.</p>
                     </div>
                  </div>
                  <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors border ${isDarkMode ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700' : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'}`}
                  >
                    {isDarkMode ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
             </div>
          </div>

          {canManageUsers && (
            <div className={`max-w-4xl mt-6 p-4 rounded-xl flex items-center justify-between gap-4 border ${isDarkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-red-50/50 border-red-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${isDarkMode ? 'bg-slate-800 text-slate-400 border-slate-600' : 'bg-white text-red-400 border-red-200'}`}>
                  <i className="fa-solid fa-shield-halved text-sm"></i>
                </div>
                <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                  Untuk mengelola user lain, ubah role, reset password, hapus, atau nonaktifkan akun, silakan ke menu
                </p>
              </div>
              <button onClick={() => changePage?.('userManagement')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shrink-0 transition-colors border ${isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}`}>
                User Management <i className="fa-solid fa-arrow-right text-xs"></i>
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}