import React, { useState, useRef, useEffect } from 'react';

export default function Settings({ changePage, onLogout }) {
  // === 1. LOCAL STORAGE STATE MANAGEMENT ===
  const [profile, setProfile] = useState(() => {
    const savedProfile = localStorage.getItem('appProfile');
    return savedProfile ? JSON.parse(savedProfile) : {
      name: 'Ladeu Intern',
      email: 'intern@ladeu.com',
      role: 'Procurement Admin'
    };
  });

  const [company, setCompany] = useState(() => {
    const savedCompany = localStorage.getItem('appCompany');
    return savedCompany ? JSON.parse(savedCompany) : {
      companyName: 'Intern Ladeu Tbk.',
      address: 'Jl. Jend. Sudirman No. 45, Jakarta',
      taxId: '01.234.567.8-091.000'
    };
  });

  const [preferences, setPreferences] = useState(() => {
    const savedPrefs = localStorage.getItem('appPreferences');
    return savedPrefs ? JSON.parse(savedPrefs) : {
      emailNotif: true,
      browserNotif: false
    };
  });

  const [isSaving, setIsSaving] = useState(false);

  // === 2. DARK MODE & HEADER STATES ===
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const profileRef = useRef(null);

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour12: true });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // === 3. HANDLERS ===
  const handleNavigate = (page) => {
    if (changePage) changePage(page);
  };

  const handleLogout = () => {
    setShowProfileCard(false);
    if (onLogout) {
      onLogout();
    } else if (changePage) {
      changePage('login');
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleCompanyChange = (e) => {
    const { name, value } = e.target;
    setCompany(prev => ({ ...prev, [name]: value }));
  };

  const togglePreference = (key) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      localStorage.setItem('appProfile', JSON.stringify(profile));
      localStorage.setItem('appCompany', JSON.stringify(company));
      localStorage.setItem('appPreferences', JSON.stringify(preferences));
      setIsSaving(false);
      alert('Settings saved successfully!');
    }, 800);
  };

  const handleClearData = () => {
    const confirmDelete = window.confirm("WARNING: Are you sure you want to delete ALL Purchase Order data and Settings? This action cannot be undone.");
    if (confirmDelete) {
      localStorage.clear(); 
      alert('All data has been successfully cleared! The application will reset.');
      window.location.reload(); 
    }
  };

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      {/* HEADER SECTION */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        {/* Row 1: Primary Navbar */}
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
            <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => handleNavigate('dashboard')}>
              <span className={`text-[36px] font-bold tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-[#004797]'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Det<span className="border-b-[4px] border-[#E31837] pb-1">pak</span>
              </span>
            </div>
            
            <nav className="hidden md:flex items-center h-full gap-3 text-lg font-semibold">
              <button onClick={() => handleNavigate('dashboard')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Dashboard</button>
              <button onClick={() => handleNavigate('marketPrice')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Market Price</button>
              <button onClick={() => handleNavigate('supplierEvaluation')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Supplier Evaluation</button>
              <button onClick={() => changePage?.('otd')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>OTD Performance</button>

            </nav>
          </div>

          <div className="flex items-center gap-6">
            {/* Dark Mode Toggle Button */}
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
                    <button onClick={() => { setShowProfileCard(false); handleNavigate('settings'); }} className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'}`}>
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

        {/* Row 2: Header Subtitle */}
        <div className={`px-6 py-5 flex flex-col justify-center ${isDarkMode ? 'bg-[#0F172A]' : 'bg-white'}`}>
          <h2 className="text-[#DE5B54] text-[26px] font-bold tracking-[0.08em] uppercase mb-1.5 leading-none" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Packaging
          </h2>
          <p className={`text-[14px] font-bold tracking-[0.1em] uppercase leading-none ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Group <span className={`mx-1.5 font-light ${isDarkMode ? 'text-slate-700' : 'text-gray-300'}`}>|</span> PT Detpak Indonesia
          </p>
        </div>
      </header>

      {/* MAIN WRAPPER */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => handleNavigate('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => handleNavigate('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => handleNavigate('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => handleNavigate('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => handleNavigate('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            {/* Active 'Settings' Menu Button */}
            <button onClick={() => handleNavigate('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Settings</h1>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Manage your account and system preferences here.</p>
              </div>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <><i className="fa-solid fa-circle-notch fa-spin"></i> Saving...</>
                ) : (
                  <><i className="fa-solid fa-floppy-disk"></i> Save Changes</>
                )}
              </button>
            </div>

            <div className="space-y-6">
              
              {/* SECTION 1: USER PROFILE */}
              <div className={`rounded-2xl border shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className={`border-b px-6 py-4 ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                  <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>User Profile</h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-6 mb-6">
                    <div className={`w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center text-2xl font-bold border-4 shadow-xs uppercase ${isDarkMode ? 'border-slate-800' : 'border-white'}`}>
                      {profile.name ? profile.name.substring(0, 2) : 'LI'}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Full Name</label>
                      <input 
                        type="text" name="name" value={profile.name} onChange={handleProfileChange}
                        className={`w-full border rounded-lg p-2.5 text-sm outline-none transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`} 
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Email Address</label>
                      <input 
                        type="email" name="email" value={profile.email} onChange={handleProfileChange}
                        className={`w-full border rounded-lg p-2.5 text-sm outline-none transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`} 
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Role</label>
                      <input 
                        type="text" name="role" value={profile.role} readOnly
                        className={`w-full border rounded-lg p-2.5 text-sm outline-none cursor-not-allowed ${isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`} 
                      />
                      <p className="text-xs text-gray-400 mt-1">Role cannot be changed (Admin access permissions).</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: COMPANY INFORMATION */}
              <div className={`rounded-2xl border shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className={`border-b px-6 py-4 ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                  <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>Company Information</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Company Name</label>
                      <input 
                        type="text" name="companyName" value={company.companyName} onChange={handleCompanyChange}
                        className={`w-full border rounded-lg p-2.5 text-sm outline-none transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`} 
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Full Address</label>
                      <textarea 
                        name="address" rows="2" value={company.address} onChange={handleCompanyChange}
                        className={`w-full border rounded-lg p-2.5 text-sm outline-none transition-colors resize-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`} 
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Tax ID / NPWP</label>
                      <input 
                        type="text" name="taxId" value={company.taxId} onChange={handleCompanyChange}
                        className={`w-full border rounded-lg p-2.5 text-sm outline-none transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:border-red-500' : 'bg-white border-gray-300 text-gray-800 focus:border-red-500'}`} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: SYSTEM PREFERENCES */}
              <div className={`rounded-2xl border shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className={`border-b px-6 py-4 ${isDarkMode ? 'bg-[#0F172A]/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                  <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>Preferences & Notifications</h2>
                </div>
                <div className="p-6 space-y-4">
                  {/* Toggle 1 */}
                  <div className={`flex items-center justify-between pb-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div>
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>Email Notifications</p>
                      <p className="text-xs text-gray-400 mt-0.5">Receive daily PO reports via email.</p>
                    </div>
                    <button 
                      onClick={() => togglePreference('emailNotif')}
                      className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none cursor-pointer ${preferences.emailNotif ? 'bg-red-600' : (isDarkMode ? 'bg-slate-700' : 'bg-gray-300')}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-xs transition-transform duration-300 ${preferences.emailNotif ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                  </div>

                  {/* Toggle 2 */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>Browser Notifications</p>
                      <p className="text-xs text-gray-400 mt-0.5">Show desktop pop-ups.</p>
                    </div>
                    <button 
                      onClick={() => togglePreference('browserNotif')}
                      className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none cursor-pointer ${preferences.browserNotif ? 'bg-red-600' : (isDarkMode ? 'bg-slate-700' : 'bg-gray-300')}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-xs transition-transform duration-300 ${preferences.browserNotif ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 4: DANGER ZONE */}
              <div className={`border rounded-2xl shadow-xs overflow-hidden ${isDarkMode ? 'bg-red-950/20 border-red-900/50' : 'bg-red-50/60 border-red-200'}`}>
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-red-500 mb-1">Danger Zone</h2>
                    <p className={`text-xs ${isDarkMode ? 'text-red-400/80' : 'text-red-600'}`}>Deletes all Purchase Order history and settings. This cannot be undone.</p>
                  </div>
                  <button 
                    onClick={handleClearData}
                    className="shrink-0 bg-red-600 hover:bg-red-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Clear All Data
                  </button>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}