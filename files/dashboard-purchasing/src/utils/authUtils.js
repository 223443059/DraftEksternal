export const getToken = () => {
  return localStorage.getItem('token'); 
};

export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (error) {
      console.error("Gagal membaca data user:", error);
      return null;
    }
  }
  return null;
};

export const isAdmin = () => {
  const user = getCurrentUser();
  // Admin (roleId 1 & 2) bisa akses
  return user && (user.roleId === 1 || user.roleId === 2);
};

// ← TAMBAH FUNGSI BARU:
export const isSuperAdmin = () => {
  const user = getCurrentUser();
  // Hanya Super Admin (roleId = 1) yang bisa akses
  return user && user.roleId === 1;
};