import React, { useState } from 'react';
import { useRole } from '../context/RoleContext';

export default function Login({ onLoginSuccess }) {
  // Dipakai untuk push token & profile+permissions ke RoleContext setelah login,
  // supaya Navbar langsung tahu status admin tanpa perlu refresh halaman.
  const { login } = useRole();

  // Mode Tampilan: true = Login, false = Register
  const [isLoginView, setIsLoginView] = useState(true);

  // =========================================================
  // STATE FORM LOGIN
  // =========================================================
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // =========================================================
  // STATE UMUM & VALIDASI
  // =========================================================
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // State Modal Reset Password
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetSubmitted, setResetSubmitted] = useState(false);

  // Catatan: email tidak lagi auto-isi saat pertama buka halaman (permintaan user),
  // meskipun 'rememberedEmail' tetap disimpan di localStorage kalau checkbox dicentang.

  // Deteksi Caps Lock
  const handleKeyDown = (e) => {
    if (e.getModifierState) {
      setIsCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const toggleView = () => {
    setIsLoginView(!isLoginView);
    setErrors({});
  };

  const isValidEmail = (value) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  // =========================================================
  // HANDLER SUBMIT LOGIN - CONNECT KE BACKEND
  // =========================================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!loginEmail.trim()) {
      newErrors.loginEmail = 'Email wajib diisi.';
    } else if (!isValidEmail(loginEmail)) {
      newErrors.loginEmail = 'Format email tidak valid.';
    }

    if (!loginPassword) {
      newErrors.loginPassword = 'Kata sandi wajib diisi.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    // ✅ LOGIN KE BACKEND LARAGON
    try {
      const response = await fetch('http://localhost:5000/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrors({ loginPassword: data.message || 'Login gagal, periksa email & password Anda' });
        return;
      }

      // Save Remember Me
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', loginEmail);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      // Simpan token & load profile+permissions ke RoleContext.
      // login() sudah otomatis localStorage.setItem('token', ...) di dalamnya,
      // jadi tidak perlu diset manual lagi di sini.
      const profileLoaded = await login(data.token);
      if (!profileLoaded) {
        setErrors({ loginPassword: 'Login berhasil tapi gagal memuat data profil. Coba lagi.' });
        return;
      }

      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('isLoggedIn_Ladeu', 'true');

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setErrors({ loginPassword: 'Gagal terhubung ke server backend: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* LOGIN FORM */}
        {isLoginView && (
          <>
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
                  <span className="text-2xl">🔐</span>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Test Login</h1>
              <p className="text-sm text-slate-600">RBAC System - Admin Login</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-5" autoComplete="off">
              {/* ERROR DISPLAY */}
              {Object.keys(errors).length > 0 && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">❌</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-700 mb-1">Error</h3>
                      {Object.entries(errors).map(([key, value]) => (
                        <p key={key} className="text-xs text-red-600">{value}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* EMAIL INPUT */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  📧 Email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => {
                    setLoginEmail(e.target.value);
                    if (errors.loginEmail) setErrors({ ...errors, loginEmail: '' });
                  }}
                  placeholder="admin@detmoldpackaging.com"
                  autoComplete="off"
                  className={`w-full px-4 py-2.5 text-sm rounded-xl border ${
                    errors.loginEmail ? 'border-red-500' : 'border-slate-200 focus:border-red-600'
                  } focus:outline-none focus:ring-4 focus:ring-red-100 bg-slate-50 focus:bg-white text-slate-900`}
                />
                {errors.loginEmail && <p className="mt-1 text-xs text-red-600 font-medium">⚠️ {errors.loginEmail}</p>}
              </div>

              {/* PASSWORD INPUT */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  🔑 Kata Sandi
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (errors.loginPassword) setErrors({ ...errors, loginPassword: '' });
                    }}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    placeholder="Masukkan kata sandi"
                    autoComplete="new-password"
                    className={`w-full px-4 py-2.5 text-sm rounded-xl border ${
                      errors.loginPassword ? 'border-red-500' : 'border-slate-200 focus:border-red-600'
                    } focus:outline-none focus:ring-4 focus:ring-red-100 bg-slate-50 focus:bg-white text-slate-900 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showLoginPassword ? '👁️' : '🙈'}
                  </button>
                </div>
                {isCapsLockOn && <p className="mt-1 text-xs text-amber-600 font-medium">⚠️ CAPS LOCK sedang aktif</p>}
              </div>

              {/* REMEMBER ME */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs text-slate-600">Ingat saya</span>
              </label>

              {/* SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 active:from-red-800 active:to-red-900 text-white font-semibold text-sm rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Sedang Masuk...
                  </>
                ) : (
                  <>✓ Masuk</>
                )}
              </button>

              {/* FORGOT PASSWORD */}
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="w-full text-center text-xs text-red-600 font-semibold hover:text-red-700 hover:underline focus:outline-none"
              >
                Lupa Kata Sandi?
              </button>
            </form>
          </>
        )}
      </div>

      {/* Modal Reset Password */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-base">Reset Kata Sandi</h3>
              <button onClick={() => setIsResetModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {!resetSubmitted ? (
              <form onSubmit={(e) => { e.preventDefault(); if (resetInput) setResetSubmitted(true); }} className="space-y-4">
                <p className="text-xs text-slate-500">Masukkan email Anda untuk pemulihan akun.</p>
                <input
                  type="email"
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder="Email Anda"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100 text-slate-900"
                  required
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsResetModalOpen(false)} className="w-1/2 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
                  <button type="submit" className="w-1/2 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-sm">Kirim Tautan</button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-3">
                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto font-bold">✓</div>
                <p className="text-xs text-slate-600">Tautan reset telah dikirim ke <strong>{resetInput}</strong>.</p>
                <button onClick={() => setIsResetModalOpen(false)} className="w-full py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold">Tutup</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}