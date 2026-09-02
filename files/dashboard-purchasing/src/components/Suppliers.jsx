import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

// Initial form default state disesuaikan dengan format Excel
const INITIAL_FORM_STATE = {
  supplierId: '',
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
  // === 1. SUPPLIER & PROFILE DATA STATE (PERSISTENT VIA LOCALSTORAGE) ===
  const [suppliers, setSuppliers] = useState(() => {
    const savedSuppliers = localStorage.getItem('dataSuppliersLadeuV3');
    if (savedSuppliers) {
      try {
        return JSON.parse(savedSuppliers);
      } catch (e) {
        console.error("Failed to read supplier data:", e);
      }
    }
    return []; // Fallback array kosong agar tidak undefined saat pertama kali dibuka
  });

  const [profile] = useState(() => {
    const savedProfile = localStorage.getItem('appProfile');
    return savedProfile ? JSON.parse(savedProfile) : {
      name: 'Ladeu Intern',
      email: 'intern@ladeu.com',
      role: 'Procurement Admin'
    };
  });

  // === 2. INTERACTIVITY & CLOCK STATE ===
  const [hasNotif, setHasNotif] = useState(true);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null); 
  const [editId, setEditId] = useState(null); 
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // === DARK MODE STATE ===
  const [isDarkMode, setIsDarkMode] = useState(true);

  const profileRef = useRef(null);
  const fileInputRef = useRef(null); 

  // === 3. EFFECTS ===
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Simpan data supplier secara otomatis setiap kali ada perubahan
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

  // ✅ TAMBAHAN: Fungsi untuk POST data ke backend
  const saveSupplierToBackend = async (supplierData) => {
    try {
      const response = await fetch('http://localhost:5000/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplier_code: supplierData.supplierId,
          name: supplierData.name,
          phone: supplierData.phone,
          city: supplierData.city,
          tax_id: supplierData.taxId,
          status: 'active'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error:', errorData);
        alert(`Error: ${errorData.error || 'Gagal menyimpan ke database'}`);
        return false;
      }

      const result = await response.json();
      console.log('✅ Supplier berhasil disimpan ke database:', result);
      alert('✅ Supplier berhasil disimpan!');
      return true;
    } catch (error) {
      console.error('❌ Error saat POST ke backend:', error);
      alert(`❌ Error: ${error.message}`);
      return false;
    }
  };

  const handleSubmitEdit = (e) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.supplierId.trim()) {
      alert("Supplier ID and Name are required!");
      return;
    }

    const calculatedPrefix = formData.name.trim().substring(0, 2).toUpperCase();

    if (editId) {
      setSuppliers(prev => prev.map((supplier) => 
        supplier.id === editId 
          ? { ...supplier, ...formData, prefix: calculatedPrefix }
          : supplier
      ));
      // ✅ TAMBAHAN: Kirim ke backend setelah disimpan ke localStorage
      saveSupplierToBackend(formData);
    }
    resetForm();
  };

  const editSupplier = (id) => {
    const targetSupplier = suppliers.find((s) => s.id === id);
    if (targetSupplier) {
      setFormData({
        supplierId: targetSupplier.supplierId || '',
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

  const deleteSupplier = (id, name) => {
    if (window.confirm(`Are you sure you want to delete data for ${name}?`)) {
      setSuppliers(prev => prev.filter((supplier) => supplier.id !== id));
      if (selectedSupplier?.id === id) closeDrawer();
      if (editId === id) resetForm();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          alert("Excel file is empty or formatted incorrectly!");
          return;
        }

        // Mapping Data Disesuaikan Dengan Header Excel
        const newSuppliers = jsonData.map((row, index) => {
          const name = row['Name'] || row['Nama Perusahaan'] || 'Unknown Supplier';
          
          return {
            id: Date.now() + index, 
            prefix: name.substring(0, 2).toUpperCase(),
            color: "bg-red-600 text-white",
            supplierId: row['Supplier ID'] || '-',
            name: name,
            address: row['Address'] || '-',
            address2: row['Address2'] || '-',
            address3: row['Address 3'] || '-',
            city: row['City'] || '-',
            stateProv: row['State/Prov'] || '-',
            postalCode: row['Postal Code'] || '-',
            country: row['Country'] || '-',
            alamatLengkap: row['Alamat Lengkap'] || '-',
            currencyId: row['Currency ID'] || '-',
            termsId: row['Terms ID'] || '-',
            phone: row['Phone'] || '-',
            taxId: row['Tax ID'] || '-',
            status: "New",
            statusColor: "bg-red-100 text-red-700",
            spend: "$0.00",
            monthlyTransaction: "$0.00"
          };
        });

        setSuppliers(prev => [...prev, ...newSuppliers]);
        
        // ✅ TAMBAHAN: POST setiap supplier ke backend
        newSuppliers.forEach(supplier => {
          saveSupplierToBackend(supplier);
        });
        
        alert(`${newSuppliers.length} supplier record(s) added successfully!`);
        
      } catch (error) {
        console.error("Error parsing Excel:", error);
        alert("Failed to read Excel file. Please ensure the format is correct (.xlsx or .xls).");
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

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-[#0F172A] text-slate-100' : 'bg-[#EDF2F7] text-gray-800'}`}>
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
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>{profile.email}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-[#004797]'}`}>{profile.role}</span>
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
        <aside className={`w-64 border-r flex flex-col py-6 shrink-0 z-20 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-[#1E293B] border-slate-700'}`}>
          <nav className="flex flex-col gap-2 px-4">
            <button onClick={() => changePage?.('dashboard')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-border-all w-5 text-lg"></i> Dashboard
            </button>
            <button onClick={() => changePage?.('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-[#E31837] rounded-xl transition-colors text-left cursor-pointer shadow-xs">
              <i className="fa-solid fa-users w-5 text-lg"></i> Suppliers
            </button>
            <button onClick={() => changePage?.('purchaseOrders')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-cart-shopping w-5 text-lg"></i> Purchase Orders
            </button>
            <button onClick={() => changePage?.('analytics')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-chart-line w-5 text-lg"></i> Analytics
            </button>
            <button onClick={() => changePage?.('report')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-file-lines w-5 text-lg"></i> Report
            </button>
            <button onClick={() => changePage?.('settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-300 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors text-left cursor-pointer">
              <i className="fa-solid fa-gear w-5 text-lg"></i> Settings
            </button>
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className={`text-[26px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Suppliers Management</h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Manage detailed supplier information.</p>
            </div>
            
            <div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current.click()} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <i className="fa-solid fa-file-excel"></i> 
                Upload Data via Excel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className={`p-4 rounded-xl border shadow-xs ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className={`text-sm mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total Suppliers</div>
              <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{suppliers.length}</div>
            </div>
            <div className={`p-4 rounded-xl border shadow-xs relative overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className={`text-sm mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Active Suppliers</div>
              <div className={`text-2xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                {suppliers.filter(s => s.status === 'Active' || s.status === 'New' || s.status === 'Aktif' || s.status === 'Baru').length} 
                <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
              </div>
            </div>
          </div> 

          <div className="flex flex-col lg:flex-row gap-6">
            {/* SUPPLIER TABLE */}
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
                      <th className="py-3 font-medium px-3">Supplier ID</th>
                      <th className="py-3 font-medium px-3">Name</th>
                      <th className="py-3 font-medium px-3">Phone</th>
                      <th className="py-3 font-medium px-3">City</th>
                      <th className="py-3 font-medium px-3">Tax ID</th>
                      <th className="py-3 font-medium text-center px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                    {filteredSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className={`py-8 text-center ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          {searchQuery ? `No suppliers match "${searchQuery}".` : 'No supplier data available. Please upload an Excel file.'}
                        </td>
                      </tr>
                    ) : (
                      filteredSuppliers.map((item) => (
                        <tr key={item.id} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                          <td className="py-3 px-3 font-medium text-blue-400">{item.supplierId || '-'}</td>
                          <td className={`py-3 px-3 flex items-center gap-3 min-w-[200px] cursor-pointer ${isDarkMode ? 'hover:text-red-400' : 'hover:text-red-600'}`} onClick={() => handleViewSupplier(item)}>
                            <div className={`w-8 h-8 rounded-full ${item.color || 'bg-red-600 text-white'} flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden`}>
                              {item.prefix}
                            </div>
                            <span className="font-medium truncate">{item.name}</span>
                          </td>
                          <td className="py-3 px-3">{item.phone || '-'}</td>
                          <td className="py-3 px-3">{item.city || '-'}</td>
                          <td className="py-3 px-3">{item.taxId || '-'}</td>
                          <td className="py-3 px-3 text-center">
                            <button onClick={() => editSupplier(item.id)} className={`text-base mr-3 transition-colors cursor-pointer ${isDarkMode ? 'text-slate-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'}`} title="Edit">
                              <i className="fa-regular fa-pen-to-square"></i>
                            </button>
                            <button onClick={() => deleteSupplier(item.id, item.name)} className="text-red-500 hover:text-red-700 text-base transition-colors cursor-pointer" title="Delete">
                              <i className="fa-regular fa-trash-can"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* EDIT FORM */}
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
        </main>
      </div>

      {/* QUICK VIEW DRAWER */}
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
                    <span className={`w-2 h-2 rounded-full ${selectedSupplier.status === 'Active' || selectedSupplier.status === 'New' || selectedSupplier.status === 'Aktif' || selectedSupplier.status === 'Baru' ? 'bg-red-500' : 'bg-gray-400'}`}></span>
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
            
            <div className={`p-4 border-t flex gap-2 ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
              <button onClick={() => { editSupplier(selectedSupplier.id); closeDrawer(); }} className={`flex-1 border py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}`}>
                Edit
              </button>
              <button onClick={() => deleteSupplier(selectedSupplier.id, selectedSupplier.name)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}