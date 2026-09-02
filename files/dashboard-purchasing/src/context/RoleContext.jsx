// src/context/RoleContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const RoleContext = createContext();

export const RoleProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/users/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setPermissions(data.permissions || []);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const hasPermission = (permission) => {
    return permissions.includes(permission);
  };

  const isSuperAdmin = () => {
    return user?.role_id === 1;
  };

  return (
    <RoleContext.Provider value={{ user, permissions, loading, hasPermission, isSuperAdmin }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within RoleProvider');
  }
  return context;
};