import { createContext, useContext, useState, useEffect } from 'react';

const RoleContext = createContext(null);

// MENGGUNAKAN window.location.hostname AGAR DINAMIS[cite: 1]
// Jika dibuka dari localhost, dia akan cari ke localhost:5000
// Jika dibuka dari idws-n26010, dia akan cari ke idws-n26010:5000
// Jika dibuka dari IP 10.62.11.106, dia akan cari ke 10.62.11.106:5000
const API_BASE = `http://${window.location.hostname}:5000/api/users`;

export function RoleProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, username, role_id, role }[cite: 1]
  const [permissions, setPermissions] = useState([]); // dari role_permissions, contoh: ['manage_users'][cite: 1]
  const [loading, setLoading] = useState(true);

  // Ambil profile + permissions dari server (bukan decode JWT), karena
  // permission-nya dinamis dari tabel role_permissions, bukan hardcode.[cite: 1]
  const fetchProfile = async (token) => {
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Token tidak valid atau sudah expired');
      const data = await res.json();
      setUser(data.user);
      setPermissions(data.permissions || []);
      return true;
    } catch (err) {
      localStorage.removeItem('token');
      setUser(null);
      setPermissions([]);
      return false;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchProfile(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Panggil ini setelah POST /login sukses, dengan token dari response-nya[cite: 1]
  const login = async (token) => {
    localStorage.setItem('token', token);
    const ok = await fetchProfile(token);
    if (!ok) localStorage.removeItem('token');
    return ok;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn_Ladeu');
    setUser(null);
    setPermissions([]);
  };

  const hasPermission = (permission) => permissions.includes(permission);

  // Semua route CRUD user di backend digerbang oleh satu permission: 'manage_users'[cite: 1]
  const isAdmin = () => hasPermission('manage_users');

  const value = {
    user,
    permissions,
    loading,
    login,
    logout,
    logoutUser: logout, // alias, dipakai oleh Navbar.jsx[cite: 1]
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