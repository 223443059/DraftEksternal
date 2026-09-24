import React, { useState, useEffect, useRef } from 'react';
import { useRole } from '../context/RoleContext';

// =====================================================================
// AppLayout: header (logo, judul, gambar banner, jam, profil) + sidebar + bar menu atas
// dengan tampilan yang sama seperti halaman Dashboard. Isi halaman dimasukkan sebagai children.
//
// Props:
//   activePage   : 'dashboard' | 'suppliers' | 'purchaseOrders' | 'analytics' | 'report' | 'settings' | 'userManagement'
//   changePage   : fungsi pindah halaman (sama seperti di Dashboard)
//   onLogout     : fungsi logout (opsional)
//   isDarkMode / setIsDarkMode : dari useTheme()
//   submenu      : (opsional) sub-menu di bawah item sidebar aktif:
//                  { page, open, onToggle, items: [{ id, label, icon }], activeId, onSelect }
// =====================================================================

// Tulisan "Packaging A Better Tomorrow" di header (public/images/tagline.png & tagline-dark.png)
const TAGLINE_RATIO = 843 / 482;   // lebar / tinggi gambar
const TAGLINE_H = 0.7;             // tinggi tulisan = 70% tinggi baris header
const BANNER_TAG_GAP = 0;          // jarak gambar header -> tulisan di dalam satu kesatuan (px), 0 = menempel
const BANNER_MIN_GAP = 16;         // jarak minimum gambar -> judul, dan tulisan -> panel kanan (px)

export default function AppLayout({ activePage, changePage, onLogout, isDarkMode, setIsDarkMode, submenu, children }) {
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');
  // Foto profil user (isi salah satu field ini di data user; kalau kosong/gagal load -> inisial)
  const avatarSrc = user?.avatar || user?.photo || user?.photo_url || user?.avatar_url || user?.profile_picture || null;

  const [showProfileCard, setShowProfileCard] = useState(false);
  const profileRef = useRef(null);
  const headerRowRef = useRef(null);
  const otdRef = useRef(null);
  const supplierRef = useRef(null);
  const titleRef = useRef(null);
  const panelRef = useRef(null);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [bannerRatio, setBannerRatio] = useState({ light: 2.3, dark: 2.3 }); // rasio lebar/tinggi gambar header setelah dipangkas
  const [bannerImgs, setBannerImgs] = useState({ light: null, dark: null }); // bg6.png versi latar transparan (light & dark)
  const [bannerBox, setBannerBox] = useState({ left: 300, groupW: 400, width: 200, tagW: 130, h: 112, show: false }); // satu kesatuan gambar header + tulisan: dari kiri "Supplier Evaluation" sampai kanan "OTD Performance"
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Hapus latar terang bg6.png di browser, jadi menyatu dengan latar apa pun (tidak perlu file PNG terpisah)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const clamp = (v) => Math.min(1, Math.max(0, v));
        // Kalau PNG sudah punya transparansi asli, pakai alpha aslinya (tanpa konversi latar)
        const probe = document.createElement('canvas');
        probe.width = w; probe.height = h;
        const pctx = probe.getContext('2d');
        pctx.drawImage(img, 0, 0);
        const pd = pctx.getImageData(0, 0, w, h).data;
        let hasAlpha = false;
        for (let k = 3; k < pd.length; k += 4) { if (pd[k] < 250) { hasAlpha = true; break; } }
        const make = (dark) => {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, w, h);
          const px = data.data;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, aIn = px[i + 3] / 255;
              const a0 = Math.max(1 - r, 1 - g, 1 - b);
              let a, R = r, G = g, B = b;
              if (!dark) {
                a = clamp(((a0 - 0.16) / 0.84) * 1.15);
                const k = Math.max(a0, 1e-4);
                R = clamp(1 + (r - 1) / k); G = clamp(1 + (g - 1) / k); B = clamp(1 + (b - 1) / k);
              } else {
                a = clamp((a0 - 0.14) / 0.10);
                const inTagline = x / w > 0.752 && x / w < 0.952 && y / h > 0.03 && y / h < 0.31;
                if (inTagline && b > r + 0.03 && (r + g + b) / 3 < 0.55) { // tulisan biru tua -> putih kebiruan
                  R = 0.86; G = 0.92; B = 1; a = clamp(a0 * 1.6);
                }
              }
              // piksel hitam/gelap pekat (mis. bekas latar transparan yang tersimpan sebagai JPEG) dijadikan transparan
              a = Math.min(a, clamp((Math.max(r, g, b) - 0.12) / 0.16));
              if (hasAlpha) { a = aIn; if (!dark) { R = r; G = g; B = b; } } // PNG transparan asli: pakai apa adanya
              px[i] = R * 255; px[i + 1] = G * 255; px[i + 2] = B * 255; px[i + 3] = a * 255;
            }
          }
          ctx.putImageData(data, 0, 0);
          // pangkas margin transparan di sekeliling gambar, supaya saat diulang (repeat) tidak ada jarak kosong antar gambar
          let x0 = w, y0 = h, x1 = -1, y1 = -1;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (px[(y * w + x) * 4 + 3] > 40) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
              }
            }
          }
          if (x1 < x0 || y1 < y0) return { url: c.toDataURL('image/png'), ratio: w / h };
          const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
          const c2 = document.createElement('canvas');
          c2.width = cw; c2.height = ch;
          c2.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
          return { url: c2.toDataURL('image/png'), ratio: cw / ch };
        };
        const L = make(false), D = make(true);
        setBannerImgs({ light: L.url, dark: D.url });
        setBannerRatio({ light: L.ratio, dark: D.ratio });
      } catch (e) {
        setBannerFailed(true);
      }
    };
    img.onerror = () => setBannerFailed(true);
    img.src = '/images/bg6.png';
  }, []);
  const mainRef = useRef(null);
  const [scrollbarW, setScrollbarW] = useState(0); // lebar scrollbar area isi, dipakai agar tepi kanan header/menu = tepi kanan banner

  // Ukur lebar scrollbar area isi agar tepi kanan header/menu sejajar dengan tepi kanan banner
  useEffect(() => {
    const measure = () => {
      if (headerRowRef.current && titleRef.current && panelRef.current && otdRef.current && supplierRef.current) {
        const row = headerRowRef.current.getBoundingClientRect();
        const t = titleRef.current.getBoundingClientRect();
        const pr = panelRef.current.getBoundingClientRect();
        const o = otdRef.current.getBoundingClientRect();
        const sp = supplierRef.current.getBoundingClientRect();
        // gambar header + tulisan = satu kesatuan, sejajar dari kiri "Supplier Evaluation" sampai kanan "OTD Performance"
        // (dijaga tidak menabrak judul di kiri maupun panel kanan)
        const left = Math.max(Math.round(sp.left - row.left), Math.round(t.right - row.left + BANNER_MIN_GAP));
        const right = Math.round(Math.min(o.right, pr.left - BANNER_MIN_GAP) - row.left);
        const groupW = right - left;
        const tagW = Math.round(row.height * TAGLINE_H * TAGLINE_RATIO);
        const imgW = groupW - tagW - BANNER_TAG_GAP;
        setBannerBox({ left, groupW, tagW, h: Math.round(row.height), width: Math.max(0, imgW), show: imgW >= 120 });
      }
      if (mainRef.current) setScrollbarW(mainRef.current.offsetWidth - mainRef.current.clientWidth);
    };
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null; // panel kanan berubah lebar (nama user dimuat, dll)
    if (ro && panelRef.current) ro.observe(panelRef.current);
    if (ro && mainRef.current) ro.observe(mainRef.current); // ukur ulang bila area isi berubah ukuran
    window.addEventListener('resize', measure);
    const t1 = setTimeout(measure, 300); // ukur ulang setelah font/ikon selesai dimuat
    const t2 = setTimeout(measure, 1200); // dan setelah data selesai dimuat (scrollbar muncul)
    return () => { window.removeEventListener('resize', measure); clearTimeout(t1); clearTimeout(t2); if (ro) ro.disconnect(); };
  }, []);

  // Real-time Clock for Header
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

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

  // Sumber gambar header: hasil konversi canvas; kalau gagal dan mode terang, pakai file asli
  const bannerSrc = bannerImgs[isDarkMode ? 'dark' : 'light'] || (bannerFailed && !isDarkMode ? '/images/bg6.png' : null);

  // Ukuran tile gambar header: proporsi asli dijaga (tidak melar), jumlah ulangan dibulatkan agar pas memenuhi ruang tanpa sisa
  const bannerTileRatio = bannerRatio[isDarkMode ? 'dark' : 'light'] || 2.3;
  const bannerTiles = Math.max(1, Math.round(bannerBox.width / ((bannerBox.h || 112) * bannerTileRatio)));
  const bannerTileW = bannerBox.width / bannerTiles;

  // === ITEM SIDEBAR & BAR MENU ATAS (sama seperti Dashboard) ===
  const sidebarItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-border-all' },
    { key: 'suppliers', label: 'Suppliers', icon: 'fa-users' },
    { key: 'purchaseOrders', label: 'Purchase Orders', icon: 'fa-cart-shopping' },
    { key: 'analytics', label: 'Analytics', icon: 'fa-chart-line' },
    { key: 'report', label: 'Report', icon: 'fa-file-lines' },
    { key: 'settings', label: 'Settings', icon: 'fa-gear' },
  ];
  const topItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-house' },
    { key: 'marketPrice', label: 'Market Price', icon: 'fa-solid fa-chart-line' },
    { key: 'supplierEvaluation', label: 'Supplier Evaluation', icon: 'fa-solid fa-clipboard-list' },
    { key: 'otd', label: 'OTD Performance', icon: 'fa-regular fa-clock' },
  ];

  const sideBtnClass = (isActive) =>
    `w-full flex items-center px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
      isActive
        ? 'bg-[#004797] text-white font-bold'
        : isDarkMode
          ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium'
          : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 font-medium'
    }`;

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-gradient-to-br from-[#DCEEFB] via-[#EBF5FD] to-[#F6FAFE] text-gray-800'}`}>

      {/* MAIN HEADER */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-transparent border-transparent'}`}>
        <div ref={headerRowRef} style={{ paddingRight: 32 + scrollbarW }} className={`relative flex items-center justify-between h-28 border-b ${isDarkMode ? 'border-slate-800' : 'border-[#B4CFEA]/60'}`}>
          <div
            className={`w-64 h-full shrink-0 flex items-center justify-center cursor-pointer select-none`}
            onClick={() => changePage?.('dashboard')}
          >
            {/* Logo di tengah kolom (horizontal & vertikal) */}
            <img src="/images/logo.png" alt="Detpak Logo" className="h-16 w-auto object-contain relative z-10" />
          </div>

          <div ref={titleRef} className="relative z-10 flex flex-col justify-center shrink-0 pl-8">
            <h2 className={`text-[26px] font-bold tracking-tight leading-none mb-2 ${isDarkMode ? 'text-white' : 'text-[#0A2E6E]'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
              Detpak Smart Procurement Portal
            </h2>
            <p className={`text-[14px] font-medium leading-none ${isDarkMode ? 'text-blue-300' : 'text-[#2563EB]'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
              Simple Process <span className={`mx-2 font-light ${isDarkMode ? 'text-slate-600' : 'text-blue-300'}`}>|</span> Smart People <span className={`mx-2 font-light ${isDarkMode ? 'text-slate-600' : 'text-blue-300'}`}>|</span> Greater Value
            </p>
          </div>

          {/* Gambar header (bg6.png) + tulisan "Packaging A Better Tomorrow" (tagline.png) = satu kesatuan,
              sejajar dari kiri menu "Supplier Evaluation" sampai kanan menu "OTD Performance" */}
          <div
            className="hidden lg:block absolute top-0 z-0 h-full pointer-events-none select-none"
            style={{ left: bannerBox.left, width: bannerBox.groupW, display: bannerBox.show ? undefined : 'none' }}
          >
            {/* gambar header diulang (repeat-x) tepat memenuhi seluruh ruang, tetap di dalam tinggi header, menempel ke tulisan */}
            <div
              className="absolute left-0"
              style={{
                width: bannerBox.width,
                top: 0,
                height: '100%',
                backgroundImage: bannerSrc ? `url("${bannerSrc}")` : undefined,
                backgroundRepeat: 'repeat-x',
                backgroundSize: `${bannerTileW}px auto`,
                backgroundPosition: 'left bottom',
                mixBlendMode: !bannerImgs[isDarkMode ? 'dark' : 'light'] && !isDarkMode ? 'multiply' : undefined,
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 10%, #000 100%), linear-gradient(to bottom, #000 0%, #000 82%, transparent 100%)',
                maskImage: 'linear-gradient(to right, transparent 0%, #000 10%, #000 100%), linear-gradient(to bottom, #000 0%, #000 82%, transparent 100%)',
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
              }}
            ></div>
            <img
              src={isDarkMode ? '/images/tagline-dark.png' : '/images/tagline.png'}
              alt="Packaging A Better Tomorrow"
              className="absolute right-0 top-1/2 h-auto max-w-none"
              style={{ width: bannerBox.tagW, transform: 'translateY(-50%)' }}
            />
          </div>

          <div ref={panelRef} className={`relative z-10 ml-auto flex items-center gap-4 rounded-2xl pl-5 pr-4 py-2.5 ${isDarkMode ? '' : 'bg-white/70 backdrop-blur-sm shadow-sm'}`}>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`text-[22px] leading-none cursor-pointer transition-colors ${isDarkMode ? 'text-amber-400 hover:text-amber-300' : 'text-[#0A2E6E] hover:text-[#1D4ED8]'}`}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>

            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[15px] font-semibold tabular-nums ${isDarkMode ? 'bg-[#1E293B] text-slate-200 border border-slate-700' : 'bg-[#D6E8FA] text-[#1D4ED8]'}`}>
              <i className="fa-regular fa-clock text-[#2563EB]"></i>
              <span>{formattedTime}</span>
            </div>

            <span className={`w-px h-9 ${isDarkMode ? 'bg-slate-700' : 'bg-[#B4CFEA]'}`}></span>

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setShowProfileCard(!showProfileCard)}
                className={`flex items-center gap-3 transition-colors focus:outline-none cursor-pointer ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-[#0F172A] hover:text-[#0A2E6E]'}`}
              >
                {avatarSrc && !avatarFailed ? (
                  <img
                    src={avatarSrc}
                    alt={user?.username || 'Admin'}
                    onError={() => setAvatarFailed(true)}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-white/80 shadow-sm shrink-0"
                  />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-sm uppercase shrink-0 ring-2 ring-white/80 shadow-sm">
                    {(user?.username || 'AD').substring(0, 2)}
                  </span>
                )}
                <span className="font-bold text-[15px] leading-none">{user?.username || 'Admin'}</span>
                <i className={`fa-solid fa-chevron-down text-[11px] transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>

              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      {avatarSrc && !avatarFailed
                        ? <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} className="w-full h-full object-cover" />
                        : (user?.username || 'AD').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user?.username || 'Admin'}</h4>
                      <p className="text-sm text-gray-400 truncate">{user?.email || 'admin@detmoldpackaging.com'}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded">{user?.role || 'Administrator'}</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button onClick={() => { setShowProfileCard(false); changePage?.('settings'); }} className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-white/70'}`}>
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

      </header>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col pt-7 pb-6 shrink-0 z-20 transition-colors duration-200 ${
          isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white/50 border-[#B4CFEA] backdrop-blur-sm'
        }`}>
          <nav className="flex flex-col gap-2 px-4">
            {sidebarItems.map((item) => {
              const isActive = activePage === item.key;
              const hasSub = !!submenu && submenu.page === item.key;
              return (
                <div key={item.key}>
                  <button
                    onClick={() => {
                      if (hasSub && isActive) submenu.onToggle?.();
                      else changePage && changePage(item.key);
                    }}
                    className={`${sideBtnClass(isActive)} ${hasSub ? 'justify-between font-bold' : 'gap-3'}`}
                  >
                    <div className="flex items-center gap-3">
                      <i className={`fa-solid ${item.icon} w-5 text-lg`}></i> {item.label}
                    </div>
                    {hasSub && <i className={`fa-solid fa-chevron-${submenu.open ? 'down' : 'right'} text-xs transition-transform`}></i>}
                  </button>

                  {hasSub && isActive && submenu.open && (
                    <div className={`ml-4 pl-3 border-l-2 mt-1 flex flex-col gap-1 ${isDarkMode ? 'border-slate-700' : 'border-[#B4CFEA]'}`}>
                      {submenu.items.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => submenu.onSelect?.(sub.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left cursor-pointer ${
                            submenu.activeId === sub.id
                              ? isDarkMode ? 'text-slate-200 bg-slate-800/50' : 'text-gray-800 bg-white/70'
                              : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' : 'text-gray-500 hover:text-gray-800 hover:bg-white/70'
                          }`}
                        >
                          <i className={`fa-solid ${sub.icon} w-4 text-center`}></i> {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {canManageUsers && (
              <button
                onClick={() => changePage && changePage('userManagement')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                  activePage === 'userManagement'
                    ? 'bg-[#004797] text-white font-bold'
                    : isDarkMode
                      ? 'text-amber-400 hover:bg-slate-800/80 hover:text-amber-300 font-medium'
                      : 'text-amber-600 hover:bg-white/70 hover:text-amber-700 font-medium'
                }`}
              >
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* RIGHT COLUMN: TOP MENU BAR + MAIN CONTENT */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="pl-8 pt-4 shrink-0" style={{ paddingRight: 32 + scrollbarW }}>
            <nav className={`hidden md:flex items-stretch h-14 rounded-2xl overflow-hidden ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white/80 shadow-sm'}`}>
              {topItems.map((item, idx) => {
                const isActive = activePage === item.key;
                return (
                  <React.Fragment key={item.key}>
                    {idx > 0 && <span className={`self-center w-px h-8 ${isDarkMode ? 'bg-slate-700' : 'bg-[#B4CFEA]'}`}></span>}
                    <button
                      ref={item.key === 'otd' ? otdRef : item.key === 'supplierEvaluation' ? supplierRef : undefined}
                      onClick={() => changePage?.(item.key)}
                      className={isActive
                        ? 'bg-[#004797] text-white px-5 rounded-2xl flex items-center gap-3 text-[15px] font-semibold cursor-pointer transition-all shadow-xs'
                        : `px-6 flex items-center gap-3 text-[15px] font-medium cursor-pointer transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-[#0A2E6E] hover:bg-blue-50'}`}
                    >
                      <i className={`${item.icon} ${isActive ? 'text-lg' : `text-xl ${isDarkMode ? 'text-blue-400' : 'text-[#1D4ED8]'}`}`}></i> {item.label}
                      {isActive && <i className="fa-solid fa-chevron-right text-[11px] ml-6"></i>}
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {/* MAIN CONTENT */}
          {/* scrollbar-gutter stable: lebar scrollbar SELALU sama di semua halaman (walau isi pendek/tanpa scroll),
              jadi posisi & ukuran gambar bg6 + tagline di header identik di setiap halaman */}
          <main ref={mainRef} className="flex-1 overflow-y-auto px-8 pt-4 pb-8 relative [scrollbar-gutter:stable]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}