import { createContext, useContext, useState, useEffect, useRef } from 'react';

const RoleContext = createContext(null);

// MENGGUNAKAN window.location.hostname AGAR DINAMIS
const API_BASE = `http://${window.location.hostname}:5000/api/users`;

// Pemetaan permission default berdasarkan role
const ROLE_PERMISSIONS = {
  superadmin: ['manage_users', 'view_dashboard', 'edit_data'],
  admin: ['manage_users', 'view_dashboard', 'edit_data'],
  user: ['view_dashboard']
};

// Cek masa berlaku JWT di browser (tanpa request). Token rusak / bukan JWT dianggap tidak valid.
const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};

export function RoleProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const profileRequest = useRef(null); // request profil yang sedang berjalan (dipakai bersama agar tidak terkirim dobel)

  // Bersihkan sesi lokal. 'isLoggedIn_Ladeu' ikut dihapus supaya aplikasi tidak tetap menganggap user login
  // padahal token-nya sudah tidak valid (sama seperti yang dilakukan logout()).
  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn_Ladeu');
    setUser(null);
    setPermissions([]);
  };

  const fetchProfile = async (token) => {
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Token tidak valid atau sudah expired');
      const data = await res.json();
      
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user)); 
      
      // Ambil permissions dari response backend jika ada, atau gunakan dari ROLE_PERMISSIONS
      const userRole = data.user?.role?.toLowerCase();
      const fallbackPermissions = ROLE_PERMISSIONS[userRole] || [];
      const finalPermissions = (data.permissions && data.permissions.length > 0) 
        ? data.permissions 
        : fallbackPermissions;

      setPermissions(finalPermissions);
      return true;
    } catch (err) {
      clearSession();
      return false;
    }
  };
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    // Token sudah kedaluwarsa / rusak: hapus langsung tanpa memanggil server (tidak ada error 401 di console)
    if (isTokenExpired(token)) {
      clearSession();
      setLoading(false);
      return;
    }
    // React StrictMode (mode dev) menjalankan efek ini dua kali -> pakai satu request yang sama, bukan dua
    if (!profileRequest.current) profileRequest.current = fetchProfile(token);
    profileRequest.current.finally(() => setLoading(false));
  }, []);

  const login = async (token) => {
    localStorage.setItem('token', token);
    profileRequest.current = null;
    const ok = await fetchProfile(token);
    if (!ok) localStorage.removeItem('token');
    return ok;
  };

  const logout = () => {
    clearSession();
  };

  const hasPermission = (permission) => permissions.includes(permission);

  const isAdmin = () => hasPermission('manage_users');

  const value = {
    user,
    permissions,
    loading,
    login,
    logout,
    logoutUser: logout,
    hasPermission,
    isAdmin,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRole harus dipakai di dalam RoleProvider');
  }
  return ctx;
}