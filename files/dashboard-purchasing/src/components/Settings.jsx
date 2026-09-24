import React, { useState, useEffect, useRef } from 'react';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../hooks/useTheme';
import AppLayout from './AppLayout'; // header + sidebar + bar menu atas (sama seperti Dashboard)

// Tambahkan activePage = 'settings' pada props
export default function Settings({ changePage, onLogout, activePage = 'settings' }) {
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  // Tema (terang/gelap), jam, profil & logout sekarang diurus AppLayout + useTheme (sama seperti Dashboard)
  const [isDarkMode, setIsDarkMode] = useTheme();

  return (
    <AppLayout
      activePage="settings"
      changePage={changePage}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
    >
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
    </AppLayout>
  );
}