import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';
import { API_ENDPOINTS } from '../utils/api.config';

// Initial form default state disesuaikan dengan format Excel
const INITIAL_FORM_STATE = {
  supplierId: '',
  company: '',
  name: '',
  address: '',
  address2: '',
  address3: '',
  city: '',
  stateProv: '',
  postalCode: '',
  country: '',
  alamatLengkap: '',
  currencyId: '',
  termsId: '',
  phone: '',
  taxId: ''
};

export default function Suppliers({ changePage, onLogout }) {
  // === MENGAMBIL DATA USER DARI CONTEXT ===
  const { user, hasPermission } = useRole();
  const canManageUsers = hasPermission('manage_users');
  
  // === LOGIKA PENGECEKAN VIEWER (USER) ===
  const isViewer = user?.role?.toLowerCase() === 'user' || user?.role?.toLowerCase() === 'viewer';

  // === 1. SUPPLIER DATA STATE (PERSISTENT VIA LOCALSTORAGE) ===
  const [suppliers, setSuppliers] = useState(() => {
    const savedSuppliers = localStorage.getItem('dataSuppliersLadeuV3');
    if (savedSuppliers) {
      try {
        return JSON.parse(savedSuppliers);
      } catch (e) {
        console.error("Failed to read supplier data:", e);
      }
    }
    return [];
  });
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);

  // === 2. INTERACTIVITY & CLOCK STATE ===
  const [hasNotif, setHasNotif] = useState(true);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null); 
  const [editId, setEditId] = useState(null); 
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 15;
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // === TOAST NOTIFICATION STATE ===
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [isSupplierMenuOpen, setIsSupplierMenuOpen] = useState(true);

  // Ambil status buka/tutup menu Supplier dari database saat komponen dimuat
  // useEffect(() => {
  //   if (!user?.id) return;
  //   fetch(`${API_ENDPOINTS.PREFERENCES}/${user.id}/sidebarSupplierOpen`)
  //     .then((res) => (res.ok ? res.json() : null))
  //     .then((data) => {
  //       if (data && data.value !== null && typeof data.value !== 'undefined') {
  //         setIsSupplierMenuOpen(!!data.value);
  //       }
  //     })
  //     .catch((err) => console.error('Gagal mengambil preferensi menu Supplier:', err));
  // }, [user?.id]);

  // Toggle menu Supplier sekaligus simpan ke database
  const toggleSupplierMenu = () => {
    setIsSupplierMenuOpen((prev) => {
      const next = !prev;
      if (user?.id) {
        fetch(`${API_ENDPOINTS.PREFERENCES}/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'sidebarSupplierOpen', value: next })
        }).catch((err) => console.error('Gagal menyimpan preferensi menu Supplier:', err));
      }
      return next;
    });
  };
  const [supplierTab, setSupplierTab] = useState('list');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };
  
  // === DARK MODE STATE (PERSISTENT VIA LOCALSTORAGE) ===
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== null ? savedTheme === 'dark' : false;
  });

  const profileRef = useRef(null);
  const fileInputRef = useRef(null); 

  // === 3. EFFECTS ===
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('dataSuppliersLadeuV3', JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileCard(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Durasi minimum garis loading tampil, supaya walau data sudah siap duluan
  // (fetch localhost biasanya sangat cepat), animasinya tetap sempat menyapu
  // penuh dari kiri ke kanan dulu sebelum disembunyikan — tidak cuma "kedip".
  const MIN_LOADING_MS = 900;

  const fetchSuppliersFromBackend = async () => {
    setIsLoadingSuppliers(true);
    const loadStartedAt = Date.now();
    try {
      const res = await fetch(API_ENDPOINTS.SUPPLIERS);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const formattedData = data.map((item, index) => ({
            id: item.id || Date.now() + index,
            supplierId: item.supplier_code || item.supplierId || '-',
            name: item.name || '',
            prefix: (item.name || 'UN').substring(0, 2).toUpperCase(),
            color: item.color || "bg-red-600 text-white",
            phone: item.phone || '-',
            city: item.city || '-',
            taxId: item.tax_id || item.taxId || '-',
            status: item.status || "Active",
            address: item.address || '-',
            address2: item.address2 || '-',
            address3: item.address3 || '-',
            stateProv: item.stateProv || item.state_prov || '-',
            postalCode: item.postalCode || item.postal_code || '-',
            country: item.country || '-',
            alamatLengkap: item.alamatLengkap || item.alamat_lengkap || '-',
            currencyId: item.currencyId || item.currency_id || '-',
            termsId: item.termsId || item.terms_id || '-',
            company: item.company || item.company_code || '-'
          }));
          setSuppliers(formattedData);
        }
      }
    } catch (err) {
      console.error("Gagal mengambil data supplier dari backend:", err);
    } finally {
      const elapsed = Date.now() - loadStartedAt;
      const remaining = MIN_LOADING_MS - elapsed;
      if (remaining > 0) {
        setTimeout(() => setIsLoadingSuppliers(false), remaining);
      } else {
        setIsLoadingSuppliers(false);
      }
    }
  };

  // Fetch data supplier dari backend saat pertama kali render
  useEffect(() => {
    fetchSuppliersFromBackend();
  }, []);

  // === 4. HANDLERS ===
  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    } else if (typeof changePage === 'function') {
      changePage('login');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData(INITIAL_FORM_STATE);
    setEditId(null);
  };

  const createSupplierInBackend = async (supplierData) => {
    try {
      // ✅ FIX: Menggunakan API_ENDPOINTS.SUPPLIERS tanpa semicolon syntax error
      const response = await fetch(API_ENDPOINTS.SUPPLIERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_code: (supplierData.supplierId && supplierData.supplierId !== '-')
            ? supplierData.supplierId
            : undefined,
          name: supplierData.name,
          company: supplierData.company !== '-' ? supplierData.company : '',
          phone: supplierData.phone !== '-' ? supplierData.phone : '',
          city: supplierData.city !== '-' ? supplierData.city : '',
          address: supplierData.address !== '-' ? supplierData.address : '',
          address2: supplierData.address2 !== '-' ? supplierData.address2 : '',
          address3: supplierData.address3 !== '-' ? supplierData.address3 : '',
          state_prov: supplierData.stateProv !== '-' ? supplierData.stateProv : '',
          postal_code: supplierData.postalCode !== '-' ? supplierData.postalCode : '',
          country: supplierData.country !== '-' ? supplierData.country : '',
          alamat_lengkap: supplierData.alamatLengkap !== '-' ? supplierData.alamatLengkap : '',
          currency_id: supplierData.currencyId !== '-' ? supplierData.currencyId : '',
          terms_id: supplierData.termsId !== '-' ? supplierData.termsId : '',
          tax_id: supplierData.taxId !== '-' ? supplierData.taxId : '',
          status: 'Active'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend error (create):', errorData);
        return { success: false, message: errorData.message || 'Gagal menyimpan ke database' };
      }

      const result = await response.json();
      return { success: true, id: result.id };
    } catch (error) {
      console.error('❌ Error saat POST ke backend:', error);
      return { success: false, message: error.message };
    }
  };

  const updateSupplierInBackend = async (id, supplierData) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.SUPPLIERS}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_code: supplierData.supplierId,
          name: supplierData.name,
          company: supplierData.company,
          phone: supplierData.phone,
          city: supplierData.city,
          address: supplierData.address,
          address2: supplierData.address2,
          address3: supplierData.address3,
          state_prov: supplierData.stateProv,
          postal_code: supplierData.postalCode,
          country: supplierData.country,
          alamat_lengkap: supplierData.alamatLengkap,
          currency_id: supplierData.currencyId,
          terms_id: supplierData.termsId,
          tax_id: supplierData.taxId,
          status: 'Active'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend error (update):', errorData);
        showToast(`Error: ${errorData.message || 'Gagal update ke database'}`, 'error');
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ Error saat PUT ke backend:', error);
      showToast(`Error: ${error.message}`, 'error');
      return false;
    }
  };

  const deleteSupplierInBackend = async (id) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.SUPPLIERS}/${id}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (error) {
      console.error('❌ Error saat DELETE ke backend:', error);
      return false;
    }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.supplierId.trim()) {
      showToast("Supplier ID and Name are required!", 'error');
      return;
    }

    const isDuplicate = suppliers.some(s => 
      s.id !== editId && (
        (s.supplierId && s.supplierId !== '-' && s.supplierId.toLowerCase() === formData.supplierId.trim().toLowerCase()) ||
        (s.name && s.name.toLowerCase() === formData.name.trim().toLowerCase())
      )
    );

    if (isDuplicate) {
      showToast("Data sudah ada! Supplier ID atau Nama tidak boleh duplikat.", 'error');
      return; 
    }

    const calculatedPrefix = formData.name.trim().substring(0, 2).toUpperCase();

    if (editId) {
      const ok = await updateSupplierInBackend(editId, formData);
      if (ok) {
        setSuppliers(prev => prev.map((supplier) => 
          supplier.id === editId 
            ? { ...supplier, ...formData, prefix: calculatedPrefix }
            : supplier
        ));
        showToast('Supplier berhasil diupdate!', 'success');
      }
    }
    resetForm();
  };

  const editSupplier = (id) => {
    const targetSupplier = suppliers.find((s) => s.id === id);
    if (targetSupplier) {
      setFormData({
        supplierId: targetSupplier.supplierId || '',
        company: targetSupplier.company || '',
        name: targetSupplier.name || '',
        address: targetSupplier.address || '',
        address2: targetSupplier.address2 || '',
        address3: targetSupplier.address3 || '',
        city: targetSupplier.city || '',
        stateProv: targetSupplier.stateProv || '',
        postalCode: targetSupplier.postalCode || '',
        country: targetSupplier.country || '',
        alamatLengkap: targetSupplier.alamatLengkap || '',
        currencyId: targetSupplier.currencyId || '',
        termsId: targetSupplier.termsId || '',
        phone: targetSupplier.phone || '',
        taxId: targetSupplier.taxId || ''
      });
      setEditId(id); 
    }
  };

  const deleteSupplier = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete data for ${name}?`)) {
      const ok = await deleteSupplierInBackend(id);
      if (ok) {
        setSuppliers(prev => prev.filter((supplier) => supplier.id !== id));
        if (selectedSupplier?.id === id) closeDrawer();
        if (editId === id) resetForm();
        showToast('Supplier berhasil dihapus!', 'success');
      } else {
        showToast('Gagal menghapus supplier dari database.', 'error');
      }
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          showToast("File Excel kosong atau format tidak sesuai!", 'error');
          return;
        }

        const getVal = (row, keys) => {
          for (const key of keys) {
            const foundKey = Object.keys(row).find(
              (k) => k.trim().toLowerCase() === key.toLowerCase()
            );
            if (
              foundKey &&
              row[foundKey] !== undefined &&
              row[foundKey] !== null &&
              String(row[foundKey]).trim() !== ''
            ) {
              return String(row[foundKey]).trim();
            }
          }
          return '-';
        };

        const newSuppliers = [];
        let duplicateCount = 0;

        jsonData.forEach((row, index) => {
          const name = getVal(row, ['Name', 'Nama Perusahaan', 'Nama Supplier', 'Supplier Name']);
          const supplierId = getVal(row, ['Supplier ID', 'Kode Supplier', 'Supplier Code', 'ID']);
          
          if (name === '-') return;

          const nameLower = name.toLowerCase();
          const idLower = supplierId.toLowerCase();

          const isDuplicate = suppliers.some(s => 
            (s.supplierId !== '-' && s.supplierId?.toLowerCase() === idLower) ||
            (s.name?.toLowerCase() === nameLower)
          ) || newSuppliers.some(s => 
            (s.supplierId !== '-' && s.supplierId?.toLowerCase() === idLower) ||
            (s.name?.toLowerCase() === nameLower)
          );

          if (isDuplicate) {
            duplicateCount++;
          } else {
            newSuppliers.push({
              id: Date.now() + index, 
              prefix: name.substring(0, 2).toUpperCase(),
              color: "bg-red-600 text-white",
              supplierId: supplierId,
              company: getVal(row, ['Company', 'Perusahaan']),
              name: name,
              address: getVal(row, ['Address', 'Alamat']),
              address2: getVal(row, ['Address2', 'Address 2', 'Alamat 2']),
              address3: getVal(row, ['Address 3', 'Address3', 'Alamat 3']),
              city: getVal(row, ['City', 'Kota']),
              stateProv: getVal(row, ['State/Prov', 'State', 'Province', 'Provinsi']),
              postalCode: getVal(row, ['Postal Code', 'PostalCode', 'Kode Pos']),
              country: getVal(row, ['Country', 'Negara']),
              alamatLengkap: getVal(row, ['Alamat Lengkap', 'Full Address', 'Alamat']),
              currencyId: getVal(row, ['Currency ID', 'Currency', 'Mata Uang']),
              termsId: getVal(row, ['Terms ID', 'Terms', 'Syarat Pembayaran']),
              phone: getVal(row, ['Phone', 'No Phone', 'No HP', 'Telepon', 'No Telp', 'Phone Number']),
              taxId: getVal(row, ['Tax ID', 'Tax Registration Number', 'NPWP', 'No Tax']),
              status: "New",
              statusColor: "bg-red-100 text-red-700",
              spend: "$0.00",
              monthlyTransaction: "$0.00"
            });
          }
        });

        if (newSuppliers.length === 0 && duplicateCount > 0) {
          showToast(`Gagal! Semua data (${duplicateCount}) sudah ada (duplikat).`, 'error');
          e.target.value = null;
          return;
        }

        if (newSuppliers.length > 0) {
          showToast(`Mengimport ${newSuppliers.length} supplier ke database...`, 'success');

          let successCount = 0;
          let failCount = 0;

          for (const supplier of newSuppliers) {
            const result = await createSupplierInBackend(supplier);
            if (result.success) {
              successCount++;
            } else {
              failCount++;
            }
          }

          await fetchSuppliersFromBackend();

          if (failCount === 0) {
            showToast(
              duplicateCount > 0
                ? `${successCount} supplier berhasil diimport, ${duplicateCount} dilewati (duplikat).`
                : `${successCount} supplier berhasil diimport ke database!`,
              'success'
            );
          } else {
            showToast(`${successCount} berhasil, ${failCount} gagal diimport. Cek console untuk detail.`, 'error');
          }
        }
        
      } catch (error) {
        console.error("Error parsing Excel:", error);
        showToast("Gagal membaca file Excel. Pastikan formatnya .xlsx atau .xls", 'error');
      }
      
      e.target.value = null;
    };

    reader.readAsBinaryString(file);
  };
  
  const handleViewSupplier = (supplier) => setSelectedSupplier(supplier);
  const closeDrawer = () => setSelectedSupplier(null);

  const formattedTime = currentTime.toLocaleTimeString('en-GB', { hour12: false });

  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = searchQuery.toLowerCase();
    return (
      supplier.name?.toLowerCase().includes(query) ||
      supplier.supplierId?.toLowerCase().includes(query) ||
      supplier.phone?.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / ROWS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, suppliers.length]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes dashboardTopLoadingBar {
          0% { left: -40%; width: 40%; opacity: 1; }
          90% { left: 100%; width: 40%; opacity: 1; }
          100% { left: 100%; width: 40%; opacity: 0; }
        }
      `}</style>
      
      <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>

        {/* TOP LOADING BAR */}
        {isLoadingSuppliers && (
          <div className="fixed top-0 left-0 w-full h-[3px] z-[100] bg-transparent overflow-hidden">
            <div
              className="absolute top-0 h-full bg-gradient-to-r from-red-500 via-red-600 to-red-500 shadow-[0_0_8px_rgba(220,38,38,0.6)]"
              style={{ animation: 'dashboardTopLoadingBar 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
            />
          </div>
        )}

        <header className={`flex flex-col border-b shrink-0 relative z-30 w-full transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`flex items-center justify-between px-6 h-20 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <div className="flex items-center gap-10 h-full">
              <div className="flex flex-col justify-center select-none cursor-pointer pt-1" onClick={() => changePage?.('dashboard')}>
                <img 
                  src="/images/logo.png" 
                  alt="Detpak Logo" 
                  className="h-12 w-auto object-contain" 
                />
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

        <div className="flex flex-1 overflow-hidden">
          {/* === SIDEBAR === */}
          <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 transition-colors duration-200 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
            <nav className="flex flex-col gap-2 px-4">
              
              <button onClick={() => changePage?.('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
              </button>
              
              <div>
                <button
                  onClick={toggleSupplierMenu}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold rounded-xl transition-colors text-left cursor-pointer ${
                    isSupplierMenuOpen
                      ? 'bg-[#004797] text-white shadow-xs'
                      : isDarkMode
                      ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-users w-5 text-lg"></i> Supplier
                  </div>
                  <i className={`fa-solid fa-chevron-${isSupplierMenuOpen ? 'down' : 'right'} text-xs transition-transform duration-200`}></i>
                </button>

                {isSupplierMenuOpen && (
                  <div className={`ml-4 pl-3 border-l-2 mt-1 flex flex-col gap-1 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                    <button
                      onClick={() => setSupplierTab('list')}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left cursor-pointer transition-colors ${
                        supplierTab === 'list'
                          ? isDarkMode ? 'text-slate-200 bg-slate-800/50' : 'text-gray-800 bg-gray-100'
                          : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      <i className="fa-solid fa-list w-4 text-center"></i> Supplier List
                    </button>
                    <button
                      onClick={() => setSupplierTab('excel')}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left cursor-pointer transition-colors ${
                        supplierTab === 'excel'
                          ? isDarkMode ? 'text-slate-200 bg-slate-800/50' : 'text-gray-800 bg-gray-100'
                          : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      <i className="fa-solid fa-file-excel w-4 text-center"></i> Excel Upload
                    </button>
                  </div>
                )}
              </div>
              
              <button onClick={() => changePage?.('purchaseOrders')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
              </button>
              <button onClick={() => changePage?.('analytics')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
              </button>
              <button onClick={() => changePage?.('report')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
              </button>
              <button onClick={() => changePage?.('settings')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
              </button>

              {canManageUsers && (
                <button onClick={() => changePage?.('userManagement')} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${isDarkMode ? 'text-amber-400 hover:bg-slate-800/80 hover:text-amber-300' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'}`}>
                  <i className="fa-solid fa-user-shield w-5 text-lg"></i> User Management
                </button>
              )}
            </nav>
          </aside>

          <main className="flex-1 overflow-y-auto p-8 relative">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>
                  {supplierTab === 'excel' ? 'Excel Upload' : 'Suppliers Management'}
                </h1>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  {supplierTab === 'excel' ? 'Import data supplier dari file Excel.' : 'Manage detailed supplier information.'}
                </p>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
            </div>

            {supplierTab === 'list' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  <div className={`p-4 rounded-xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className={`text-sm mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total Suppliers</div>
                    <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{suppliers.length}</div>
                  </div>
                  <div className={`p-4 rounded-xl border shadow-xs relative overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className={`text-sm mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Active Suppliers</div>
                    <div className={`text-2xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                      {suppliers.filter(s => s.status === 'Active' || s.status === 'New' || s.status === 'Aktif' || s.status === 'Baru' || s.status === 'active').length} 
                      <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
                    </div>
                  </div>
                </div> 

                <div className="flex flex-col lg:flex-row gap-6">
                  <div className={`flex-1 border shadow-xs rounded-xl p-5 overflow-hidden transition-all duration-300 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className="flex justify-between items-center mb-5">
                      <h2 className={`text-lg font-semibold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        <i className={`fa-regular fa-file-lines ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}></i> All Suppliers List
                      </h2>
                      <div className="relative">
                        <i className={`fa-solid fa-search absolute left-3 top-2.5 text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}></i>
                        <input 
                          type="text" 
                          placeholder="Search Suppliers..." 
                          value={searchQuery} 
                          onChange={(e) => setSearchQuery(e.target.value)} 
                          className={`pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:border-red-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' : 'border-gray-300 text-gray-900 bg-white'}`} 
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                          <tr className={`border-b ${isDarkMode ? 'border-slate-800 bg-[#0F172A] text-slate-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                            <th className="py-3 font-medium px-3">Company</th>
                            <th className="py-3 font-medium px-3">Supplier ID</th>
                            <th className="py-3 font-medium px-3">Phone</th>
                            <th className="py-3 font-medium px-3">Name</th>
                            <th className="py-3 font-medium px-3">Address</th>
                            <th className="py-3 font-medium px-3">City</th>
                            <th className="py-3 font-medium px-3">Postal Code</th>
                            <th className="py-3 font-medium px-3">State / Province</th>
                            <th className="py-3 font-medium px-3">Tax Registration Number</th>
                            <th className="py-3 font-medium px-3">Country</th>
                            <th className="py-3 font-medium px-3">Currency</th>
                            <th className="py-3 font-medium text-center px-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                          {filteredSuppliers.length === 0 ? (
                            <tr>
                              <td colSpan="12" className={`py-8 text-center ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                {searchQuery ? `No suppliers match "${searchQuery}".` : 'No supplier data available. Please upload an Excel file.'}
                              </td>
                            </tr>
                          ) : (
                            paginatedSuppliers.map((item) => (
                              <tr key={item.id} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                                <td className="py-3 px-3 font-medium">{item.company || '-'}</td>
                                <td className="py-3 px-3 font-medium text-blue-400">{item.supplierId || '-'}</td>
                                <td className="py-3 px-3">{item.phone || '-'}</td>
                                <td className={`py-3 px-3 flex items-center gap-3 min-w-[200px] cursor-pointer ${isDarkMode ? 'hover:text-red-400' : 'hover:text-red-600'}`} onClick={() => handleViewSupplier(item)}>
                                  <div className={`w-8 h-8 rounded-full ${item.color || 'bg-red-600 text-white'} flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden`}>
                                    {item.prefix}
                                  </div>
                                  <span className="font-medium truncate">{item.name}</span>
                                </td>
                                <td className="py-3 px-3">{item.address || '-'}</td>
                                <td className="py-3 px-3">{item.city || '-'}</td>
                                <td className="py-3 px-3">{item.postalCode || '-'}</td>
                                <td className="py-3 px-3">{item.stateProv || '-'}</td>
                                <td className="py-3 px-3">{item.taxId || '-'}</td>
                                <td className="py-3 px-3">{item.country || '-'}</td>
                                <td className="py-3 px-3">{item.currencyId || '-'}</td>
                                <td className="py-3 px-3 text-center">
                                  <button className={`text-base mr-3 transition-colors cursor-pointer ${isDarkMode ? 'text-slate-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'}`} title="History">
                                    <i className="fa-solid fa-clock-rotate-left"></i>
                                  </button>
                                  
                                  {!isViewer ? (
                                    <>
                                      <button onClick={() => editSupplier(item.id)} className={`text-base mr-3 transition-colors cursor-pointer ${isDarkMode ? 'text-slate-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'}`} title="Edit">
                                        <i className="fa-regular fa-pen-to-square"></i>
                                      </button>
                                      <button onClick={() => deleteSupplier(item.id, item.name)} className="text-red-500 hover:text-red-700 text-base transition-colors cursor-pointer" title="Delete">
                                        <i className="fa-regular fa-trash-can"></i>
                                      </button>
                                    </>
                                  ) : (
                                    <button onClick={() => handleViewSupplier(item)} className={`text-base transition-colors cursor-pointer ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500 hover:text-blue-700'}`} title="Info">
                                      <i className="fa-solid fa-circle-info"></i>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {filteredSuppliers.length > 0 && (
                      <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 pt-4 mt-2 border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}-{Math.min(currentPage * ROWS_PER_PAGE, filteredSuppliers.length)} of {filteredSuppliers.length} suppliers
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${currentPage === 1 ? (isDarkMode ? 'text-slate-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed') : (isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100')}`}
                          >
                            <i className="fa-solid fa-chevron-left mr-1"></i> Prev
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                            .map((page, idx, arr) => (
                              <React.Fragment key={page}>
                                {idx > 0 && arr[idx - 1] !== page - 1 && (
                                  <span className={`px-1 text-xs ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>...</span>
                                )}
                                <button
                                  onClick={() => setCurrentPage(page)}
                                  className={`w-8 h-8 text-xs font-semibold rounded-lg transition-colors ${page === currentPage ? 'bg-red-600 text-white' : (isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100')}`}
                                >
                                  {page}
                                </button>
                              </React.Fragment>
                            ))}
                          <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${currentPage === totalPages ? (isDarkMode ? 'text-slate-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed') : (isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100')}`}
                          >
                            Next <i className="fa-solid fa-chevron-right ml-1"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {editId !== null && (
                    <div className={`w-full lg:w-80 border shadow-xs rounded-xl p-5 h-fit max-h-[80vh] overflow-y-auto relative shrink-0 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                      <button onClick={resetForm} className={`absolute top-4 right-4 transition-colors cursor-pointer ${isDarkMode ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                      <h2 className={`text-lg font-semibold mb-4 pr-6 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Edit Supplier</h2>
                      <form onSubmit={handleSubmitEdit} className="space-y-3">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Supplier ID *</label>
                          <input type="text" name="supplierId" value={formData.supplierId} onChange={handleInputChange} required className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Company</label>
                          <input type="text" name="company" value={formData.company} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Name *</label>
                          <input type="text" name="name" value={formData.name} onChange={handleInputChange} required className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Address</label>
                          <input type="text" name="address" value={formData.address} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Address 2</label>
                             <input type="text" name="address2" value={formData.address2} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Address 3</label>
                             <input type="text" name="address3" value={formData.address3} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>City</label>
                             <input type="text" name="city" value={formData.city} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>State/Prov</label>
                             <input type="text" name="stateProv" value={formData.stateProv} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Postal Code</label>
                             <input type="text" name="postalCode" value={formData.postalCode} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Country</label>
                             <input type="text" name="country" value={formData.country} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Alamat Lengkap</label>
                          <textarea name="alamatLengkap" value={formData.alamatLengkap} onChange={handleInputChange} rows="2" className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none resize-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`}></textarea>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Currency ID</label>
                             <input type="text" name="currencyId" value={formData.currencyId} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                           </div>
                          <div className="flex-1">
                             <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Terms ID</label>
                             <input type="text" name="termsId" value={formData.termsId} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                          </div>
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Phone</label>
                          <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Tax ID</label>
                          <input type="text" name="taxId" value={formData.taxId} onChange={handleInputChange} className={`w-full border rounded p-2 text-sm focus:border-red-500 focus:outline-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'border-gray-300 text-gray-900 bg-white'}`} />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded transition-colors text-sm mt-4 cursor-pointer">
                          Save Changes
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </>
            )}

            {supplierTab === 'excel' && (
              <div className={`flex-1 border shadow-xs rounded-xl p-10 flex flex-col items-center justify-center text-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  <i className="fa-solid fa-file-excel"></i>
                </div>
                <div>
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Upload Supplier Data via Excel</h2>
                  <p className={`text-sm mt-1 max-w-md ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Upload file .xlsx atau .xls untuk import atau memperbarui data supplier. Supplier dengan Supplier ID yang sama akan dilewati (dianggap duplikat).
                  </p>
                </div>
                {!isViewer && (
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    <i className="fa-solid fa-upload"></i> Choose Excel File
                  </button>
                )}
                <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Saat ini ada {suppliers.length} supplier di database.</p>
                <button
                  onClick={() => setSupplierTab('list')}
                  className={`text-xs font-semibold mt-2 cursor-pointer ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  <i className="fa-solid fa-arrow-left mr-1"></i> Kembali ke Supplier List
                </button>
              </div>
            )}
          </main>
        </div>

        {selectedSupplier && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={closeDrawer}></div>
            <div className={`relative w-full max-w-sm h-full shadow-2xl flex flex-col z-50 ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
              <div className={`flex items-center justify-between p-6 border-b ${isDarkMode ? 'border-slate-800 bg-[#0F172A]' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${selectedSupplier.color || 'bg-red-600 text-white'} flex items-center justify-center font-bold text-sm shrink-0 shadow-xs`}>
                    {selectedSupplier.prefix || 'N/A'}
                  </div>
                  <div>
                    <h3 className={`text-base font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedSupplier.name}</h3>
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${selectedSupplier.status === 'Active' || selectedSupplier.status === 'New' || selectedSupplier.status === 'Aktif' || selectedSupplier.status === 'Baru' || selectedSupplier.status === 'active' ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                      {selectedSupplier.status || 'Active'}
                    </p>
                  </div>
                </div>
                <button onClick={closeDrawer} className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors shadow-xs focus:outline-none cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-slate-700 text-slate-400 hover:text-red-400 hover:bg-slate-800' : 'bg-white border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50'}`}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Supplier Information</h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 text-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-gray-100 text-gray-500'}`}><i className="fa-solid fa-building"></i></div>
                      <div>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Company</p>
                        <p className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{selectedSupplier.company || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-gray-100 text-gray-500'}`}><i className="fa-solid fa-id-card"></i></div>
                      <div>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Supplier ID / Tax ID</p>
                        <p className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{selectedSupplier.supplierId} / {selectedSupplier.taxId}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-gray-100 text-gray-500'}`}><i className="fa-solid fa-phone"></i></div>
                      <div>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Phone</p>
                        <p className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{selectedSupplier.phone || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-gray-100 text-gray-500'}`}><i className="fa-solid fa-map-location-dot"></i></div>
                      <div>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Alamat Lengkap</p>
                        <p className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{selectedSupplier.alamatLengkap || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-gray-100 text-gray-500'}`}><i className="fa-solid fa-money-bill-transfer"></i></div>
                      <div>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Terms & Currency</p>
                        <p className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{selectedSupplier.termsId} / {selectedSupplier.currencyId}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {!isViewer && (
                <div className={`p-4 border-t flex gap-2 ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                  <button onClick={() => { editSupplier(selectedSupplier.id); closeDrawer(); }} className={`flex-1 border py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}`}>
                    Edit
                  </button>
                  <button onClick={() => deleteSupplier(selectedSupplier.id, selectedSupplier.name)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TOAST NOTIFICATION UI */}
        {toast.show && (
          <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all duration-300 animate-[slideIn_0.3s_ease-out] ${
            toast.type === 'success' 
              ? isDarkMode ? 'bg-emerald-900/90 border-emerald-700/50 text-emerald-50 backdrop-blur-md' : 'bg-white border-emerald-200 text-emerald-800'
              : isDarkMode ? 'bg-red-900/90 border-red-700/50 text-red-50 backdrop-blur-md' : 'bg-white border-red-200 text-red-800'
          }`}>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
            }`}>
              <i className={`fa-solid ${toast.type === 'success' ? 'fa-check' : 'fa-exclamation'} text-sm`}></i>
            </div>
            <span className="font-semibold text-sm pr-4">{toast.message}</span>
            <button 
              onClick={() => setToast({ show: false, message: '', type: 'success' })} 
              className="ml-auto text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}
      </div>
    </>
  );
}