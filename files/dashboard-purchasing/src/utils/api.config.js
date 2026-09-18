// src/config/api.config.js
// Centralized API Configuration
// Change BASE_URL here and all components will use the new URL

// const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://idws-n26010:5000';
const API_BASE_URL = 'http://idws-n26010:5000';

export const API_ENDPOINTS = {
  // Suppliers
  SUPPLIERS: `${API_BASE_URL}/api/suppliers`,
  
  // Purchase Orders
  PURCHASE_ORDERS: `${API_BASE_URL}/api/purchase-orders`,
  
  // Market Price
  MARKET_PRICE: `${API_BASE_URL}/api/market-price`,
  
  // Users & Auth
  USERS: `${API_BASE_URL}/api/users`,
  USERS_LOGIN: `${API_BASE_URL}/api/users/login`,
  USERS_REGISTER: `${API_BASE_URL}/api/users/register`,
  
  // Settings
  PREFERENCES: `${API_BASE_URL}/api/preferences`,
  SETTINGS: `${API_BASE_URL}/api/settings`,
};

export default API_BASE_URL;