import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';

const usdFormatter = new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD', 
  minimumFractionDigits: 2 
});

const KURS_IDR_TO_USD = 15500;

export default function PurchaseOrders({ 
  changePage, 
  onLogout, 
  orders: propOrders, 
  setOrders: propSetOrders,
  suppliers: propSuppliers 
}) {
  const { user, hasPermission } = useRole();  
  const canManageUsers = hasPermission('manage_users');

  // === 1. STATE MANAGEMENT ===
  const [localOrders, setLocalOrders] = useState([]);
  const [dbSuppliers, setDbSuppliers] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isHeaderOpen, setIsHeaderOpen] = useState(true);
  const [isLinesOpen, setIsLinesOpen] = useState(true);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);
  const [formattedTime, setFormattedTime] = useState('');
  
  // State Paginasi (15 baris per halaman)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [isPoMenuExpanded, setIsPoMenuExpanded] = useState(true);
  const [showUploadView, setShowUploadView] = useState(false);

  const profileRef = useRef(null);
  const supplierDropdownRef = useRef(null);

  const initialFormData = {
    poNo: '',
    poNumber: '',
    supplierId: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    promiseDate: '',
    type: 'Standard',
    buyer: 'Local Purchasing - MTS',
    currency: 'USD',
    exchangeRate: '15500',
    terms: '30 Days Net',
    shipVia: 'Land Trucking',
    prepaidFreight: false,
    fob: '',
    supplier: '',
    purchasePoint: 'Lokal',
    address: '',
    attn: 'None Selected',
    phone: '',
    fax: '',
    enteredBy: user?.username || 'Admin',
    supplierOrderNumber: '',
    category: 'Raw Material',
    description: '',
    notes: '',
    isApproved: false,
    status: 'Unsubmitted',
    priority: 'NORMAL',
    charges: 0,
    misc: 0,
    tax: 0,
    items: [{ id: Date.now(), partNum: '', name: '', dueDate: '', qty: 1, uom: 'EA', price: 0 }]
  };

  const [formData, setFormData] = useState(initialFormData);

  // === 2. EFFECTS & LISTENERS ===
  useEffect(() => {
    fetchOrdersFromBackend();
    fetchSuppliersFromBackend();

    const timer = setInterval(() => {
      const now = new Date();
      setFormattedTime(now.toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileCard(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (printOrder) {
      setTimeout(() => {
        window.print();
        setPrintOrder(null);
      }, 500);
    }
  }, [printOrder]);

  // Reset halaman ke 1 saat pencarian atau filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, priorityFilter]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // === 3. BACKEND API CALLS ===
  const fetchOrdersFromBackend = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/purchase-orders');
      if (response.ok) {
        const data = await response.json();
        const formattedOrders = data.map(po => ({
          id: po.id,
          poNumber: po.po_number || po.po_no || po.poNumber,
          date: po.po_date ? po.po_date.split('T')[0] : new Date().toISOString().split('T')[0],
          supplier: po.supplier_name || po.supplier || '',
          supplier_id: po.supplier_id,
          totalCost: Number(po.total_amount || po.totalCost || 0),
          status: po.status || po.order_status || 'Unsubmitted',
          category: po.category || 'Raw Material',
          notes: po.description || po.notes || '',
          items: po.items || []
        }));
        setLocalOrders(formattedOrders);
        localStorage.setItem('dataPO_Ladeu', JSON.stringify(formattedOrders));
      }
    } catch (error) {
      console.error('Gagal mengambil data PO dari database:', error);
    }
  };

  const fetchSuppliersFromBackend = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/suppliers');
      if (response.ok) {
        const data = await response.json();
        setDbSuppliers(data);
      }
    } catch (error) {
      console.error('Gagal mengambil data Supplier dari database:', error);
    }
  };

  // === 4. DATA COMPUTATIONS & PAGINASI ===
  const orders = useMemo(() => {
    return Array.isArray(propOrders) && propOrders.length > 0 ? propOrders : localOrders;
  }, [propOrders, localOrders]);

  const setOrders = propSetOrders || setLocalOrders;

  const daftarSupplierObjects = useMemo(() => {
    if (dbSuppliers.length > 0) return dbSuppliers;
    if (Array.isArray(propSuppliers) && propSuppliers.length > 0) return propSuppliers;
    return [];
  }, [dbSuppliers, propSuppliers]);

  const daftarSupplier = useMemo(() => {
    if (daftarSupplierObjects.length === 0) {
      return ["CV Bintang", "CV Melaju Bersama", "PT AE", "PT Rajendra Abadi", "PT Elektronik Maju"];
    }
    return daftarSupplierObjects
      .map(s => typeof s === 'string' ? s : (s.name || s.nama || s.perusahaan || s.supplier))
      .filter(Boolean);
  }, [daftarSupplierObjects]);

  const formatUSDWithExchange = (amount, currency = 'IDR') => {
    const curr = String(currency).toUpperCase();
    if (curr === 'USD') {
      return usdFormatter.format(amount || 0);
    }
    const amountInUSD = (amount || 0) / KURS_IDR_TO_USD;
    return usdFormatter.format(amountInUSD);
  };

  const calculateGrandTotal = (po) => {
    if (!po) return 0;
    if (po.totalCost && Number(po.totalCost) > 0) return Number(po.totalCost);
    if (po.total_amount && Number(po.total_amount) > 0) return Number(po.total_amount);
    
    const itemsTotal = Array.isArray(po.items)
      ? po.items.reduce((sum, item) => sum + (Number(item.qty || item.quantity || 1) * Number(item.price || item.harga || 0)), 0)
      : 0;

    return itemsTotal + Number(po.charges || 0) + Number(po.misc || 0) + Number(po.tax || 0);
  };

  const formGrandTotal = useMemo(() => {
    const itemsTotal = formData.items.reduce((sum, item) => {
      return sum + ((Number(item.qty) || 0) * (Number(item.price) || 0));
    }, 0);
    return itemsTotal + (Number(formData.charges) || 0) + (Number(formData.misc) || 0) + (Number(formData.tax) || 0);
  }, [formData.items, formData.charges, formData.misc, formData.tax]);

  const totalAmount = formGrandTotal;

  const stats = useMemo(() => {
    const totalPO = orders.length;
    let waitingPaymentTotal = 0;
    let completedCount = 0;

    orders.forEach(order => {
      const status = (order.status || '').toUpperCase();
      const totalVal = calculateGrandTotal(order);

      if (status === 'COMPLETED' || status === 'SELESAI') {
        completedCount += 1;
      } else {
        waitingPaymentTotal += totalVal;
      }
    });

    return { totalPO, waitingPaymentTotal, completedCount };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const poNum = (order?.poNumber || '').toLowerCase();
      const supp = (order?.supplier || order?.namaSupplier || '').toLowerCase();
      const matchesSearch = poNum.includes(term) || supp.includes(term);
      
      const pVal = (order?.priority || order?.prioritas || 'Normal').toUpperCase();
      const matchesPriority = priorityFilter === 'ALL' ? true : priorityFilter === 'URGENT' ? pVal === 'URGENT' : pVal === 'NORMAL';
      return matchesSearch && matchesPriority;
    });
  }, [orders, searchTerm, priorityFilter]);

  // Meratakan seluruh baris item PO untuk pemotongan 15 baris per halaman
  const allFlattenedRows = useMemo(() => {
    return filteredOrders.flatMap((order) => {
      const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [{}];
      return items.map((item, index) => ({
        order,
        item,
        itemIndex: index,
        rowId: `${order.id}-${index}`
      }));
    });
  }, [filteredOrders]);

  const totalPages = Math.ceil(allFlattenedRows.length / itemsPerPage) || 1;

  const currentPaginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return allFlattenedRows.slice(startIndex, startIndex + itemsPerPage);
  }, [allFlattenedRows, currentPage, itemsPerPage]);

  // === 5. ACTION HANDLERS ===
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const matchedSupplier = daftarSupplierObjects.find(
        s => (typeof s === 'string' ? s : (s.name || s.nama || s.perusahaan)) === formData.supplier
      );
      const supplierId = formData.supplierId || (matchedSupplier ? matchedSupplier.id : 1);

      const response = await fetch('http://localhost:5000/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_no: formData.poNo || formData.poNumber,
          supplier_id: supplierId,
          category: formData.category,
          description: formData.description || formData.notes,
          total_amount: totalAmount,
          order_status: 'Pending',
          order_date: new Date()
        })
      });

      const result = await response.json();
      if (result.success || response.ok) {
        showToast('PO Berhasil Disimpan!', 'success');
        fetchOrdersFromBackend(); 
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error('Gagal kirim PO:', error);
      showToast('Gagal menyimpan PO', 'error');
    }
  };

  const deletePO = async (id, poNumber) => {
    if (window.confirm(`Hapus dokumen ${poNumber || 'PO'} dari database?`)) {
      try {
        const response = await fetch(`http://localhost:5000/api/purchase-orders/${id}`, { method: 'DELETE' });
        if (response.ok) {
          showToast(`PO ${poNumber} berhasil dihapus.`, 'success');
          fetchOrdersFromBackend();
        } else {
          const updated = orders.filter(o => o.id !== id);
          setOrders(updated);
          localStorage.setItem('dataPO_Ladeu', JSON.stringify(updated));
          showToast(`PO ${poNumber} dihapus dari lokal.`, 'success');
        }
      } catch (error) {
        console.error('Error saat menghapus PO:', error);
        const updated = orders.filter(o => o.id !== id);
        setOrders(updated);
        localStorage.setItem('dataPO_Ladeu', JSON.stringify(updated));
        showToast(`PO ${poNumber} dihapus dari lokal.`, 'success');
      }
    }
  };

  const handleEditClick = (order) => {
    setEditingId(order.id);
    const poCode = order.poNumber ? order.poNumber.replace(/^PO-/, '') : '';
    setFormData({
      poNo: poCode,
      poNumber: poCode,
      supplierId: order.supplier_id || '',
      date: order.date || new Date().toISOString().split('T')[0],
      dueDate: order.dueDate || '',
      promiseDate: order.promiseDate || '',
      type: order.type || 'Standard',
      buyer: order.buyer || 'Local Purchasing - MTS',
      currency: order.currency || 'USD',
      exchangeRate: order.exchangeRate || '15500',
      terms: order.terms || '30 Days Net',
      shipVia: order.shipVia || 'Land Trucking',
      prepaidFreight: Boolean(order.prepaidFreight),
      fob: order.fob || '',
      supplier: order.supplier || order.namaSupplier || '',
      purchasePoint: order.purchasePoint || 'Lokal',
      address: order.address || '',
      attn: order.attn || 'None Selected',
      phone: order.phone || '',
      fax: order.fax || '',
      enteredBy: order.enteredBy || user?.username || 'Admin',
      supplierOrderNumber: order.supplierOrderNumber || '',
      category: order.category || 'Raw Material',
      description: order.notes || order.description || '',
      notes: order.notes || order.description || '',
      isApproved: order.status === 'Ready To Process',
      status: order.status || 'Unsubmitted',
      priority: order.priority || 'NORMAL',
      charges: order.charges || 0,
      misc: order.misc || 0,
      tax: order.tax || 0,
      items: Array.isArray(order.items) && order.items.length > 0 
        ? order.items.map((it, idx) => ({
            id: it.id || idx,
            partNum: it.partNum || '',
            name: it.name || it.deskripsi || '',
            dueDate: it.dueDate || '',
            qty: it.qty || it.quantity || 1,
            uom: it.uom || 'EA',
            price: it.price || it.harga || 0
          }))
        : [{ id: Date.now(), partNum: '', name: order.notes || 'Default Item', dueDate: '', qty: 1, uom: 'EA', price: order.totalCost || 0 }]
    });
    setIsModalOpen(true);
  };

  const mapStatusToEnum = (rawStatus) => {
    const s = String(rawStatus || '').trim().toLowerCase();
    if (s === 'completed' || s === 'complete' || s === 'done') return 'Completed';
    if (s === 'awaiting payment' || s === 'awaiting_payment' || s === 'unpaid') return 'Awaiting Payment';
    return 'Pending';
  };

  const excelSerialToISODate = (value) => {
    if (value === null || value === undefined || value === '') {
      return new Date().toISOString().split('T')[0];
    }
    if (typeof value === 'number') {
      const utcDays = Math.floor(value - 25569);
      const utcMs = utcDays * 86400 * 1000;
      const dateObj = new Date(utcMs);
      return dateObj.toISOString().split('T')[0];
    }
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  };

  const getCol = (row, ...possibleNames) => {
    const keys = Object.keys(row);
    for (const name of possibleNames) {
      const found = keys.find((k) => k.trim().toLowerCase() === name.trim().toLowerCase());
      if (found !== undefined && row[found] !== undefined && row[found] !== null && row[found] !== '') {
        return row[found];
      }
    }
    return undefined;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsName = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsName];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          showToast('File Excel kosong atau formatnya tidak terbaca!', 'error');
          e.target.value = null;
          return;
        }

        const poGroups = new Map();

        rawData.forEach((row, index) => {
          const rawPoNo = getCol(row, 'PO Number', 'poNumber') ?? getCol(row, 'PO');
          const poNo = rawPoNo !== undefined
            ? String(rawPoNo).trim()
            : `PO-XLS-${Date.now()}-${index}`; 

          const amount = Number(
            getCol(row, 'Total', 'totalCost') ??
            getCol(row, 'Amount') ??
            getCol(row, 'Spending USD') ??
            getCol(row, 'Spending IDR') ??
            0
          );

          const category = getCol(row, 'Category') ?? getCol(row, 'Product Group') ?? 'Raw Material';
          const supplierName = String(getCol(row, 'Supplier', 'supplier') ?? '').trim();
          const dateVal = getCol(row, 'Date');
          const origin = getCol(row, 'Local/Import');
          const itemDesc = getCol(row, 'Notes') ?? getCol(row, 'Description') ?? getCol(row, 'Part');

          if (!poGroups.has(poNo)) {
            poGroups.set(poNo, {
              poNumber: poNo,
              date: excelSerialToISODate(dateVal),
              supplierName,
              totalCost: 0,
              status: mapStatusToEnum(getCol(row, 'Status')),
              category: String(category),
              origin: origin ? String(origin) : '',
              descriptions: []
            });
          }

          const group = poGroups.get(poNo);
          group.totalCost += isNaN(amount) ? 0 : amount;
          if (itemDesc) group.descriptions.push(String(itemDesc));
        });

        const existingPoNumbers = orders.map((o) => o.poNumber?.toLowerCase());
        
        let duplicateCount = 0;
        const validRows = [];

        Array.from(poGroups.values()).forEach((g) => {
          if (existingPoNumbers.includes(g.poNumber.toLowerCase())) {
            duplicateCount++;
          } else {
            validRows.push({
              poNumber: g.poNumber,
              date: g.date,
              supplierName: g.supplierName,
              totalCost: g.totalCost,
              status: g.status,
              category: g.category,
              notes: [g.origin, g.descriptions.join('; ')].filter(Boolean).join(' — ')
            });
          }
        });

        if (validRows.length === 0 && duplicateCount > 0) {
          showToast(`Gagal! Semua data PO (${duplicateCount} baris) sudah ada di sistem (Duplikat).`, 'error');
          e.target.value = null; 
          return;
        }

        showToast(`Menyiapkan ${validRows.length} PO baru, ${duplicateCount} duplikat diabaikan...`, 'success');

        let successCount = 0;
        let failCount = 0;

        for (const row of validRows) {
          try {
            let supplierId = null;
            if (row.supplierName) {
              const matchedSupplier = daftarSupplierObjects.find(
                (s) => (s.name || s.nama || '').toLowerCase() === row.supplierName.toLowerCase()
              );

              if (matchedSupplier) {
                supplierId = matchedSupplier.id;
              } else {
                const createRes = await fetch('http://localhost:5000/api/suppliers', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: row.supplierName, status: 'Active' })
                });
                if (createRes.ok) {
                  const created = await createRes.json();
                  supplierId = created.id;
                }
              }
            }

            const response = await fetch('http://localhost:5000/api/purchase-orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                po_no: row.poNumber,
                supplier_id: supplierId,
                category: row.category,
                description: row.notes,
                total_amount: row.totalCost,
                order_status: row.status,
                order_date: row.date
              })
            });

            if (response.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (rowErr) {
            console.error(`Gagal insert baris PO ${row.poNumber}:`, rowErr);
            failCount++;
          }
        }

        await fetchSuppliersFromBackend();
        await fetchOrdersFromBackend();

        if (failCount === 0) {
          showToast(
            duplicateCount > 0
              ? `${successCount} PO berhasil di-import, ${duplicateCount} PO dilewati (duplikat).`
              : `${successCount} PO berhasil di-import ke database!`,
            'success'
          );
        } else {
          showToast(`${successCount} PO berhasil, ${failCount} gagal di-import. Cek Console!`, 'error');
        }

      } catch (err) {
        console.error('Error proses Excel:', err);
        showToast('Terjadi kesalahan sistem saat membaca file Excel!', 'error');
      }
      
      e.target.value = null; 
    };

    reader.readAsBinaryString(file);
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), partNum: '', name: '', dueDate: '', qty: 1, uom: 'EA', price: 0 }]
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleTriggerPrint = (order) => setPrintOrder(order);
  const handleNavigate = (p) => changePage?.(p);
  const handleLogout = () => onLogout?.();
  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      {/* TOAST NOTIFICATION */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[9999] px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 transition-all transform duration-300 border ${
          toast.type === 'error' 
            ? 'bg-[#FFF2F2] border-[#FFD9D9] text-[#B31919]' 
            : 'bg-emerald-500 border-emerald-500 text-white'
        }`}>
          <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-[#FFD9D9] text-[#B31919]' : 'bg-white/20 text-white'}`}>
             <i className={`fa-solid ${toast.type === 'error' ? 'fa-exclamation text-xs' : 'fa-check text-xs'}`}></i>
          </div>
          <span className="font-semibold text-sm">{toast.message}</span>
        </div>
      )}
      
      <style>{`
        @media print {
          html, body, #root {
            height: auto !important;
            overflow: visible !important;
          }
          * {
            overflow: visible !important;
            max-height: none !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-po-document, #printable-po-document * {
            visibility: visible !important;
          }
          #printable-po-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 20px !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* HEADER UTAMA */}
      <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-10 h-full">
            <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage?.('dashboard')}>
              <img src="/images/logo.png" alt="Detpak Logo" className="h-12 w-auto object-contain" />
            </div>            
            <nav className="hidden md:flex items-center h-full gap-3 text-lg font-semibold">
              <button onClick={() => changePage?.('dashboard')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Dashboard</button>
              <button onClick={() => changePage?.('marketPrice')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Market Price</button>
              <button onClick={() => changePage?.('supplierEvaluation')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>Supplier Evaluation</button>
              <button onClick={() => changePage?.('otd')} className={`px-4 py-2.5 rounded-xl flex items-center cursor-pointer transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>OTD Performance</button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className={`text-xl cursor-pointer transition-colors ${isDarkMode ? 'text-amber-400 hover:text-amber-300' : 'text-gray-600 hover:text-gray-900'}`} 
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
            
            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-lg text-base font-semibold ${isDarkMode ? 'bg-[#1E293B] text-slate-200 border-slate-700' : 'bg-[#F3F4F6] text-[#4A5568] border-gray-200'}`}>
              <i className="fa-regular fa-clock text-blue-500"></i>
              <span>{formattedTime}</span>
            </div>

            <div className="relative" ref={profileRef}>
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
                {user?.username || 'Admin'} <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>              
              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      {(user?.username || 'AD').slice(0, 2)}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user?.username || '-'}</h4>
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{user?.email || '-'}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-[#004797]'}`}>{user?.role || '-'}</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <button onClick={() => { setShowProfileCard(false); changePage?.('settings'); }} className={`w-full text-left px-3 py-2 text-base rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <i className="fa-solid fa-user-gear text-gray-400 text-sm"></i> Manage Profile
                    </button>
                    <button onClick={() => { setShowProfileCard(false); handleLogout(); }} className="w-full text-left px-3 py-2 text-base text-red-500 hover:bg-red-500/10 rounded-lg flex items-center gap-2.5 transition-colors font-medium cursor-pointer">
                      <i className="fa-solid fa-arrow-right-from-bracket text-red-500 text-sm"></i> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`px-6 py-5 flex flex-col justify-center ${isDarkMode ? 'bg-[#0F172A]' : 'bg-white'}`}>
          <h2 className="text-[#DE5B54] text-[26px] font-bold tracking-[0.08em] uppercase mb-1.5 leading-none" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Packaging
          </h2>
          <p className={`text-[14px] font-bold tracking-[0.1em] uppercase leading-none ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Detmold Group <span className={`mx-1.5 font-light ${isDarkMode ? 'text-slate-700' : 'text-gray-300'}`}>|</span> PT Detpak Indonesia
          </p>
        </div>
      </header>
      
      {/* BODY CONTAINER */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 transition-colors duration-200 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
          <nav className="flex flex-col gap-2 px-4">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'fa-border-all' },
              { id: 'suppliers', label: 'Suppliers', icon: 'fa-users' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                  isDarkMode
                    ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'
                }`}
              >
                <i className={`fa-solid ${item.icon} w-5 text-lg`}></i> {item.label}
              </button>
            ))}

            <div>
              <button
                onClick={() => setIsPoMenuExpanded(!isPoMenuExpanded)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold rounded-xl transition-colors text-left cursor-pointer ${
                  isPoMenuExpanded
                    ? 'bg-[#004797] text-white'
                    : isDarkMode
                    ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-file-lines w-5 text-lg"></i> Purchase Orders
                </div>
                <i className={`fa-solid fa-chevron-${isPoMenuExpanded ? 'down' : 'right'} text-xs transition-transform`}></i>
              </button>

              {isPoMenuExpanded && (
                <div className={`ml-4 pl-3 border-l-2 mt-1 flex flex-col gap-1 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  <button
                    onClick={() => {
                      setShowUploadView(false);
                      handleNavigate('purchaseOrders');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left cursor-pointer ${
                      isDarkMode && !showUploadView ? 'text-slate-200 bg-slate-800/50' : !showUploadView ? 'text-gray-800 bg-gray-100' : 'text-gray-500'
                    }`}
                  >
                    <i className="fa-solid fa-list-ul w-4 text-center"></i> PO Transaction List
                  </button>

                  {canManageUsers && (
                    <button
                      onClick={() => setShowUploadView(true)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left cursor-pointer ${
                        isDarkMode && showUploadView ? 'text-slate-200 bg-slate-800/50' : showUploadView ? 'text-gray-800 bg-gray-100' : 'text-gray-500'
                      }`}
                    >
                      <i className="fa-solid fa-file-excel w-4 text-center"></i> Excel Upload
                    </button>
                  )}
                </div>
              )}
            </div>

            {[
              { id: 'analytics', label: 'Analytics', icon: 'fa-chart-line' },
              { id: 'report', label: 'Report', icon: 'fa-file-lines' },
              { id: 'settings', label: 'Settings', icon: 'fa-gear' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                  isDarkMode
                    ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'
                }`}
              >
                <i className={`fa-solid ${item.icon} w-5 text-lg`}></i> {item.label}
              </button>
            ))}

            {canManageUsers && (
              <button
                onClick={() => handleNavigate('userManagement')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors text-left cursor-pointer ${
                  isDarkMode
                    ? 'text-amber-400 hover:bg-slate-800/80 hover:text-amber-300 font-medium'
                    : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-medium'
                }`}
              >
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0 overflow-y-auto p-8 space-y-6">          
          {showUploadView ? (
            <div className="w-full max-w-6xl mx-auto flex flex-col h-full">
              <div className="mb-6">
                <h1 className={`text-[28px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Excel Upload</h1>
                <p className={`text-[15px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Import data supplier dari file Excel.</p>
              </div>
              
              <div className={`flex-1 rounded-2xl border shadow-sm p-10 flex flex-col items-center justify-center text-center ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="w-16 h-16 rounded-full bg-[#E8F5E9] text-[#2E7D32] flex items-center justify-center mb-6">
                  <i className="fa-solid fa-file-excel text-3xl"></i>
                </div>
                
                <h2 className={`text-xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Upload Supplier Data via Excel</h2>
                <p className={`text-sm max-w-lg mb-8 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Upload file .xlsx atau .xls untuk import atau memperbarui data supplier.
                </p>
                
                <label className="cursor-pointer bg-[#00A651] hover:bg-[#008F45] text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 mb-6">
                  <i className="fa-solid fa-upload"></i> Choose Excel File
                  <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                </label>
                
                <button 
                  onClick={() => setShowUploadView(false)}
                  className={`text-sm font-semibold flex items-center gap-2 transition-colors ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-[#004797] hover:text-blue-700'}`}
                >
                  <i className="fa-solid fa-arrow-left"></i> Kembali ke Supplier List
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <div>
                  <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Purchase Orders</h1>
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Manage purchasing transactions and track order status.</p>
                </div>
              </div>

              {/* SUMMARY STAT CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <i className="fa-regular fa-file-lines text-xl"></i>
                  </div>
                  <div className="overflow-hidden">
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Purchase Orders</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stats.totalPO}</span>
                      <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Orders</span>
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-rotate-left text-xl"></i>
                  </div>
                  <div className="overflow-hidden">
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Awaiting Payment</p>
                    <span className={`text-xl font-bold truncate block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatUSDWithExchange(stats.waitingPaymentTotal, 'IDR')}</span>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                  <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-check text-xl"></i>
                  </div>
                  <div className="overflow-hidden">
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Completed POs</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stats.completedCount}</span>
                      <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Orders</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* TABEL PER 15 BARIS */}
              <div className={`border shadow-xs rounded-2xl p-6 overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>PO Transaction List</h2>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                    <div className="relative w-full sm:w-64">
                      <input type="text" placeholder="Search PO, Supplier..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className={`w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                      <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-xs text-gray-400"></i>
                    </div>
                  </div>
                </div>

                <div className="w-full overflow-x-auto pb-4">
                  <table className="w-full min-w-max text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className={`border-b ${isDarkMode ? 'border-slate-800 bg-[#0F172A] text-slate-400' : 'border-gray-200 bg-gray-50/50 text-gray-500'}`}>
                        <th className="py-3 font-semibold px-4">Product Group</th>
                        <th className="py-3 font-semibold px-4">Sub category</th>
                        <th className="py-3 font-semibold px-4">Type</th>
                        <th className="py-3 font-semibold px-4">Pack Slip</th>
                        <th className="py-3 font-semibold px-4">Date</th>
                        <th className="py-3 font-semibold px-4">PO</th>
                        <th className="py-3 font-semibold px-4 text-center">PO Line</th>
                        <th className="py-3 font-semibold px-4">PO Rel</th>
                        <th className="py-3 font-semibold px-4">Part</th>
                        <th className="py-3 font-semibold px-4 text-left">Description</th>
                        <th className="py-3 font-semibold px-4 text-center">Qty Received</th>
                        <th className="py-3 font-semibold px-4 text-center">UOM</th>
                        <th className="py-3 font-semibold px-4 text-right">Price</th>
                        <th className="py-3 font-semibold px-4 text-right">Amount</th>
                        <th className="py-3 font-semibold px-4 text-right">Spending IDR</th>
                        <th className="py-3 font-semibold px-4 text-right">Spending USD</th>
                        <th className="py-3 font-semibold px-4 text-center">Currency</th>
                        <th className="py-3 font-semibold px-4">Supplier</th>
                        <th className="py-3 font-semibold px-4 text-center">Local/Import</th>
                        <th className={`py-3 font-semibold px-4 text-center sticky right-0 z-10 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-gray-50/50'}`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                      {currentPaginatedRows.length === 0 ? (
                        <tr><td colSpan="20" className="py-8 text-center text-gray-400">No PO data available.</td></tr>
                      ) : (
                        currentPaginatedRows.map(({ order, item, itemIndex, rowId }) => {
                          const catName = order.category || order.kategori || 'Raw Material';
                          const dateStr = order.date || order.tanggal || new Date().toISOString().split('T')[0];
                          const isImport = order.purchasePoint === 'Import' || (order.supplier || '').toLowerCase().includes('overseas');
                          const orderType = order.type || 'Standard';
                          
                          const partNum = item.partNum || '-';
                          const description = item.name || order.notes || order.description || '-';
                          const qty = item.qty || item.quantity || 0;
                          const uom = item.uom || 'EA';
                          const price = item.price || item.harga || 0;
                          
                          const amount = qty > 0 ? (qty * price) : (order.totalCost || calculateGrandTotal(order) || 0);
                          const currentCurrency = String(order.currency || 'USD').toUpperCase();
                          const isUSD = currentCurrency === 'USD';
                          
                          const spendingIDR = isUSD ? amount * KURS_IDR_TO_USD : amount;
                          const spendingUSD = isUSD ? amount : amount / KURS_IDR_TO_USD;

                          return (
                            <tr key={rowId} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                              <td className="py-3 px-4">{catName}</td>
                              <td className="py-3 px-4">-</td>
                              <td className="py-3 px-4">{orderType}</td>
                              <td className="py-3 px-4">-</td>
                              <td className="py-3 px-4">{dateStr}</td>
                              <td className="py-3 px-4 font-bold text-red-500 cursor-pointer hover:underline">{order.poNumber}</td>
                              <td className="py-3 px-4 text-center">{itemIndex + 1}</td>
                              <td className="py-3 px-4">-</td>
                              <td className="py-3 px-4">{partNum}</td>
                              <td className="py-3 px-4 max-w-[200px] truncate" title={description}>{description}</td>
                              <td className="py-3 px-4 text-center">{qty || '-'}</td>
                              <td className="py-3 px-4 text-center">{uom}</td>
                              <td className="py-3 px-4 text-right">{new Intl.NumberFormat('en-US').format(price)}</td>
                              <td className="py-3 px-4 text-right font-semibold">{new Intl.NumberFormat('en-US').format(amount)}</td>
                              <td className="py-3 px-4 text-right">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(spendingIDR)}</td>
                              <td className="py-3 px-4 text-right">{usdFormatter.format(spendingUSD)}</td>
                              <td className="py-3 px-4 text-center">{currentCurrency}</td>
                              <td className="py-3 px-4 font-bold">{order.supplier || order.namaSupplier || '-'}</td>
                              <td className="py-3 px-4 text-center">{isImport ? 'Import' : 'Local'}</td>
                              
                              <td className={`py-3 px-4 text-center sticky right-0 z-10 ${isDarkMode ? 'bg-[#1E293B] hover:bg-slate-800' : 'bg-white hover:bg-gray-50'}`}>
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => handleTriggerPrint(order)} className="text-gray-400 hover:text-blue-500 p-1 cursor-pointer" title="Print PO">
                                    <i className="fa-solid fa-print"></i>
                                  </button>
                                  {canManageUsers && (
                                    <>
                                      <button onClick={() => handleEditClick(order)} className="text-gray-400 hover:text-blue-500 p-1 cursor-pointer" title="Edit"><i className="fa-regular fa-pen-to-square"></i></button>
                                      <button onClick={() => deletePO(order.id, order.poNumber)} className="text-gray-400 hover:text-red-500 p-1 cursor-pointer" title="Delete"><i className="fa-regular fa-trash-can"></i></button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* BOTTOM PAGINATION CONTROLS (NEXT PAGE / PREVIOUS PAGE) */}
                <div className={`mt-4 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-sm ${isDarkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'}`}>
                  <div>
                    Menampilkan <span className="font-bold text-[#004797]">{allFlattenedRows.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> - <span className="font-bold text-[#004797]">{Math.min(currentPage * itemsPerPage, allFlattenedRows.length)}</span> dari total <span className="font-bold">{allFlattenedRows.length}</span> baris
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                        currentPage === 1 
                          ? 'opacity-40 cursor-not-allowed border-gray-300' 
                          : isDarkMode ? 'border-slate-700 hover:bg-slate-800 text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <i className="fa-solid fa-chevron-left"></i> Previous
                    </button>

                    <span className="px-3 py-1 text-xs font-semibold">
                      Halaman {currentPage} dari {totalPages}
                    </span>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                        currentPage === totalPages || totalPages === 0
                          ? 'opacity-40 cursor-not-allowed border-gray-300' 
                          : isDarkMode ? 'border-slate-700 hover:bg-slate-800 text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      Next <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* MODAL FORM EDIT / ADD PO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className={`rounded-xl max-w-7xl w-full flex flex-col shadow-2xl border max-h-[96vh] ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'}`}>
            <div className={`px-4 py-3 border-b flex justify-between items-center rounded-t-xl shrink-0 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>PO {formData.poNo || formData.poNumber}</span>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 text-lg">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-gray-100/60'}`}>
              <div className={`border rounded-xl p-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block mb-1 font-semibold">PO Number *</label>
                    <input type="text" required value={formData.poNo || formData.poNumber} onChange={e => setFormData({ ...formData, poNo: e.target.value, poNumber: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200'}`} />
                  </div>
                  <div>
                    <label className="block mb-1 font-semibold">Supplier *</label>
                    <input type="text" required value={formData.supplier} onChange={e => setFormData({ ...formData, supplier: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200'}`} />
                  </div>
                </div>
              </div>
            </div>

            <div className={`px-4 py-3 border-t flex justify-end gap-2 ${isDarkMode ? 'border-slate-700 bg-[#1E293B]' : 'border-gray-200 bg-gray-50'}`}>
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-semibold border rounded-lg">Batal</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Simpan PO</button>
            </div>
          </form>
        </div>
      )}

      {/* PRINT VIEW DOCUMENT */}
      {printOrder && (
        <div id="printable-po-document" className="hidden bg-white text-black p-8 relative">
          <div className="flex justify-between items-start mb-8 border-b-2 border-gray-800 pb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">PURCHASE ORDER</h1>
              <p className="text-gray-600 mt-2 font-semibold text-lg">PO Number: {printOrder.poNumber}</p>
              <p className="text-gray-600">Date: {printOrder.date}</p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold text-red-600">Detmold Packaging</h2>
              <p className="text-md font-medium text-gray-700">PT Detpak Indonesia</p>
            </div>
          </div>

          <table className="w-full mb-8 border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-3 text-left w-12">No</th>
                <th className="border border-gray-300 p-3 text-left">Item Description</th>
                <th className="border border-gray-300 p-3 text-center w-20">Qty</th>
                <th className="border border-gray-300 p-3 text-right w-32">Unit Price</th>
                <th className="border border-gray-300 p-3 text-right w-32">Total</th>
              </tr>
            </thead>
            <tbody>
              {(printOrder.items && printOrder.items.length > 0 ? printOrder.items : [{ name: printOrder.notes || printOrder.description || '-', qty: 1, price: printOrder.totalCost }]).map((it, idx) => (
                <tr key={idx}>
                  <td className="border border-gray-300 p-3 text-center">{idx + 1}</td>
                  <td className="border border-gray-300 p-3">{it.name || it.deskripsi || '-'}</td>
                  <td className="border border-gray-300 p-3 text-center">{it.qty || 1}</td>
                  <td className="border border-gray-300 p-3 text-right">{new Intl.NumberFormat('en-US').format(it.price || 0)}</td>
                  <td className="border border-gray-300 p-3 text-right">{new Intl.NumberFormat('en-US').format((it.qty || 1) * (it.price || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}