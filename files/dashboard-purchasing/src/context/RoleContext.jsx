import { createContext, useContext, useState, useEffect } from 'react';

const RoleContext = createContext(null);

// MENGGUNAKAN window.location.hostname AGAR DINAMIS
const API_BASE = `http://${window.location.hostname}:5000/api/users`;

// Pemetaan permission default berdasarkan role
const ROLE_PERMISSIONS = {
  superadmin: ['manage_users', 'view_dashboard', 'edit_data'],
  admin: ['manage_users', 'view_dashboard', 'edit_data'],
  user: ['view_dashboard']
};

export function RoleProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
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