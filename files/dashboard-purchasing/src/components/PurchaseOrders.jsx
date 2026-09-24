import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRole } from '../context/RoleContext';
import { API_ENDPOINTS } from '../utils/api.config';
import AppLayout from './AppLayout'; // Pastikan path ini sesuai dengan struktur folder Anda

const usdFormatter = new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD', 
  minimumFractionDigits: 2 
});

// Exchange Rate IDR per 1 USD based on transaction year
const KURS_PER_TAHUN = {
  2023: 15331,
  2024: 15926,
  2025: 16557,
  2026: 17505
};

const getKurs = (year) => {
  const years = Object.keys(KURS_PER_TAHUN).map(Number);
  const y = parseInt(year, 10);
  if (Number.isNaN(y)) return KURS_PER_TAHUN[Math.max(...years)];
  const nearest = Math.min(Math.max(y, Math.min(...years)), Math.max(...years));
  return KURS_PER_TAHUN[nearest];
};

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0
});

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const qtyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const MONTH_OPTIONS = [
  { value: 'All', label: 'All Months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

// ---------------------------------------------------------------------------
// INDEXEDDB HELPER (CAPABLE OF STORING DATA > 5 MB EASILY)
// ---------------------------------------------------------------------------
const IDB_NAME = 'DetpakPO_DB';
const IDB_STORE = 'po_cache';

const initIDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(IDB_NAME, 1);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(IDB_STORE)) {
      db.createObjectStore(IDB_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const setPOCache = async (rows) => {
  try {
    const db = await initIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(rows, 'dataPO_Ladeu');
  } catch (err) {
    console.warn('Failed to save cache to IndexedDB:', err);
  }
};

const getPOCache = async () => {
  try {
    const db = await initIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('dataPO_Ladeu');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
};

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isNaN(v) ? 0 : v;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const cleanCode = (v) => {
  const s = String(v ?? '').trim();
  return s === '0' ? '' : s;
};

const toIntOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

const computeSpending = (amount, currency, year) => {
  const value = toNumber(amount);
  const kurs = getKurs(year);
  const isUSD = String(currency || '').toUpperCase() === 'USD';
  return isUSD
    ? { idr: round2(value * kurs), usd: round2(value) }
    : { idr: round2(value), usd: round2(value / kurs) };
};

const pad2 = (n) => String(n).padStart(2, '0');

const parseExcelDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const d = new Date(Math.floor(value - 25569) * 86400 * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const text = String(value).trim();
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
};

const pickField = (obj, ...keys) => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

const normalizeRow = (r = {}) => {
  const rawDate = pickField(r, 'receipt_date', 'receiptDate');
  return {
    id: r.id,
    mainClass: pickField(r, 'main_class', 'mainClass') ?? '',
    classCode: pickField(r, 'class_code', 'classCode') ?? '',
    productGroup: pickField(r, 'product_group', 'productGroup') ?? '',
    subCategory: pickField(r, 'sub_category', 'subCategory') ?? '',
    type: pickField(r, 'type') ?? '',
    packSlip: pickField(r, 'pack_slip', 'packSlip') ?? '',
    receiptDate: rawDate ? String(rawDate).split('T')[0] : '',
    poNumber: pickField(r, 'po_number', 'poNumber') ?? '',
    poLine: pickField(r, 'po_line', 'poLine') ?? '',
    poRel: pickField(r, 'po_rel', 'poRel') ?? '',
    part: pickField(r, 'part') ?? '',
    description: pickField(r, 'description') ?? '',
    qtyReceived: toNumber(pickField(r, 'qty_received', 'qtyReceived')),
    uom: pickField(r, 'uom') ?? '',
    price: toNumber(pickField(r, 'price')),
    amount: toNumber(pickField(r, 'amount')),
    year: pickField(r, 'year') ?? '',
    spendingIdr: toNumber(pickField(r, 'spending_idr', 'spendingIdr')),
    spendingUsd: toNumber(pickField(r, 'spending_usd', 'spendingUsd')),
    currency: String(pickField(r, 'currency') ?? '').toUpperCase(),
    supplier: pickField(r, 'supplier') ?? '',
    localImport: pickField(r, 'local_import', 'localImport') ?? ''
  };
};

const rowKey = (r) => `${r.poNumber}|${r.poLine}|${r.packSlip}`.toLowerCase();

const textOrNull = (v, max) => {
  if (v === '' || v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  return max ? s.slice(0, max) : s;
};

const buildPayload = (row) => ({
  main_class: textOrNull(row.mainClass, 20),
  class_code: textOrNull(row.classCode, 20),
  product_group: textOrNull(row.productGroup, 100),
  sub_category: textOrNull(row.subCategory, 100),
  type: textOrNull(row.type, 20),
  pack_slip: textOrNull(row.packSlip, 50),
  receipt_date: textOrNull(row.receiptDate),
  po_number: String(row.poNumber).trim().slice(0, 50),
  po_line: toIntOrNull(row.poLine),
  po_rel: textOrNull(row.poRel, 20),
  part: textOrNull(row.part, 100),
  description: textOrNull(row.description, 255),
  qty_received: toNumber(row.qtyReceived),
  uom: textOrNull(row.uom, 20),
  price: toNumber(row.price),
  amount: toNumber(row.amount),
  year: toIntOrNull(row.year),
  spending_idr: toNumber(row.spendingIdr),
  spending_usd: toNumber(row.spendingUsd),
  currency: textOrNull(row.currency, 10),
  supplier: textOrNull(row.supplier, 150),
  local_import: textOrNull(row.localImport, 20)
});

const getEmptyForm = () => ({
  mainClass: '',
  classCode: '',
  productGroup: '',
  subCategory: '',
  type: '',
  packSlip: '',
  receiptDate: new Date().toISOString().split('T')[0],
  poNumber: '',
  poLine: '',
  poRel: '',
  part: '',
  description: '',
  qtyReceived: 1,
  uom: 'EA',
  price: 0,
  amount: 0,
  year: String(new Date().getFullYear()),
  spendingIdr: 0,
  spendingUsd: 0,
  currency: 'IDR',
  supplier: '',
  localImport: 'Local'
});

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
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [dbSuppliers, setDbSuppliers] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State Filter Year & Month
  const [selectedYear, setSelectedYear] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);
  
  // State Upload Progress & Loading
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [isPoMenuExpanded, setIsPoMenuExpanded] = useState(true);
  const [showUploadView, setShowUploadView] = useState(false);

  const supplierDropdownRef = useRef(null);
  const [formData, setFormData] = useState(getEmptyForm);

  // === 2. EFFECTS & LISTENERS ===
  useEffect(() => {
    fetchOrdersFromBackend();
    fetchSuppliersFromBackend();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
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

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedYear, selectedMonth]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    if (type !== 'info') {
      setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
    }
  };

  // === 3. BACKEND API CALLS ===
  const fetchOrdersFromBackend = async () => {
    setIsLoadingOrders(true);
    try {
      const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS);
      if (response.ok) {
        const data = await response.json();
        const rows = data.map((row) => normalizeRow(row));
        setLocalOrders(rows);
        await setPOCache(rows);
      } else {
        loadFromIndexedDBCache();
      }
    } catch (error) {
      console.error('Failed to fetch PO data from database:', error);
      loadFromIndexedDBCache();
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadFromIndexedDBCache = async () => {
    const cached = await getPOCache();
    if (Array.isArray(cached) && cached.length > 0) {
      setLocalOrders(cached);
    }
  };

  const fetchSuppliersFromBackend = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.SUPPLIERS);
      if (response.ok) {
        const data = await response.json();
        setDbSuppliers(data);
      }
    } catch (error) {
      console.error('Failed to fetch Supplier data from database:', error);
    }
  };

  // === 4. DATA COMPUTATIONS & FILTERING ===
  const orders = useMemo(() => {
    if (localOrders && localOrders.length > 0) {
      return localOrders;
    }
    return Array.isArray(propOrders) && propOrders.length > 0
      ? propOrders.map((row) => normalizeRow(row))
      : [];
  }, [propOrders, localOrders]);

  const setOrders = propSetOrders || setLocalOrders;

  const daftarSupplierObjects = useMemo(() => {
    if (dbSuppliers.length > 0) return dbSuppliers;
    if (Array.isArray(propSuppliers) && propSuppliers.length > 0) return propSuppliers;
    return [];
  }, [dbSuppliers, propSuppliers]);

  // Extract unique available years dynamically from data
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    orders.forEach((r) => {
      const y = String(r.year || (r.receiptDate ? r.receiptDate.slice(0, 4) : '')).trim();
      if (y && y !== '0') yearsSet.add(y);
    });
    const list = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return list.length > 0 ? list : ['2026', '2025', '2024', '2023'];
  }, [orders]);

  // Combined Filtering: Year, Month, & Search Term
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return orders.filter((row) => {
      // 1. Filter Year
      const rowYear = String(row.year || (row.receiptDate ? row.receiptDate.slice(0, 4) : '')).trim();
      if (selectedYear !== 'All' && rowYear !== selectedYear) {
        return false;
      }

      // 2. Filter Month (Format: "MM")
      const rowMonth = row.receiptDate ? row.receiptDate.slice(5, 7) : '';
      if (selectedMonth !== 'All' && rowMonth !== selectedMonth) {
        return false;
      }

      // 3. Filter Search Term
      if (term) {
        const match = [
          row.poNumber,
          row.supplier,
          row.part,
          row.description,
          row.packSlip,
          row.productGroup,
          row.subCategory
        ].some((v) => String(v || '').toLowerCase().includes(term));
        if (!match) return false;
      }

      return true;
    });
  }, [orders, searchTerm, selectedYear, selectedMonth]);

  // Summary stats based on active filtered data
  const stats = useMemo(() => {
    const poNumbers = new Set();
    let totalUSD = 0;
    let totalIDR = 0;

    filteredRows.forEach((row) => {
      if (row.poNumber) poNumbers.add(row.poNumber);
      totalUSD += row.spendingUsd;
      totalIDR += row.spendingIdr;
    });

    return { totalPO: poNumbers.size, totalLines: filteredRows.length, totalUSD, totalIDR };
  }, [filteredRows]);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;

  const currentPaginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRows, currentPage, itemsPerPage]);

  // === 5. EXCEL UPLOAD HANDLING ===
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

    setIsUploading(true);
    setUploadProgress(0);
    showToast(`Reading Excel file (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`, 'info');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          showToast('Excel file is empty or format is unreadable!', 'error');
          setIsUploading(false);
          e.target.value = null;
          return;
        }

        const existingKeys = new Set(orders.map((o) => rowKey(o)));
        const validRows = [];
        let duplicateCount = 0;
        let skippedCount = 0;

        rawData.forEach((row) => {
          const rawPo = getCol(row, 'PO', 'PO Number', 'poNumber');
          if (rawPo === undefined) {
            skippedCount++;
            return;
          }

          const currency = String(getCol(row, 'Currency') ?? 'IDR').trim().toUpperCase();
          const qty = toNumber(getCol(row, 'Qty Received', 'Qty'));
          const price = toNumber(getCol(row, 'Price'));
          const rawAmount = getCol(row, 'Amount');
          const amount = rawAmount !== undefined ? toNumber(rawAmount) : round2(qty * price);

          const receiptDate = parseExcelDate(getCol(row, 'Date'));
          const rawYear = getCol(row, 'Year');
          const rowYear = rawYear !== undefined ? rawYear : (receiptDate ? receiptDate.slice(0, 4) : '');

          const fallback = computeSpending(amount, currency, rowYear);
          const rawIdr = getCol(row, 'Spending IDR');
          const rawUsd = getCol(row, 'Spending USD');

          const item = {
            mainClass: cleanCode(getCol(row, 'Main Class')),
            classCode: cleanCode(getCol(row, 'Class')),
            productGroup: cleanCode(getCol(row, 'Product Group')),
            subCategory: cleanCode(getCol(row, 'Sub category', 'Sub Category')),
            type: cleanCode(getCol(row, 'Type')),
            packSlip: String(getCol(row, 'Pack Slip', 'Pack Slip No', 'PackSlip') ?? ''),
            receiptDate: receiptDate || '',
            poNumber: String(rawPo).trim(),
            poLine: getCol(row, 'PO Line') ?? '',
            poRel: String(getCol(row, 'PO Rel', 'PO Release', 'PO Rev') ?? ''),
            part: String(getCol(row, 'Part') ?? ''),
            description: String(getCol(row, 'Description') ?? ''),
            qtyReceived: qty,
            uom: String(getCol(row, 'UOM') ?? ''),
            price,
            amount,
            year: rowYear,
            spendingIdr: rawIdr !== undefined ? toNumber(rawIdr) : fallback.idr,
            spendingUsd: rawUsd !== undefined ? toNumber(rawUsd) : fallback.usd,
            currency,
            supplier: String(getCol(row, 'Supplier', 'supplier') ?? '').trim(),
            localImport: String(getCol(row, 'Local/Import', 'Local /Import', 'Local / Import') ?? '')
          };

          if (existingKeys.has(rowKey(item))) {
            duplicateCount++;
          } else {
            validRows.push(item);
          }
        });

        if (validRows.length === 0) {
          showToast(
            duplicateCount > 0
              ? `All rows (${duplicateCount}) already exist in system (Duplicate).`
              : 'No rows with PO number available to import!',
            'error'
          );
          setIsUploading(false);
          e.target.value = null;
          return;
        }

        await ensureSuppliers(validRows.map((r) => r.supplier));

        const BATCH_SIZE = 25;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
          const batch = validRows.slice(i, i + BATCH_SIZE);
          const currentProcessed = Math.min(i + BATCH_SIZE, validRows.length);
          const pct = Math.round((currentProcessed / validRows.length) * 100);
          setUploadProgress(pct);

          showToast(`Uploading data to server... ${pct}% (${currentProcessed}/${validRows.length} rows)`, 'info');

          await Promise.all(
            batch.map(async (row) => {
              try {
                const response = await fetch(API_ENDPOINTS.PURCHASE_ORDERS, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(buildPayload(row))
                });
                if (response.ok) successCount++;
                else failCount++;
              } catch (rowErr) {
                failCount++;
              }
            })
          );
        }

        await fetchSuppliersFromBackend();
        await fetchOrdersFromBackend();

        setIsUploading(false);
        const notes = [];
        if (duplicateCount > 0) notes.push(`${duplicateCount} duplicates skipped`);
        if (skippedCount > 0) notes.push(`${skippedCount} without PO skipped`);
        const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';

        if (failCount === 0) {
          showToast(`Done! ${successCount} PO rows successfully imported${suffix}.`, 'success');
        } else {
          showToast(`${successCount} succeeded, ${failCount} failed to import.`, 'error');
        }
      } catch (err) {
        console.error('Error processing Excel:', err);
        showToast('System error occurred while reading Excel file!', 'error');
        setIsUploading(false);
      }

      e.target.value = null;
    };

    reader.readAsArrayBuffer(file);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleFormChange = (name, value) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: name === 'currency' ? String(value).toUpperCase() : value };

      if (name === 'receiptDate' && value) next.year = String(value).slice(0, 4);

      if (name === 'qtyReceived' || name === 'price') {
        next.amount = round2(toNumber(next.qtyReceived) * toNumber(next.price));
      }

      if (['qtyReceived', 'price', 'amount', 'currency', 'receiptDate', 'year'].includes(name)) {
        const { idr, usd } = computeSpending(next.amount, next.currency, next.year);
        next.spendingIdr = idr;
        next.spendingUsd = usd;
      }

      return next;
    });
  };

  const ensureSuppliers = async (names) => {
    const known = new Set(
      daftarSupplierObjects.map((s) =>
        String(typeof s === 'string' ? s : (s.name || s.nama || '')).trim().toLowerCase()
      )
    );

    const missing = new Map();
    names.forEach((n) => {
      const name = String(n || '').trim();
      if (name && !known.has(name.toLowerCase()) && !missing.has(name.toLowerCase())) {
        missing.set(name.toLowerCase(), name);
      }
    });

    for (const name of missing.values()) {
      try {
        await fetch(API_ENDPOINTS.SUPPLIERS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, status: 'Active' })
        });
      } catch (err) {
        console.error(`Failed to create supplier ${name}:`, err);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const poNumber = String(formData.poNumber || '').trim();
    if (!poNumber) {
      showToast('PO Number is required', 'error');
      return;
    }

    const candidateKey = rowKey({ poNumber, poLine: formData.poLine, packSlip: formData.packSlip });
    const isDuplicate = orders.some((o) => o.id !== editingId && rowKey(o) === candidateKey);
    if (isDuplicate) {
      showToast(
        `Duplicate data: PO ${poNumber}${formData.poLine ? ` line ${formData.poLine}` : ''}${formData.packSlip ? ` / pack slip ${formData.packSlip}` : ''} already exists.`,
        'error'
      );
      return;
    }

    const payload = buildPayload({
      ...formData,
      poNumber,
      year: formData.year || (formData.receiptDate ? String(formData.receiptDate).slice(0, 4) : '')
    });

    try {
      const url = editingId
        ? `${API_ENDPOINTS.PURCHASE_ORDERS}/${editingId}`
        : API_ENDPOINTS.PURCHASE_ORDERS;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));
      if (result.success || response.ok) {
        await ensureSuppliers([formData.supplier]);
        showToast(editingId ? 'PO Successfully Updated!' : 'PO Successfully Saved!', 'success');
        fetchOrdersFromBackend();
        fetchSuppliersFromBackend();
        closeModal();
      } else {
        showToast(result.message || 'Failed to save PO', 'error');
      }
    } catch (error) {
      console.error('Failed to submit PO:', error);
      showToast('Failed to save PO', 'error');
    }
  };

  const deletePO = async (id, poNumber) => {
    if (window.confirm(`Delete document ${poNumber || 'PO'} from database?`)) {
      try {
        const response = await fetch(`${API_ENDPOINTS.PURCHASE_ORDERS}/${id}`, { method: 'DELETE' });
        if (response.ok) {
          showToast(`PO ${poNumber} successfully deleted.`, 'success');
          fetchOrdersFromBackend();
        } else {
          const updated = orders.filter(o => o.id !== id);
          setOrders(updated);
          setPOCache(updated);
          showToast(`PO ${poNumber} deleted locally.`, 'success');
        }
      } catch (error) {
        console.error('Error while deleting PO:', error);
        const updated = orders.filter(o => o.id !== id);
        setOrders(updated);
        setPOCache(updated);
        showToast(`PO ${poNumber} deleted locally.`, 'success');
      }
    }
  };

  const handleEditClick = (row) => {
    const { id, ...fields } = row;
    setEditingId(id ?? null);
    setFormData({ ...getEmptyForm(), ...fields });
    setIsModalOpen(true);
  };

  const handleTriggerPrint = (order) => setPrintOrder(order);

  const inputCls = `w-full px-2.5 py-1.5 border rounded ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-gray-200'}`;

  const formFields = [
    { name: 'poNumber', label: 'PO *', type: 'text', required: true },
    { name: 'poLine', label: 'PO Line', type: 'number' },
    { name: 'poRel', label: 'PO Rel', type: 'text' },
    { name: 'mainClass', label: 'Main Class', type: 'text' },
    { name: 'classCode', label: 'Class', type: 'text' },
    { name: 'productGroup', label: 'Product Group', type: 'text' },
    { name: 'subCategory', label: 'Sub Category', type: 'text' },
    { name: 'type', label: 'Type', type: 'text' },
    { name: 'packSlip', label: 'Pack Slip', type: 'text' },
    { name: 'receiptDate', label: 'Date', type: 'date' },
    { name: 'part', label: 'Part', type: 'text' },
    { name: 'description', label: 'Description', type: 'text', wide: true },
    { name: 'qtyReceived', label: 'Qty Received', type: 'number' },
    { name: 'uom', label: 'UOM', type: 'text' },
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'amount', label: 'Amount', type: 'number' },
    { name: 'year', label: 'Year', type: 'number' },
    { name: 'currency', label: 'Currency', type: 'text' },
    { name: 'spendingIdr', label: 'Spending IDR', type: 'number' },
    { name: 'spendingUsd', label: 'Spending USD', type: 'number' },
    { name: 'supplier', label: 'Supplier *', type: 'text', required: true, wide: true },
    { name: 'localImport', label: 'Local/Import', type: 'select', options: ['Local', 'Import'] }
  ];

  // Daftar item submenu yang sesuai dengan izin (permission) pengguna
  const submenuItems = [
    { id: 'list', label: 'PO Transaction List', icon: 'fa-list-ul' }
  ];
  
  if (canManageUsers) {
    submenuItems.push({ id: 'upload', label: 'Excel Upload', icon: 'fa-file-excel' });
  }

  return (
    <AppLayout
      activePage="purchaseOrders"
      changePage={changePage}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      submenu={{
        page: 'purchaseOrders',
        open: isPoMenuExpanded,
        onToggle: () => setIsPoMenuExpanded(!isPoMenuExpanded),
        items: submenuItems,
        activeId: showUploadView ? 'upload' : 'list',
        onSelect: (id) => setShowUploadView(id === 'upload')
      }}
    >
      {/* TOP LOADING BAR */}
      {isLoadingOrders && (
        <div className="fixed top-0 left-0 w-full h-[3px] z-[100] bg-transparent overflow-hidden pointer-events-none">
          <style>{`
            @keyframes dashboardTopLoadingBar {
              0% { left: -40%; width: 40%; opacity: 1; }
              90% { left: 100%; width: 40%; opacity: 1; }
              100% { left: 100%; width: 40%; opacity: 0; }
            }
          `}</style>
          <div
            className="absolute top-0 h-full bg-gradient-to-r from-red-500 via-red-600 to-red-500 shadow-[0_0_8px_rgba(220,38,38,0.6)]"
            style={{ animation: 'dashboardTopLoadingBar 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
          />
        </div>
      )}
      
      {/* TOAST NOTIFICATION */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[9999] px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 transition-all transform duration-300 border ${
          toast.type === 'error' 
            ? 'bg-[#FFF2F2] border-[#FFD9D9] text-[#B31919]' 
            : toast.type === 'info'
            ? 'bg-blue-600 border-blue-700 text-white'
            : 'bg-emerald-500 border-emerald-500 text-white'
        }`}>
          <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
            toast.type === 'error' ? 'bg-[#FFD9D9] text-[#B31919]' : 'bg-white/20 text-white'
          }`}>
             <i className={`fa-solid ${toast.type === 'error' ? 'fa-exclamation text-xs' : toast.type === 'info' ? 'fa-spinner fa-spin text-xs' : 'fa-check text-xs'}`}></i>
          </div>
          <span className="font-semibold text-sm">{toast.message}</span>
        </div>
      )}

      {/* BODY CONTAINER WRAPPER */}
      <div className="space-y-6 w-full h-full flex flex-col">
        {showUploadView ? (
          <div className="w-full max-w-6xl mx-auto flex flex-col h-full flex-1">
            <div className="mb-6">
              <h1 className={`text-[28px] font-bold ${isDarkMode ? 'text-white' : 'text-[#004797]'}`}>Excel Upload</h1>
              <p className={`text-[15px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Import Purchase Order data from large Excel files.</p>
            </div>
            
            <div className={`flex-1 rounded-2xl border shadow-sm p-10 flex flex-col items-center justify-center text-center ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="w-16 h-16 rounded-full bg-[#E8F5E9] text-[#2E7D32] flex items-center justify-center mb-6">
                <i className="fa-solid fa-file-excel text-3xl"></i>
              </div>
              
              <h2 className={`text-xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Upload Purchase Order Data via Excel</h2>
              <p className={`text-sm max-w-lg mb-6 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                The system has been optimized to process large Excel files (&gt; 5 MB).
              </p>

              {isUploading && (
                <div className="w-full max-w-md mb-6">
                  <div className="flex justify-between text-xs font-bold mb-2">
                    <span>Upload Progress...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div className="bg-[#00A651] h-3 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                </div>
              )}
              
              <label className={`cursor-pointer ${isUploading ? 'bg-gray-400 pointer-events-none' : 'bg-[#00A651] hover:bg-[#008F45]'} text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 mb-6`}>
                <i className="fa-solid fa-upload"></i> {isUploading ? 'Processing File...' : 'Choose Excel File'}
                <input type="file" accept=".xlsx, .xls" disabled={isUploading} onChange={handleFileUpload} className="hidden" />
              </label>
              
              <button 
                onClick={() => setShowUploadView(false)}
                className={`text-sm font-semibold flex items-center gap-2 transition-colors ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-[#004797] hover:text-blue-700'}`}
              >
                <i className="fa-solid fa-arrow-left"></i> Back to PO Transaction List
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
                    <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Orders ({stats.totalLines} lines)</span>
                  </div>
                </div>
              </div>

              <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-dollar-sign text-xl"></i>
                </div>
                <div className="overflow-hidden">
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Spending (USD)</p>
                  <span className={`text-xl font-bold truncate block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{usdFormatter.format(stats.totalUSD)}</span>
                </div>
              </div>

              <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
                <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-money-bill-wave text-xl"></i>
                </div>
                <div className="overflow-hidden">
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>Total Spending (IDR)</p>
                  <span className={`text-xl font-bold truncate block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{idrFormatter.format(stats.totalIDR)}</span>
                </div>
              </div>
            </div>

            {/* TABLE AREA WITH YEAR & MONTH FILTERS */}
            <div className={`border shadow-xs rounded-2xl p-6 overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>PO Transaction List</h2>
                </div>

                {/* FILTERS CONTAINER: YEAR, MONTH, SEARCH, & RESET */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto flex-wrap">
                  {/* FILTER YEAR */}
                  <div className="w-full sm:w-auto">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className={`w-full sm:w-auto px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer font-medium ${
                        isDarkMode 
                          ? 'bg-[#0F172A] border-slate-700 text-white' 
                          : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    >
                      <option value="All">All Years</option>
                      {availableYears.map((yr) => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>

                  {/* FILTER MONTH */}
                  <div className="w-full sm:w-auto">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className={`w-full sm:w-auto px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer font-medium ${
                        isDarkMode 
                          ? 'bg-[#0F172A] border-slate-700 text-white' 
                          : 'bg-gray-50 border-gray-200 text-gray-900'
                      }`}
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* SEARCH INPUT */}
                  <div className="relative w-full sm:w-64">
                    <input 
                      type="text" 
                      placeholder="Search PO, Supplier, Part..." 
                      value={searchTerm} 
                      onChange={e => setSearchTerm(e.target.value)}
                      className={`w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 ${
                        isDarkMode 
                          ? 'bg-[#0F172A] border-slate-700 text-white placeholder-slate-500' 
                          : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                      }`} 
                    />
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-xs text-gray-400"></i>
                  </div>

                  {/* RESET FILTER BUTTON */}
                  {(selectedYear !== 'All' || selectedMonth !== 'All' || searchTerm !== '') && (
                    <button
                      onClick={() => {
                        setSelectedYear('All');
                        setSelectedMonth('All');
                        setSearchTerm('');
                      }}
                      className={`w-full sm:w-auto px-3 py-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        isDarkMode 
                          ? 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700' 
                          : 'border-gray-200 bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                      }`}
                      title="Reset Filters"
                    >
                      <i className="fa-solid fa-rotate-left"></i> Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full overflow-x-auto pb-4">
                <table className="w-full min-w-max text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? 'border-slate-800 bg-[#0F172A] text-slate-400' : 'border-gray-200 bg-gray-50/50 text-gray-500'}`}>
                      <th className="py-3 font-semibold px-4">Main Class</th>
                      <th className="py-3 font-semibold px-4">Class</th>
                      <th className="py-3 font-semibold px-4">Product Group</th>
                      <th className="py-3 font-semibold px-4">Sub Category</th>
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
                      <th className="py-3 font-semibold px-4 text-center">Year</th>
                      <th className="py-3 font-semibold px-4 text-right">Spending IDR</th>
                      <th className="py-3 font-semibold px-4 text-right">Spending USD</th>
                      <th className="py-3 font-semibold px-4 text-center">Currency</th>
                      <th className="py-3 font-semibold px-4">Supplier</th>
                      <th className="py-3 font-semibold px-4 text-center">Local/Import</th>
                      <th className={`py-3 font-semibold px-4 text-center sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] ${isDarkMode ? 'bg-[#0F172A]' : 'bg-gray-100'}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/80 text-slate-300' : 'divide-gray-100 text-gray-700'}`}>
                    {currentPaginatedRows.length === 0 ? (
                      <tr><td colSpan="23" className="py-8 text-center text-gray-400">No PO data available.</td></tr>
                    ) : (
                      currentPaginatedRows.map((row) => (
                        <tr key={row.id ?? `${row.poNumber}-${row.poLine}-${row.packSlip}`} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                          <td className="py-3 px-4">{row.mainClass || '-'}</td>
                          <td className="py-3 px-4">{row.classCode || '-'}</td>
                          <td className="py-3 px-4">{row.productGroup || '-'}</td>
                          <td className="py-3 px-4">{row.subCategory || '-'}</td>
                          <td className="py-3 px-4">{row.type || '-'}</td>
                          <td className="py-3 px-4">{row.packSlip || '-'}</td>
                          <td className="py-3 px-4">{row.receiptDate || '-'}</td>
                          <td className="py-3 px-4 font-bold text-red-500 cursor-pointer hover:underline">{row.poNumber}</td>
                          <td className="py-3 px-4 text-center">{row.poLine || '-'}</td>
                          <td className="py-3 px-4">{row.poRel || '-'}</td>
                          <td className="py-3 px-4">{row.part || '-'}</td>
                          <td className="py-3 px-4 max-w-[200px] truncate" title={row.description}>{row.description || '-'}</td>
                          <td className="py-3 px-4 text-center">{qtyFormatter.format(row.qtyReceived)}</td>
                          <td className="py-3 px-4 text-center">{row.uom || '-'}</td>
                          <td className="py-3 px-4 text-right">{moneyFormatter.format(row.price)}</td>
                          <td className="py-3 px-4 text-right font-semibold">{moneyFormatter.format(row.amount)}</td>
                          <td className="py-3 px-4 text-center">{row.year || '-'}</td>
                          <td className="py-3 px-4 text-right">{idrFormatter.format(row.spendingIdr)}</td>
                          <td className="py-3 px-4 text-right">{usdFormatter.format(row.spendingUsd)}</td>
                          <td className="py-3 px-4 text-center">{row.currency || '-'}</td>
                          <td className="py-3 px-4 font-bold">{row.supplier || '-'}</td>
                          <td className="py-3 px-4 text-center">{row.localImport || '-'}</td>

                          <td className={`py-3 px-4 text-center sticky right-0 z-10 ${isDarkMode ? 'bg-[#1E293B] hover:bg-slate-800' : 'bg-white hover:bg-gray-50'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleTriggerPrint(row)} className="text-gray-400 hover:text-blue-500 p-1 cursor-pointer" title="Print PO">
                                <i className="fa-solid fa-print"></i>
                              </button>
                              {canManageUsers && (
                                <>
                                  <button onClick={() => handleEditClick(row)} className="text-gray-400 hover:text-blue-500 p-1 cursor-pointer" title="Edit"><i className="fa-regular fa-pen-to-square"></i></button>
                                  <button onClick={() => deletePO(row.id, row.poNumber)} className="text-gray-400 hover:text-red-500 p-1 cursor-pointer" title="Delete"><i className="fa-regular fa-trash-can"></i></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* BOTTOM PAGINATION CONTROLS */}
              <div className={`mt-4 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-sm ${isDarkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-600'}`}>
                <div>
                  Showing <span className="font-bold text-[#004797]">{filteredRows.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> - <span className="font-bold text-[#004797]">{Math.min(currentPage * itemsPerPage, filteredRows.length)}</span> of total <span className="font-bold">{filteredRows.length}</span> rows
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
                    Page {currentPage} of {totalPages}
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
      </div>

      {/* MODAL UNTUK ADD / EDIT PO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-[#1E293B] text-slate-100' : 'bg-white text-gray-800'}`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <h2 className="text-xl font-bold">{editingId ? 'Edit Purchase Order' : 'Add Purchase Order'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-red-500 transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="po-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formFields.map(f => (
                  <div key={f.name} className={f.wide ? 'md:col-span-2' : ''}>
                    <label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      {f.label}
                    </label>
                    {f.type === 'select' ? (
                      <select 
                        required={f.required} 
                        value={formData[f.name]} 
                        onChange={e => handleFormChange(f.name, e.target.value)} 
                        className={inputCls}
                      >
                        {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input 
                        type={f.type} 
                        required={f.required} 
                        value={formData[f.name]} 
                        onChange={e => handleFormChange(f.name, e.target.value)} 
                        className={inputCls} 
                      />
                    )}
                  </div>
                ))}
              </form>
            </div>
            
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDarkMode ? 'border-slate-700' : 'border-gray-100 bg-gray-50'}`}>
              <button onClick={closeModal} type="button" className={`px-4 py-2 rounded-lg font-medium transition-colors ${isDarkMode ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                Cancel
              </button>
              <button type="submit" form="po-form" className="px-5 py-2 rounded-lg font-medium bg-[#004797] text-white hover:bg-blue-800 transition-colors">
                <i className="fa-solid fa-save mr-2"></i> Save Document
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}