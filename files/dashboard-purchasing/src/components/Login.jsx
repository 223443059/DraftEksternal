import React, { useState, useEffect } from 'react';

export default function Login({ onLoginSuccess }) {
  // Mode Tampilan: true = Login, false = Register
  const [isLoginView, setIsLoginView] = useState(true);

  // =========================================================
  // STATE FORM LOGIN
  // =========================================================
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // =========================================================
  // STATE FORM REGISTER
  // =========================================================
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

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

  // Cek 'Remember Me' saat komponen dimuat
  useEffect(() => {
    const savedUser = localStorage.getItem('rememberedUser');
    if (savedUser) {
      setLoginIdentifier(savedUser);
      setRememberMe(true);
    }
  }, []);

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

  const getPasswordStrength = (pass) => {
    let score = 0;
    if (!pass) return score;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const passwordStrength = getPasswordStrength(regPassword);

  const isValidEmailOnly = (value) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  // =========================================================
  // HANDLER SUBMIT LOGIN (DENGAN JALUR KHUSUS ADMIN)
  // =========================================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!loginIdentifier.trim()) {
      newErrors.loginIdentifier = 'Email atau username wajib diisi.';
    }
    if (!loginPassword) {
      newErrors.loginPassword = 'Kata sandi wajib diisi.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    // ✅ SEMUA LOGIN HARUS KE BACKEND DATABASE LARAGON
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        credentials: 'include', // ← Kirim cookies/session
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginIdentifier,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrors({ loginPassword: data.error || 'Login gagal, periksa email & password Anda' });
        return;
      }

      if (rememberMe) {
        localStorage.setItem('rememberedUser', loginIdentifier);
      } else {
        localStorage.removeItem('rememberedUser');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('isLoggedIn_Ladeu', 'true');

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setErrors({ loginPassword: 'Gagal terhubung ke server backend Laragon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================
  // HANDLER SUBMIT REGISTER 
  // =========================================================
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!regName.trim()) newErrors.regName = 'Nama lengkap wajib diisi.';
    if (!regEmail.trim()) newErrors.regEmail = 'Email wajib diisi.';
    else if (!isValidEmailOnly(regEmail)) newErrors.regEmail = 'Format email tidak valid.';
    if (!regPassword) newErrors.regPassword = 'Kata sandi wajib diisi.';
    else if (regPassword.length < 8) newErrors.regPassword = 'Kata sandi minimal 8 karakter.';
    if (regConfirmPassword !== regPassword) newErrors.regConfirmPassword = 'Konfirmasi kata sandi tidak cocok.';
    if (!agreeTerms) newErrors.agreeTerms = 'Kamu harus menyetujui Syarat & Ketentuan.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        credentials: 'include', // ← Kirim cookies/session
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regName,
          email: regEmail,
          password: regPassword,
          role_id: 2 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrors({ regEmail: data.error || 'Pendaftaran gagal' });
        return;
      }

      alert('Pendaftaran Berhasil! Akun Anda terdaftar sebagai User. Silakan masuk.');
      setIsLoginView(true);
    } catch (err) {
      setErrors({ regEmail: 'Gagal terhubung ke server backend: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
        
        {isLoginView ? (
          <>
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 text-red-600 rounded-xl mb-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Selamat Datang Kembali</h2>
              <p className="text-sm text-slate-500">Silakan masuk ke akun Anda untuk melanjutkan</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email atau Username
                </label>
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => {
                    setLoginIdentifier(e.target.value);
                    if (errors.loginIdentifier) setErrors({ ...errors, loginIdentifier: '' });
                  }}
                  placeholder="admin@detmoldpackaging.com"
                  className={`w-full px-4 py-3 text-sm rounded-xl border ${
                    errors.loginIdentifier ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-red-100 focus:border-red-600'
                  } focus:outline-none focus:ring-4 transition-all bg-slate-50 focus:bg-white text-slate-900`}
                />
                {errors.loginIdentifier && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">⚠️ {errors.loginIdentifier}</p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Kata Sandi
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetModalOpen(true);
                      setResetSubmitted(false);
                      setResetInput(loginIdentifier);
                    }}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                  >
                    Lupa Kata Sandi?
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (errors.loginPassword) setErrors({ ...errors, loginPassword: '' });
                    }}
                    placeholder="••••••••"
                    className={`w-full px-4 py-3 text-sm rounded-xl border ${
                      errors.loginPassword ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-red-100 focus:border-red-600'
                    } focus:outline-none focus:ring-4 transition-all bg-slate-50 focus:bg-white text-slate-900 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showLoginPassword ? '👁️' : '🙈'}
                  </button>
                </div>

                {isCapsLockOn && (
                  <p className="mt-1.5 text-xs text-amber-600 font-medium">⚠️ CAPS LOCK sedang aktif</p>
                )}
                {errors.loginPassword && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">⚠️ {errors.loginPassword}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs text-slate-600">Ingat saya di perangkat ini</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium text-sm rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? 'Memproses...' : 'Masuk Akun'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500 pt-2">
              Belum punya akun?{' '}
              <button
                type="button"
                onClick={toggleView}
                className="text-red-600 font-semibold hover:text-red-700 hover:underline focus:outline-none"
              >
                Daftar sekarang
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 text-red-600 rounded-xl mb-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Buat Akun Baru</h2>
              <p className="text-sm text-slate-500">Lengkapi data di bawah untuk mendaftar sebagai User</p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nama / Username
                </label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => {
                    setRegName(e.target.value);
                    if (errors.regName) setErrors({ ...errors, regName: '' });
                  }}
                  placeholder="Username Anda"
                  className={`w-full px-4 py-2.5 text-sm rounded-xl border ${
                    errors.regName ? 'border-red-500' : 'border-slate-200 focus:border-red-600'
                  } focus:outline-none focus:ring-4 focus:ring-red-100 bg-slate-50 focus:bg-white text-slate-900`}
                />
                {errors.regName && <p className="mt-1 text-xs text-red-600 font-medium">⚠️ {errors.regName}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    if (errors.regEmail) setErrors({ ...errors, regEmail: '' });
                  }}
                  placeholder="nama@email.com"
                  className={`w-full px-4 py-2.5 text-sm rounded-xl border ${
                    errors.regEmail ? 'border-red-500' : 'border-slate-200 focus:border-red-600'
                  } focus:outline-none focus:ring-4 focus:ring-red-100 bg-slate-50 focus:bg-white text-slate-900`}
                />
                {errors.regEmail && <p className="mt-1 text-xs text-red-600 font-medium">⚠️ {errors.regEmail}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Kata Sandi
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    onChange={(e) => {
                      setRegPassword(e.target.value);
                      if (errors.regPassword) setErrors({ ...errors, regPassword: '' });
                    }}
                    placeholder="Minimal 8 karakter"
                    className={`w-full px-4 py-2.5 text-sm rounded-xl border ${
                      errors.regPassword ? 'border-red-500' : 'border-slate-200 focus:border-red-600'
                    } focus:outline-none focus:ring-4 focus:ring-red-100 bg-slate-50 focus:bg-white text-slate-900 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showRegPassword ? '👁️' : '🙈'}
                  </button>
                </div>

                {regPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${passwordStrength >= 1 ? (passwordStrength <= 2 ? 'bg-red-500 w-1/3' : passwordStrength === 3 ? 'bg-amber-500 w-2/3' : 'bg-emerald-500 w-full') : 'w-0'}`}></div>
                    </div>
                    <p className="text-[10px] text-slate-500 text-right">
                      Kekuatan Kata Sandi:{' '}
                      <span className="font-semibold">
                        {passwordStrength <= 1 && 'Lemah'}
                        {passwordStrength === 2 && 'Sedang'}
                        {passwordStrength === 3 && 'Kuat'}
                        {passwordStrength === 4 && 'Sangat Kuat'}
                      </span>
                    </p>
                  </div>
                )}

                {isCapsLockOn && <p className="mt-1 text-xs text-amber-600 font-medium">⚠️ CAPS LOCK sedang aktif</p>}
                {errors.regPassword && <p className="mt-1 text-xs text-red-600 font-medium">⚠️ {errors.regPassword}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Konfirmasi Kata Sandi
                </label>
                <input
                  type="password"
                  value={regConfirmPassword}
                  onChange={(e) => {
                    setRegConfirmPassword(e.target.value);
                    if (errors.regConfirmPassword) setErrors({ ...errors, regConfirmPassword: '' });
                  }}
                  placeholder="Ketik ulang kata sandi"
                  className={`w-full px-4 py-2.5 text-sm rounded-xl border ${
                    errors.regConfirmPassword ? 'border-red-500' : 'border-slate-200 focus:border-red-600'
                  } focus:outline-none focus:ring-4 focus:ring-red-100 bg-slate-50 focus:bg-white text-slate-900`}
                />
                {errors.regConfirmPassword && <p className="mt-1 text-xs text-red-600 font-medium">⚠️ {errors.regConfirmPassword}</p>}
              </div>

              <div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => {
                      setAgreeTerms(e.target.checked);
                      if (errors.agreeTerms) setErrors({ ...errors, agreeTerms: '' });
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs text-slate-600 leading-tight">
                    Saya menyetujui <a href="#terms" className="text-red-600 underline hover:text-red-700">Syarat & Ketentuan</a>.
                  </span>
                </label>
                {errors.agreeTerms && <p className="mt-1 text-xs text-red-600 font-medium">⚠️ {errors.agreeTerms}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium text-sm rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? 'Membuat Akun...' : 'Daftar Akun'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500 pt-2">
              Sudah punya akun?{' '}
              <button
                type="button"
                onClick={toggleView}
                className="text-red-600 font-semibold hover:text-red-700 hover:underline focus:outline-none"
              >
                Masuk di sini
              </button>
            </p>
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
                  type="text"
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