import { useMemo } from 'react';
import { useOrders } from './OrderContext';

export const useOrderStats = () => {
  const { orders } = useOrders();

  return useMemo(() => {
    const totalCostAllTime = orders.reduce((sum, po) => sum + po.total, 0);
    const totalOrdersCount = orders.length;
    
    // PERBAIKAN 1: Hitung semua yang belum selesai (Menunggu Approval & Dikirim)
    const pendingPaymentTotal = orders
      .filter(po => po.status !== 'SELESAI')
      .reduce((sum, po) => sum + po.total, 0);

    // PERBAIKAN 2: Rumus Average % Paid yang benar
    const completedOrders = orders.filter(po => po.status === 'SELESAI').length;
    const averagePaidPercent = totalOrdersCount === 0 ? 0 : Math.round((completedOrders / totalOrdersCount) * 100);

    // Kalkulasi spesifik PO Page
    const activeUrgentOrders = orders.filter(po => po.priority === 'Urgent' && po.status !== 'SELESAI').length;

    return { 
      orders, 
      totalCostAllTime, 
      totalOrdersCount, 
      pendingPaymentTotal, 
      averagePaidPercent,
      completedOrders,
      activeUrgentOrders
    };
  }, [orders]); 
  // useMemo bikin aplikasi gak lemot, karena cuma ngitung ulang kalau 'orders' berubah
};