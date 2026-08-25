import React, { createContext, useContext, useState } from 'react';

// Data bawaan awal (bisa diganti dengan fetch dari API/Backend nanti)
const initialOrders = [
  { id: 'PO-1008', date: '2026-06-16', supplier: 'CV Melaju Bersama', category: 'Hardware', priority: 'Urgent', total: 140000000, status: 'SELESAI' },
  { id: 'PO-1007', date: '2026-07-21', supplier: 'PT Rajendra Abadi', category: 'Supplies', priority: 'Urgent', total: 100800000, status: 'SELESAI' },
  { id: 'PO-1006', date: '2026-07-29', supplier: 'CV Bintang', category: 'Hardware', priority: 'Normal', total: 1440000, status: 'MENUNGGU APPROVAL' },
  { id: 'PO-1005', date: '2026-06-16', supplier: 'CV Melaju Bersama', category: 'Hardware', priority: 'Normal', total: 140000000, status: 'SELESAI' },
  { id: 'PO-1004', date: '2025-10-03', supplier: 'CV Bintang', category: 'Furniture', priority: 'Normal', total: 23250000, status: 'SELESAI' },
  { id: 'PO-1003', date: '2026-05-13', supplier: 'PT AE', category: 'Services', priority: 'Normal', total: 4000000, status: 'SELESAI' },
  { id: 'PO-1002', date: '2026-06-28', supplier: 'PT Rajendra Abadi', category: 'Supplies', priority: 'Normal', total: 17100000, status: 'MENUNGGU APPROVAL' },
  { id: 'PO-1001', date: '2026-07-28', supplier: 'PT Elektronik Maju', category: 'Hardware', priority: 'Normal', total: 50000, status: 'DIKIRIM' },
];

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState(initialOrders);

  // Fungsi untuk update data (misal saat edit PO)
  const updateOrder = (updatedOrder) => {
    setOrders(prev => prev.map(po => po.id === updatedOrder.id ? updatedOrder : po));
  };

  return (
    <OrderContext.Provider value={{ orders, setOrders, updateOrder }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => useContext(OrderContext);