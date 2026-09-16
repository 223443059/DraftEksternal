import React, { useState, useEffect } from 'react';
import { useRole } from '../context/RoleContext';

export default function Login({ onLoginSuccess }) {
  const { login } = useRole();
  const [isLoginView, setIsLoginView] = useState(true);

  // =========================================================
  // STATE BACKGROUND IMAGES (CROSSFADE TRANSITION)
  // =========================================================
  const backgroundImages = [
    '/images/bg1.png', 
    '/images/bg2.png', 
    '/images/bg3.png', 
    '/images/bg4.jpeg', 
  ];

  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [nextBgIndex, setNextBgIndex] = useState((currentBgIndex + 1) % backgroundImages.length);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      const transitionDuration = 2000; 
      setTimeout(() => {
        setCurrentBgIndex(nextBgIndex);
        setIsTransitioning(false);
        setNextBgIndex((prev) => (prev + 1) % backgroundImages.length);
      }, transitionDuration); 
    }, 8000); 

    return () => clearInterval(interval);
  }, [backgroundImages.length, nextBgIndex]);

  // =========================================================
  // STATE FORM LOGIN
  // =========================================================
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetSubmitted, setResetSubmitted] = useState(false);

  const handleKeyDown = (e) => {
    if (e.getModifierState) {
      setIsCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  // =========================================================
  // HANDLER SUBMIT LOGIN
  // =========================================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    console.log('🔄 Form Login diklik...');
    
    const newErrors = {};
    const cleanEmail = loginEmail.trim();

    if (!cleanEmail) {
      newErrors.loginEmail = 'Email or Username is required.';
    }

    if (!loginPassword) {
      newErrors.loginPassword = 'Password is required.';
    }

    if (Object.keys(newErrors).length > 0) {
      console.warn('⚠️ Validasi lokal gagal:', newErrors);
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // ✅ DIPERBAIKI: Hanya menggunakan relative path karena Vite Proxy sudah aktif
      const API_URL = `/api/users/login`;
      
      console.log('📡 Mengirim request ke:', API_URL);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: loginPassword,
        }),
      });

      console.log('📩 Status HTTP Response:', response.status);
      const data = await response.json();
      console.log('📦 Data dari server:', data);

      if (!response.ok) {
        setErrors({ general: data.message || 'Invalid credentials. Please check your email/username and password.' });
        setIsLoading(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', cleanEmail);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      console.log('🔑 Mencoba login ke RoleContext...');
      const profileLoaded = await login(data.token);
      
      if (!profileLoaded) {
        console.error('❌ Gagal memuat profil user dari token.');
        setErrors({ general: 'Authentication successful, but failed to load profile data. Please reload.' });
        setIsLoading(false);
        return;
      }

      localStorage.setItem('token', data.token); 
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('isLoggedIn_Ladeu', 'true');

      console.log('✅ Login Berhasil!');

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error('💥 Catch Error:', err);
      setErrors({ general: 'Failed to connect to the server. Please check backend execution. (' + err.message + ')' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* BACKGROUND BOTTOM LAYER */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url('${backgroundImages[currentBgIndex]}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* BACKGROUND TOP LAYER */}
      <div
        className={`absolute inset-0 transition-opacity ease-in-out duration-2000 ${
          isTransitioning ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: `url('${backgroundImages[nextBgIndex]}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Light Overlay */}
      <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px]" />

      {/* Content Form */}
      <div className="w-full max-w-md relative z-10">
        {isLoginView && (
          <div className="bg-white/85 backdrop-blur-xl rounded-xl p-8 md:p-10 border border-slate-200/50 shadow-2xl shadow-slate-300/50">
            
            {/* Header / Logo */}
            <div className="text-center mb-8">
              <img 
                src="/images/logo.png" 
                alt="Detpak Logo" 
                className="h-12 w-auto mx-auto object-contain mb-6" 
              />
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Welcome Back</h2>
              <p className="text-sm text-slate-600">Sign in to continue</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-6" autoComplete="off">
              
              {/* ERROR DISPLAY */}
              {Object.keys(errors).length > 0 && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      {Object.entries(errors).map(([key, value]) => (
                        <p key={key} className="text-sm text-red-700">{value}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* EMAIL / USERNAME INPUT */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Email / Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (errors.loginEmail || errors.general) setErrors({});
                    }}
                    placeholder="name@detmoldpackaging.com"
                    className={`w-full pl-10 pr-4 py-3 bg-white/50 border ${
                      errors.loginEmail ? 'border-red-500' : 'border-slate-300'
                    } rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors`}
                  />
                </div>
              </div>

              {/* PASSWORD INPUT */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (errors.loginPassword || errors.general) setErrors({});
                    }}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    placeholder="Enter your password"
                    className={`w-full pl-10 pr-10 py-3 bg-white/50 border ${
                      errors.loginPassword ? 'border-red-500' : 'border-slate-300'
                    } rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    {showLoginPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                </div>
                {isCapsLockOn && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Caps Lock is On
                  </p>
                )}
              </div>

              {/* REMEMBER ME */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-4 h-4 border border-slate-300 rounded bg-white peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors"></div>
                    <svg className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">Remember me</span>
                </label>
              </div>

              {/* SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait shadow-lg shadow-blue-500/30"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-200 text-center">
               <button
                  type="button"
                  onClick={() => setIsResetModalOpen(true)}
                  className="text-sm text-slate-600 hover:text-blue-600 transition-colors"
                >
                  Forgot your password?
                </button>
            </div>
          </div>
        )}
      </div>

      {/* Forgot Password Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-900">Account Recovery</h3>
              <button onClick={() => setIsResetModalOpen(false)} className="text-slate-500 hover:text-slate-900 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {!resetSubmitted ? (
              <form onSubmit={(e) => { e.preventDefault(); if (resetInput) setResetSubmitted(true); }} className="space-y-5">
                <p className="text-sm text-slate-600">Enter your registered email address. We will send you instructions to reset your password.</p>
                <div>
                  <input
                    type="email"
                    value={resetInput}
                    onChange={(e) => setResetInput(e.target.value)}
                    placeholder="name@detmoldpackaging.com"
                    className="w-full px-4 py-3 text-sm rounded-lg bg-white border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder-slate-400"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsResetModalOpen(false)} className="w-1/2 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">Send Instructions</button>
                </div>
              </form>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h4 className="text-slate-900 font-semibold text-lg">Email Sent</h4>
                <p className="text-sm text-slate-600">Recovery instructions have been sent to <br/><strong className="text-slate-900">{resetInput}</strong>.</p>
                <button onClick={() => setIsResetModalOpen(false)} className="w-full mt-4 py-2.5 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors border border-slate-300">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}