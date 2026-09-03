import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';

// === USD FORMATTER HELPER ===
const usdFormatter = new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD', 
  minimumFractionDigits: 2 
});
const formatUSD = (number) => usdFormatter.format(number || 0);

// === DEFAULT FALLBACK DATA ===
const INITIAL_PO_DATA = [];

export default function PurchaseOrders({ 
  changePage, 
  onLogout, 
  orders: propOrders, 
  setOrders: propSetOrders,
  suppliers: propSuppliers 
}) {
  const { hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');

  // === 1. PO DATA STATE ===
  const [localOrders, setLocalOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('dataPO_Ladeu');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.log("Using default PO data");
    }
    return INITIAL_PO_DATA;
  });

  const orders = useMemo(() => {
    return Array.isArray(propOrders) && propOrders.length > 0 ? propOrders : localOrders;
  }, [propOrders, localOrders]);

  const setOrders = propSetOrders || setLocalOrders;

  // === 2. SUPPLIER DATA FETCHING ===
  const daftarSupplier = useMemo(() => {
    let rawSuppliers = [];
    if (Array.isArray(propSuppliers) && propSuppliers.length > 0) {
      rawSuppliers = propSuppliers;
    } else {
      try {
        const savedSuppliers = 
            localStorage.getItem('dataSuppliersLadeuV3') || 
            localStorage.getItem('dataSuppliers') || 
            localStorage.getItem('suppliers');
            
        if (savedSuppliers) rawSuppliers = JSON.parse(savedSuppliers);
      } catch (e) {
        console.log("Failed to read supplier data");
      }
    }

    if (rawSuppliers.length === 0) {
      return ["CV Bintang", "CV Melaju Bersama", "PT AE", "PT Rajendra Abadi", "PT Elektronik Maju", "Muda Paper Mills Sdn Bhd"];
    }

    return rawSuppliers.map(s => typeof s === 'string' ? s : (s.name || s.nama || s.perusahaan || s.supplier)).filter(Boolean);
  }, [propSuppliers]);

  // === 3. UI & PROFILE STATE ===
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const profileRef = useRef(null);
  
  // Header Clock State
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  const profile = useMemo(() => ({ 
    name: 'Admin', 
    email: 'admin@detpak.com', 
    role: 'Administrator' 
  }), []);

  const handleNavigate = (page) => {
    if (changePage) changePage(page);
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
    else handleNavigate('login');
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // === 4. FILTER & SEARCH STATE ===
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const calculateGrandTotal = (order) => {
    if (!order) return 0;
    const directTotal = order.totalCost ?? order.totalNilai ?? order.grandTotal ?? order.amount ?? order.total;
    if (directTotal !== undefined && directTotal !== null && directTotal !== 0) {
      if (typeof directTotal === 'number') return directTotal;
      const cleaned = String(directTotal).replace(/[^0-9.]/g, '');
      if (cleaned) return Number(cleaned);
    }

    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length > 0) {
      return items.reduce((sum, item) => {
        const q = Number(item?.qty || item?.quantity || 1) || 0;
        const p = Number(item?.price || item?.hargaSatuan || item?.harga || 0) || 0;
        return sum + (q * p);
      }, 0);
    }
    return 0;
  };

  // === 5. DATA SUMMARY (STATS) ===
  const stats = useMemo(() => {
    const totalPO = orders.length;
    const urgentCount = orders.filter(o => {
      const prio = (o.priority || o.prioritas || '').toUpperCase();
      return prio === 'URGENT';
    }).length;

    const waitingPaymentTotal = orders
      .filter(o => {
        const st = (o.status || o.statusPesanan || '').toUpperCase();
        return st.includes('APPROVAL') || st.includes('PAYMENT') || st.includes('PEMBAYARAN') || st === 'PENDING';
      })
      .reduce((sum, o) => {
        const val = calculateGrandTotal(o);
        const curr = String(o.currency || 'IDR').toUpperCase();
        // Normalisasi untuk stat bar jika USD
        if(curr === 'USD') return sum + (val * 15500);
        return sum + val;
      }, 0);

    const completedCount = orders.filter(o => {
      const st = (o.status || o.statusPesanan || '').toUpperCase();
      return st === 'COMPLETED' || st === 'SELESAI';
    }).length;

    return { totalPO, urgentCount, waitingPaymentTotal, completedCount };
  }, [orders]);

  // === 6. MODAL FORM STATE (EDIT PO) ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutsideDropdown = (event) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideDropdown);
    return () => document.removeEventListener('mousedown', handleClickOutsideDropdown);
  }, []);

  const [printOrder, setPrintOrder] = useState(null);

  // Accordion Expand/Collapse States
  const [isHeaderOpen, setIsHeaderOpen] = useState(true);
  const [isLinesOpen, setIsLinesOpen] = useState(true);

  // === FORM DATA STATE ===
  const [formData, setFormData] = useState({
    poNumber: '',
    type: 'Standard',
    buyer: 'Local Purchasing',
    category: 'Raw Material',
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    promiseDate: '',
    currency: 'USD',
    exchangeRate: '1.000000',
    supplier: '',
    purchasePoint: '',
    address: '',
    attn: 'None Selected',
    phone: '',
    fax: '',
    shipVia: 'Sea freight - standard agent',
    prepaidFreight: false,
    terms: '60 Days from Bill of Lading',
    fob: '',
    enteredBy: 'Admin',
    supplierOrderNumber: '',
    isApproved: false,
    status: 'Unsubmitted',
    priority: 'Normal',
    charges: '0.00',
    misc: '0.00',
    tax: '0.00',
    notes: '',
    items: [{ id: 1, partNum: '', name: '', dueDate: '', qty: 1, uom: 'EA', price: '' }]
  });

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: Date.now(), partNum: '', name: '', dueDate: '', qty: 1, uom: 'EA', price: '' }]
    });
  };

  const handleRemoveItem = (index) => {
    if (formData.items.length === 1) return;
    const updated = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updated });
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...formData.items];
    updated[index][field] = value;
    setFormData({ ...formData, items: updated });
  };

  const formGrandTotal = useMemo(() => {
    const itemsTotal = formData.items.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.price) || 0)), 0);
    const charges = Number(formData.charges) || 0;
    const misc = Number(formData.misc) || 0;
    const tax = Number(formData.tax) || 0;
    return itemsTotal + charges + misc + tax;
  }, [formData.items, formData.charges, formData.misc, formData.tax]);

  // === IMPORT EXCEL HANDLER ===
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const groupedOrders = {};

      jsonData.forEach((row, index) => {
        const poNumStr = String(row['PO'] || `TEMP-${index}`);
        const finalPoNum = poNumStr.startsWith('PO-') ? poNumStr : `PO-${poNumStr}`;

        if (!groupedOrders[finalPoNum]) {
          let formattedDate = new Date().toISOString().split('T')[0];
          
          if (row['Date']) {
            if (typeof row['Date'] === 'number') {
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              const jsDate = new Date(excelEpoch.getTime() + row['Date'] * 86400000);
              formattedDate = jsDate.toISOString().split('T')[0];
            } else {
              const parsedDate = new Date(row['Date']);
              if (!isNaN(parsedDate)) {
                formattedDate = parsedDate.toISOString().split('T')[0];
              }
            }
          }

          // === LOGIKA MAPPING KATEGORI SESUAI EXCEL ===
          let rawCategory = row['Product Group'] || 'Raw Material';
          let mappedCategory = rawCategory;
          const lowerCat = String(rawCategory).toLowerCase().trim();
          
          if (lowerCat.includes('sp') || lowerCat.includes('sparepart') || lowerCat.includes('spare parts') || lowerCat.includes('spare')) {
            mappedCategory = 'Spare Parts';
          } else if (lowerCat.includes('rm') || lowerCat.includes('raw material') || lowerCat.includes('paper')) {
            mappedCategory = 'Raw Material';
          }

          groupedOrders[finalPoNum] = {
            id: Date.now() + Math.random(),
            poNumber: finalPoNum,
            type: row['Type'] || 'Standard',
            buyer: row['Local/Import'] === 'Import' ? 'Import Purchasing' : 'Local Purchasing - MTS',
            category: mappedCategory,
            date: formattedDate,
            dueDate: '',
            promiseDate: '',
            currency: row['Currency'] || 'USD',
            exchangeRate: '1.000000',
            supplier: row['Supplier'] || '',
            namaSupplier: row['Supplier'] || '',
            purchasePoint: row['Local/Import'] || 'Local',
            address: '',
            attn: 'None Selected',
            phone: '',
            fax: '',
            shipVia: 'Sea freight - standard agent',
            prepaidFreight: false,
            terms: '60 Days from Bill of Lading',
            fob: '',
            enteredBy: 'Admin (Excel Import)',
            supplierOrderNumber: row['Pack Slip'] || '',
            isApproved: true,
            status: 'COMPLETED',
            priority: 'Normal',
            charges: '0.00',
            misc: '0.00',
            tax: '0.00',
            notes: row['Sub category'] ? `Sub category: ${row['Sub category']}` : '',
            items: []
          };
        }

        groupedOrders[finalPoNum].items.push({
          id: Date.now() + Math.random(),
          poLine: row['PO Line'] || '',
          poRel: row['PO Rel'] || '',
          partNum: row['Part'] || '',
          name: row['Description'] || '',
          dueDate: '',
          qty: row['Qty Received'] || 1,
          quantity: row['Qty Received'] || 1,
          uom: row['UOM'] || 'EA',
          price: row['Price'] || 0,
          harga: row['Price'] || 0,
          amount: row['Amount '] !== undefined ? row['Amount '] : (row['Amount'] || 0)
        });
      });

      const newImportedOrders = Object.values(groupedOrders).map(order => {
        const total = order.items.reduce((sum, item) => {
          const itemTotal = item.amount ? Number(item.amount) : (Number(item.qty) * Number(item.price));
          return sum + itemTotal;
        }, 0);
        return {
          ...order,
          totalCost: total,
          totalNilai: total,
          grandTotal: total
        };
      });

      const updatedOrders = [...newImportedOrders, ...orders];
      setOrders(updatedOrders);
      localStorage.setItem('dataPO_Ladeu', JSON.stringify(updatedOrders));
      
      // ✅ TAMBAHAN: POST setiap PO yang diimpor ke backend
      newImportedOrders.forEach(po => {
        savePurchaseOrderToBackend(po);
      });
      
      alert('Data Excel berhasil diimpor!');
      e.target.value = null;
    };
    reader.readAsArrayBuffer(file);
  };

  // === OPEN EDIT MODAL ===
  const handleEditClick = (order) => {
    setEditingId(order.id);
    const existingItems = Array.isArray(order.items) && order.items.length > 0 
      ? order.items.map(i => ({
          id: i.id || Date.now(),
          partNum: i.partNum || '',
          name: i.name || i.description || order.notes || 'PO Item',
          dueDate: i.dueDate || order.dueDate || '',
          qty: i.qty || i.quantity || 1,
          uom: i.uom || 'EA',
          price: i.price || i.hargaSatuan || i.harga || ''
        }))
      : [{ id: 1, partNum: '', name: order.notes || 'Purchase Order Item', dueDate: order.dueDate || '', qty: 1, uom: 'EA', price: calculateGrandTotal(order) }];

    setFormData({
      poNumber: (order.poNumber || '').replace('PO-', ''),
      type: order.type || 'Standard',
      buyer: order.buyer || 'Local Purchasing - MTS',
      category: order.category || order.kategori || 'Raw Material',
      date: order.date || order.tanggal || new Date().toISOString().split('T')[0],
      dueDate: order.dueDate || '',
      promiseDate: order.promiseDate || '',
      currency: order.currency || 'USD',
      exchangeRate: order.exchangeRate || '1.000000',
      supplier: order.supplier || order.namaSupplier || '',
      purchasePoint: order.purchasePoint || '',
      address: order.address || '',
      attn: order.attn || 'None Selected',
      phone: order.phone || '',
      fax: order.fax || '',
      shipVia: order.shipVia || 'Sea freight - standard agent',
      prepaidFreight: order.prepaidFreight || false,
      terms: order.terms || '60 Days from Bill of Lading',
      fob: order.fob || '',
      enteredBy: order.enteredBy || 'Admin',
      supplierOrderNumber: order.supplierOrderNumber || '',
      isApproved: order.isApproved || false,
      status: order.status || order.statusPesanan || 'Unsubmitted',
      priority: order.priority || order.prioritas || 'Normal',
      charges: order.charges || '0.00',
      misc: order.misc || '0.00',
      tax: order.tax || '0.00',
      notes: order.notes || '',
      items: existingItems
    });
    setIsModalOpen(true);
  };

  // === SAVE MODAL ===
  // ✅ TAMBAHAN: Fungsi async untuk POST Purchase Order ke backend
  const savePurchaseOrderToBackend = async (poData) => {
    try {
      const response = await fetch('http://localhost:5000/api/purchase-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          po_number: poData.poNumber,
          supplier_id: 1,
          po_date: poData.date,
          total_amount: poData.totalCost || 0,
          status: poData.status || 'pending',
          category: poData.category,
          description: poData.notes
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error:', errorData);
        return false;
      }

      const result = await response.json();
      console.log('✅ Purchase Order berhasil disimpan ke database:', result);
      return true;
    } catch (error) {
      console.error('❌ Error saat POST ke backend:', error);
      return false;
    }
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const poNumStr = formData.poNumber.startsWith('PO-') ? formData.poNumber : `PO-${formData.poNumber}`;
    const commonData = {
      poNumber: poNumStr,
      date: formData.date,
      dueDate: formData.dueDate,
      promiseDate: formData.promiseDate,
      type: formData.type,
      buyer: formData.buyer,
      currency: formData.currency,
      exchangeRate: formData.exchangeRate,
      terms: formData.terms,
      shipVia: formData.shipVia,
      prepaidFreight: formData.prepaidFreight,
      fob: formData.fob,
      supplier: formData.supplier,
      purchasePoint: formData.purchasePoint,
      address: formData.address,
      attn: formData.attn,
      phone: formData.phone,
      fax: formData.fax,
      enteredBy: formData.enteredBy,
      supplierOrderNumber: formData.supplierOrderNumber,
      category: formData.category,
      kategori: formData.category,
      notes: formData.notes,
      isApproved: formData.isApproved,
      status: formData.status,
      priority: formData.priority,
      charges: formData.charges,
      misc: formData.misc,
      tax: formData.tax,
      totalCost: formGrandTotal,
      totalNilai: formGrandTotal,
      items: formData.items
    };

    if (editingId) {
      const updated = orders.map(o => o.id === editingId ? { ...o, ...commonData } : o);
      setOrders(updated);
      localStorage.setItem('dataPO_Ladeu', JSON.stringify(updated));
      
      // ✅ TAMBAHAN: POST ke backend setelah disimpan ke localStorage
      await savePurchaseOrderToBackend(commonData);
    }
    setIsModalOpen(false);
  };

  const KURS_IDR_TO_USD = 15500;

  // Penyesuaian formatter untuk handle multicurrency (IDR dan USD) dari file excel
  const formatUSDWithExchange = (amount, currency = 'IDR') => {
    const curr = String(currency).toUpperCase();
    if (curr === 'USD') {
      return usdFormatter.format(amount || 0);
    }
    const amountInUSD = (amount || 0) / KURS_IDR_TO_USD;
    return usdFormatter.format(amountInUSD);
  };

  const deletePO = (id, poNumber) => {
    if (window.confirm(`Delete document ${poNumber || 'PO'}?`)) {
      const updated = orders.filter(o => o.id !== id);
      setOrders(updated);
      localStorage.setItem('dataPO_Ladeu', JSON.stringify(updated));
    }
  };

  const handleTriggerPrint = (order) => {
    setPrintOrder(order);
  };

  const executePrint = () => {
    window.print();
  };

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

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
      
      <style>{`
        @media print {
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
              <span className={`text-[36px] font-bold tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-[#004797]'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Det<span className="border-b-[4px] border-[#E31837] pb-1">pak</span>
              </span>
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
              <button onClick={() => setShowProfileCard(!showProfileCard)} className={`flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer font-bold text-lg ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>
                Admin <i className={`fa-solid fa-chevron-down text-[12px] ml-1 transition-transform duration-200 ${showProfileCard ? 'rotate-180' : ''}`}></i>
              </button>
              
              {showProfileCard && (
                <div className={`absolute right-0 mt-3 w-64 border rounded-xl shadow-xl p-4 z-50 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#004797] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                      AD
                    </div>
                    <div className="overflow-hidden">
                      <h4 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{profile.name}</h4>
                      <p className="text-sm text-gray-400 truncate">{profile.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded">{profile.role}</span>
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
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => handleNavigate('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => handleNavigate('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => handleNavigate('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => handleNavigate('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => handleNavigate('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => handleNavigate('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>

            {canManageUsers && (
              <button onClick={() => handleNavigate('userManagement')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-400 rounded-xl hover:bg-slate-800/80 hover:text-amber-300 transition-colors text-left cursor-pointer">
                <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
              </button>
            )}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <div>
            <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Purchase Orders</h1>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Manage purchasing transactions and track order status.</p>
          </div>

          {/* SUMMARY STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 hover:shadow-md transition-all ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <i className="fa-regular fa-file-lines text-xl"></i>
              </div>
              <div className="overflow-hidden">
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Purchase Orders</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stats.totalPO}</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Orders</span>
                </div>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 hover:shadow-md transition-all ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <i className="fa-solid fa-rotate-left text-xl"></i>
              </div>
              <div className="overflow-hidden">
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Awaiting Payment</p>
                <div>
                  <span className={`text-xl font-bold tracking-tight block truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatUSDWithExchange(stats.waitingPaymentTotal, 'IDR')}
                  </span>
                </div>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 hover:shadow-md transition-all ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <i className="fa-solid fa-check text-xl"></i>
              </div>
              <div className="overflow-hidden">
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Completed POs</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stats.completedCount}</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Orders</span>
                </div>
              </div>
            </div>
          </div>

          {/* PO TRANSACTION TABLE AREA */}
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
                
                {/* TOMBOL IMPORT EXCEL */}
                <label className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0">
                  <i className="fa-solid fa-file-excel text-xs"></i> Import Excel
                  <input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800 bg-[#0F172A] text-slate-400' : 'border-gray-200 bg-gray-50/50 text-gray-500'}`}>
                    <th className="py-3 font-semibold px-4">PO No.</th>
                    <th className="py-3 font-semibold px-4">Supplier</th>
                    <th className="py-3 font-semibold px-4">Category</th>
                    <th className="py-3 font-semibold px-4 text-left">Description</th>
                    <th className="py-3 font-semibold px-4">Total Amount</th>
                    <th className="py-3 font-semibold px-4 text-center">Order Status</th>
                    <th className="py-3 font-semibold px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan="7" className="py-8 text-center text-gray-400">No PO data available.</td></tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const totalVal = calculateGrandTotal(order);
                      const catName = order.category || order.kategori || 'General';
                      const statusStr = (order.status || order.statusPesanan || 'Unsubmitted').toUpperCase();
                      const dateStr = order.date || order.tanggal || '2026-08-17';
                      const isDone = statusStr === 'COMPLETED' || statusStr === 'SELESAI';
                      const isShippedOrDone = isDone || statusStr === 'SHIPPED' || statusStr === 'DIKIRIM';
                      
                      const isImport = order.purchasePoint === 'Import';

                      return (
                        <tr key={order.id} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                          <td className="py-4 px-4 font-bold text-red-500 cursor-pointer hover:underline">{order.poNumber}</td>
                          <td className="py-4 px-4">
                            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>{order.supplier || order.namaSupplier || '-'}</div>
                            <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>{dateStr}</div>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                              {catName}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border ${isDarkMode ? 'border-emerald-800 text-emerald-400 bg-transparent' : 'border-emerald-600 text-emerald-600 bg-transparent'}`}>
                              {isImport ? '🚢 Import' : '📦 Lokal'}
                            </span>
                          </td>
                          <td className={`py-4 px-4 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {formatUSDWithExchange(totalVal, order.currency)}
                          </td>
                          
                          <td className="py-4 px-4 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                                <span className={`w-6 h-0.5 ${isShippedOrDone ? 'bg-red-500' : isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}></span>
                                <span className={`w-2.5 h-2.5 rounded-full ${isShippedOrDone ? 'bg-red-500' : isDarkMode ? 'bg-slate-600' : 'bg-gray-300'}`}></span>
                                <span className={`w-6 h-0.5 ${isDone ? 'bg-red-500' : isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}></span>
                                <span className={`w-2.5 h-2.5 rounded-full ${isDone ? 'bg-red-500' : isDarkMode ? 'bg-slate-600' : 'bg-gray-300'}`}></span>
                              </div>
                              <span className={`text-[10px] font-extrabold tracking-wider uppercase ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{statusStr}</span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleTriggerPrint(order)} 
                                className="text-gray-400 hover:text-gray-200 p-1 cursor-pointer transition-colors" 
                                title="Print Specific PO"
                              >
                                <i className="fa-solid fa-print"></i>
                              </button>
                              <button onClick={() => handleEditClick(order)} className="text-gray-400 hover:text-blue-500 p-1 cursor-pointer transition-colors" title="Edit"><i className="fa-regular fa-pen-to-square"></i></button>
                              <button onClick={() => deletePO(order.id, order.poNumber)} className="text-gray-400 hover:text-red-500 p-1 cursor-pointer transition-colors" title="Delete"><i className="fa-regular fa-trash-can"></i></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* MODAL FORM EDIT PO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <form onSubmit={handleSaveModal} className={`rounded-xl max-w-7xl w-full flex flex-col shadow-2xl border transform transition-all max-h-[96vh] ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'}`}>
            
            {/* MODAL HEADER */}
            <div className={`px-4 py-3 border-b flex justify-between items-center rounded-t-xl shrink-0 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>PO {formData.poNumber}</span>
                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-600 text-white">Open</span>
                </div>

                <div className={`flex items-center gap-2 text-xs border px-2.5 py-1 rounded ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-300' : 'bg-white border-gray-200 text-gray-700'}`}>
                  <span className="text-gray-400">PO Date</span>
                  <span className="font-semibold">{formData.date}</span>
                </div>

                <span className="px-2.5 py-1 rounded text-xs font-medium border border-emerald-500/40 text-emerald-500 bg-emerald-500/10">
                  Tax Exclusive Pricing
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <span className="text-xs text-gray-400 block font-medium">Order Total</span>
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>US$ {formGrandTotal.toFixed(2)}</span>
                </div>
                
                <button type="submit" title="Save PO" className="p-2 text-blue-500 hover:text-blue-400 transition-colors cursor-pointer text-lg">
                  <i className="fa-regular fa-floppy-disk"></i>
                </button>

                <button type="button" onClick={() => setIsModalOpen(false)} title="Close Modal" className={`p-1.5 transition-colors cursor-pointer text-lg ${isDarkMode ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* MODAL BODY */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-gray-100/60'}`}>
              
              {/* SECTION 1: PO HEADER ACCORDION */}
              <div className={`border rounded-xl shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                <button 
                  type="button" 
                  onClick={() => setIsHeaderOpen(!isHeaderOpen)}
                  className={`w-full px-4 py-2.5 text-left text-sm font-bold flex items-center gap-2 border-b transition-colors cursor-pointer ${isDarkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800/50' : 'border-gray-100 text-gray-800 hover:bg-gray-50'}`}
                >
                  <i className={`fa-solid fa-chevron-${isHeaderOpen ? 'down' : 'right'} text-xs text-gray-400`}></i>
                  PO Header
                </button>

                {isHeaderOpen && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
                    
                    {/* COLUMN 1 */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Order</h5>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>PO Number *</label>
                          <input type="text" required value={formData.poNumber} onChange={e => setFormData({ ...formData, poNumber: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                        </div>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Type *</label>
                          <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="Standard">Standard</option>
                            <option value="Blanket">Blanket</option>
                            <option value="Contract">Contract</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Buyer *</label>
                          <select value={formData.buyer} onChange={e => setFormData({ ...formData, buyer: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="Local Purchasing - MTS">Local Purchasing</option>
                            <option value="Import Purchasing">Import Purchasing</option>
                            <option value="General Purchasing">General Purchasing</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Category (Material Type) *</label>
                          <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="Raw Material">Raw Material</option>
                            <option value="Consumable Material">Consumable Material</option>
                            <option value="Spare Parts">Spare Parts</option>
                            <option value="Maintenance">Maintenance</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Dates</h5>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>PO Date</label>
                          <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} style={{ colorScheme: isDarkMode ? 'dark' : 'light' }} />
                        </div>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Due Date</label>
                          <input type="date" value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} style={{ colorScheme: isDarkMode ? 'dark' : 'light' }} />
                        </div>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Promise Date</label>
                          <input type="date" value={formData.promiseDate} onChange={e => setFormData({ ...formData, promiseDate: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} style={{ colorScheme: isDarkMode ? 'dark' : 'light' }} />
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Currency</h5>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Currency *</label>
                          <select value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="USD">USD</option>
                            <option value="IDR">IDR</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Exchange Rate</label>
                          <input type="text" value={formData.exchangeRate} onChange={e => setFormData({ ...formData, exchangeRate: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                        </div>
                      </div>
                    </div>

                    {/* COLUMN 2 */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Supplier</h5>
                        
                        <div className="relative" ref={supplierDropdownRef}>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Supplier *</label>
                          <input type="text" required placeholder="Search Supplier..." value={formData.supplier} onChange={e => { setFormData({ ...formData, supplier: e.target.value }); setShowSupplierDropdown(true); }} onFocus={() => setShowSupplierDropdown(true)} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                          
                          {showSupplierDropdown && (
                            <div className={`absolute z-50 w-full mt-1 border rounded-lg shadow-lg max-h-40 overflow-y-auto py-1 ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                              {daftarSupplier.filter(s => s.toLowerCase().includes((formData.supplier || '').toLowerCase())).map((supplier, index) => (
                                <div key={index} onClick={() => { setFormData({ ...formData, supplier: supplier }); setShowSupplierDropdown(false); }} className={`px-3 py-1.5 text-xs cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}>
                                  {supplier}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Purchase Point</label>
                          <input type="text" value={formData.purchasePoint} onChange={e => setFormData({ ...formData, purchasePoint: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                        </div>

                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Address</label>
                          <textarea rows="3" placeholder="Street, City, Zip, Country" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none resize-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}></textarea>
                        </div>

                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Attn</label>
                          <select value={formData.attn} onChange={e => setFormData({ ...formData, attn: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="None Selected">None Selected</option>
                            <option value="Sales Dept">Sales Dept</option>
                            <option value="Marketing Dept">Marketing Dept</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Phone</label>
                            <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                          </div>
                          <div>
                            <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Fax</label>
                            <input type="text" value={formData.fax} onChange={e => setFormData({ ...formData, fax: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* COLUMN 3 */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Additional</h5>
                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Ship Via *</label>
                          <select value={formData.shipVia} onChange={e => setFormData({ ...formData, shipVia: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="Sea freight - standard agent">Sea freight - standard agent</option>
                            <option value="Air freight">Air freight</option>
                            <option value="Land Trucking">Land Trucking</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2 py-1">
                          <input type="checkbox" id="prepaidFreight" checked={formData.prepaidFreight} onChange={e => setFormData({ ...formData, prepaidFreight: e.target.checked })} className="rounded text-blue-600 focus:ring-blue-500" />
                          <label htmlFor="prepaidFreight" className={`font-medium cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Prepaid Freight</label>
                        </div>

                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Terms</label>
                          <select value={formData.terms} onChange={e => setFormData({ ...formData, terms: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="60 Days from Bill of Lading">60 Days from Bill of Lading</option>
                            <option value="30 Days Net">30 Days Net</option>
                            <option value="Cash On Delivery">Cash On Delivery</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>FOB</label>
                          <select value={formData.fob} onChange={e => setFormData({ ...formData, fob: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                            <option value="">-- Select FOB --</option>
                            <option value="Origin">Origin</option>
                            <option value="Destination">Destination</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block mb-1 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Entered By</label>
                          <input type="text" readOnly value={formData.enteredBy} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none opacity-80 cursor-not-allowed ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-400' : 'bg-gray-100 border-gray-200 text-gray-600'}`} />
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Supplier Reference</h5>
                        <div>
                          <input type="text" placeholder="Supplier Order Number" value={formData.supplierOrderNumber} onChange={e => setFormData({ ...formData, supplierOrderNumber: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                        </div>
                      </div>
                    </div>

                    {/* COLUMN 4 */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Status</h5>
                        
                        <div className={`flex items-center justify-between border px-3 py-2 rounded ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-white border-gray-200'}`}>
                          <span className={`font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Approve</span>
                          <input type="checkbox" checked={formData.isApproved} onChange={e => setFormData({ ...formData, isApproved: e.target.checked, status: e.target.checked ? 'Ready To Process' : 'Unsubmitted' })} className="rounded text-blue-600 focus:ring-blue-500" />
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className={`p-2 rounded text-center font-semibold border ${formData.status === 'Unsubmitted' ? 'border-amber-500/50 text-amber-500 bg-amber-500/10' : 'border-gray-300 text-gray-400'}`}>
                            Unsubmitted
                          </div>
                          <div className={`p-2 rounded text-center font-semibold border ${formData.status === 'Ready To Process' ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-gray-200 text-gray-400'}`}>
                            <i className="fa-solid fa-check text-xs mr-1"></i> Ready To Process
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Summary</h5>
                        
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className={isDarkMode ? 'text-slate-400' : 'text-gray-500'}>Charges US$</span>
                            <span className="font-semibold">{(Number(formData.charges) || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className={isDarkMode ? 'text-slate-400' : 'text-gray-500'}>Misc US$</span>
                            <span className="font-semibold">{(Number(formData.misc) || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className={isDarkMode ? 'text-slate-400' : 'text-gray-500'}>Tax US$</span>
                            <span className="font-semibold">{(Number(formData.tax) || 0).toFixed(2)}</span>
                          </div>
                          <div className={`flex justify-between items-center pt-2 border-t font-bold ${isDarkMode ? 'border-slate-700 text-white' : 'border-gray-200 text-gray-900'}`}>
                            <span>Order Total US$</span>
                            <span>{formGrandTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className={`font-bold pb-1 border-b text-[11px] uppercase tracking-wider ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-gray-500 border-gray-100'}`}>Header Comments</h5>
                        <textarea rows="3" placeholder="Enter comments here..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded text-xs outline-none resize-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}></textarea>
                      </div>

                    </div>

                  </div>
                )}
              </div>

              {/* SECTION 2: LINES ACCORDION & TABLE */}
              <div className={`border rounded-xl shadow-xs overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className={`px-4 py-2.5 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                  <button 
                    type="button" 
                    onClick={() => setIsLinesOpen(!isLinesOpen)}
                    className={`text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer ${isDarkMode ? 'text-slate-200 hover:text-white' : 'text-gray-800 hover:text-gray-900'}`}
                  >
                    <i className={`fa-solid fa-chevron-${isLinesOpen ? 'down' : 'right'} text-xs text-gray-400`}></i>
                    Lines
                  </button>

                  <div className="flex items-center gap-3">
                    <select className={`px-2 py-1 border rounded text-xs outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-800'}`}>
                      <option value="All">All</option>
                    </select>

                    <button 
                      type="button" 
                      onClick={handleAddItem}
                      className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-plus text-[10px]"></i> Add Line
                    </button>
                  </div>
                </div>

                {isLinesOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead>
                        <tr className={`border-b ${isDarkMode ? 'border-slate-800 bg-[#0F172A] text-slate-400' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                          <th className="py-2.5 px-3 font-semibold">Line ↑</th>
                          <th className="py-2.5 px-3 font-semibold">Part Num</th>
                          <th className="py-2.5 px-3 font-semibold">Description</th>
                          <th className="py-2.5 px-3 font-semibold">Due Date</th>
                          <th className="py-2.5 px-3 font-semibold text-center">Our Quantity</th>
                          <th className="py-2.5 px-3 font-semibold text-center">UOM</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Unit Price</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Ext Price</th>
                          <th className="py-2.5 px-3 font-semibold text-center">Act</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80' : 'divide-gray-100'}`}>
                        {formData.items.map((item, index) => {
                          const extPrice = (Number(item.qty) || 0) * (Number(item.price) || 0);
                          return (
                            <tr key={item.id} className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-gray-50/50'}>
                              <td className="py-2 px-3 font-medium text-center text-gray-400 w-12">
                                {index + 1}
                              </td>

                              <td className="py-2 px-3 w-36">
                                <input type="text" value={item.partNum || ''} onChange={(e) => handleItemChange(index, 'partNum', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </td>

                              <td className="py-2 px-3">
                                <input type="text" required value={item.name} onChange={(e) => handleItemChange(index, 'name', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </td>

                              <td className="py-2 px-3 w-36">
                                <input type="date" value={item.dueDate || ''} onChange={(e) => handleItemChange(index, 'dueDate', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} style={{ colorScheme: isDarkMode ? 'dark' : 'light' }} />
                              </td>

                              <td className="py-2 px-3 w-24">
                                <input type="number" required min="1" value={item.qty} onChange={(e) => handleItemChange(index, 'qty', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs text-center outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </td>

                              <td className="py-2 px-3 w-20">
                                <input type="text" value={item.uom || 'EA'} onChange={(e) => handleItemChange(index, 'uom', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs text-center outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </td>

                              <td className="py-2 px-3 w-32">
                                <input type="number" step="0.01" min="0" value={item.price} onChange={(e) => handleItemChange(index, 'price', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs text-right outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </td>

                              <td className={`py-2 px-3 text-right font-bold w-32 ${isDarkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                                ${extPrice.toFixed(2)}
                              </td>

                              <td className="py-2 px-3 text-center w-12">
                                {formData.items.length > 1 && (
                                  <button type="button" onClick={() => handleRemoveItem(index)} className="text-gray-400 hover:text-red-500 transition-colors p-1 cursor-pointer">
                                    <i className="fa-regular fa-trash-can"></i>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          </form>
        </div>
      )}

      {/* PRINT PREVIEW MODAL */}
      {printOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
          <div className={`w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative ${isDarkMode ? 'bg-[#1E293B] text-slate-100' : 'bg-white'}`}>
            
            <div className={`border-b px-6 py-4 flex justify-between items-center shrink-0 ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
              <h3 className={`font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}><i className="fa-solid fa-print text-gray-500"></i> Print Preview</h3>
              <div className="flex gap-3">
                <button onClick={() => setPrintOrder(null)} className={`px-4 py-2 rounded-lg font-medium transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-200'}`}>
                  Close
                </button>
                <button onClick={executePrint} className="px-6 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all flex items-center gap-2">
                  <i className="fa-solid fa-print"></i> Print Now
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto p-8 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-gray-100/50'}`}>
              <div id="printable-po-document" className="bg-white p-10 max-w-3xl mx-auto border border-gray-200 shadow-sm" style={{ minHeight: '297mm' }}>
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
                  <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">PURCHASE ORDER</h1>
                    <p className="text-gray-500 mt-1 font-medium">{printOrder.poNumber}</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-red-600">PT. Ladeu Internasional</h2>
                    <p className="text-sm text-gray-600 mt-1">Ladeu Tower Bldg 12th Fl.<br/>Jl. Sudirman No. 45, Central Jakarta 10220<br/>Phone: (021) 555-0198</p>
                  </div>
                </div>

                <div className="flex justify-between mb-10">
                  <div className="w-1/2 pr-4">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">To:</h4>
                    <p className="text-lg font-bold text-gray-900">{printOrder.supplier || printOrder.namaSupplier}</p>
                    <p className="text-sm text-gray-600 mt-1">Sales / Marketing Division</p>
                  </div>
                  <div className="w-1/3 text-right">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr><td className="py-1 text-gray-500">Date:</td><td className="py-1 font-medium text-gray-900">{printOrder.date || printOrder.tanggal}</td></tr>
                        <tr><td className="py-1 text-gray-500">Category:</td><td className="py-1 font-medium text-gray-900">{printOrder.category || printOrder.kategori}</td></tr>
                        <tr><td className="py-1 text-gray-500">Priority:</td><td className="py-1 font-medium text-red-600">{printOrder.priority || printOrder.prioritas}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <table className="w-full mb-8">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-3 px-4 text-left text-xs font-bold text-gray-700 uppercase">No.</th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-gray-700 uppercase">Order Description</th>
                      <th className="py-3 px-4 text-center text-xs font-bold text-gray-700 uppercase">Qty</th>
                      <th className="py-3 px-4 text-right text-xs font-bold text-gray-700 uppercase">Unit Price</th>
                      <th className="py-3 px-4 text-right text-xs font-bold text-gray-700 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Array.isArray(printOrder.items) && printOrder.items.length > 0 ? (
                      printOrder.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-3 px-4 text-sm text-gray-900">{idx + 1}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 font-medium">{item.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 text-center">{item.qty || item.quantity || 1}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 text-right">{formatUSDWithExchange(item.price || item.harga || 0, printOrder.currency)}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 text-right font-semibold">{formatUSDWithExchange((item.qty || 1) * (item.price || 0), printOrder.currency)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-3 px-4 text-sm text-gray-900">1</td>
                        <td className="py-3 px-4 text-sm text-gray-900 font-medium">{printOrder.notes || 'Package Purchase'}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-center">1</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right">{formatUSDWithExchange(calculateGrandTotal(printOrder), printOrder.currency)}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right font-semibold">{formatUSDWithExchange(calculateGrandTotal(printOrder), printOrder.currency)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" className="py-4 px-4 text-right font-bold text-gray-900">GRAND TOTAL</td>
                      <td className="py-4 px-4 text-right font-black text-lg text-red-600 border-t-2 border-gray-800">
                        {formatUSDWithExchange(calculateGrandTotal(printOrder), printOrder.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {printOrder.notes && (
                  <div className="mb-10">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Special Notes:</h4>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 italic border border-gray-200">
                      {printOrder.notes}
                    </div>
                  </div>
                )}

                <div className="mt-20 pt-8 border-t border-gray-200 grid grid-cols-2 gap-10">
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-20">Approved By,</p>
                    <p className="font-bold text-gray-900 border-b border-gray-400 inline-block px-10 pb-1">Finance Director</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-20">Created By,</p>
                    <p className="font-bold text-gray-900 border-b border-gray-400 inline-block px-10 pb-1">Procurement Dept.</p>
                  </div>
                </div>
                
              </div>
            </div>
          </div>
        </div>
        
      )}
      

    </div>
  );
}