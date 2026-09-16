// backend-purchasing/routes/suppliers.js
const express = require('express');
const router = express.Router();
const db = require('../database'); // ✅ PERBAIKAN: Ambil dari database.js, bukan index.js

// =================================================================
// 1. GET ALL SUPPLIERS
// =================================================================
router.get('/', async (req, res) => {
    try {
        const sql = 'SELECT * FROM suppliers ORDER BY id DESC';
        
        // ✅ PERBAIKAN: Gunakan await dengan promise pool
        const [results] = await db.query(sql);
        
        res.json({ success: true, data: results });
    } catch (err) {
        console.error('❌ Error get suppliers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// =================================================================
// 2. POST (ADD NEW SUPPLIER) WITH DUPLICATE CHECK
// =================================================================
router.post('/', async (req, res) => {
    try {
        const { supplier_code, name, phone, city, tax_id, status } = req.body;

        // Validasi input minimal dari frontend
        if (!name || !supplier_code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Supplier Code dan Name wajib diisi!' 
            });
        }

        // STEP 1: Cek apakah Nama atau Supplier Code sudah ada di database
        const checkDuplicateSql = 'SELECT id, name FROM suppliers WHERE name = ? OR supplier_code = ?';

        // ✅ PERBAIKAN: Gunakan await
        const [results] = await db.query(checkDuplicateSql, [name, supplier_code]);

        // Jika ditemukan data ganda, batalkan proses insert
        if (results.length > 0) {
            console.log(`⚠️ Data ditolak (Duplikat): Supplier "${name}" / Code "${supplier_code}" sudah ada.`);
            return res.status(409).json({ 
                success: false, 
                error: `Data ganda: Supplier "${name}" atau Kode "${supplier_code}" sudah terdaftar di database!` 
            });
        }

        // STEP 2: Jika data belum ada, lakukan INSERT ke database
        const insertSql = `
            INSERT INTO suppliers (supplier_code, name, phone, city, tax_id, status) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const supplierStatus = status || 'active'; // default status ke 'active' jika kosong

        // ✅ PERBAIKAN: Gunakan await
        const [result] = await db.query(insertSql, [supplier_code, name, phone, city, tax_id, supplierStatus]);

        console.log(`✅ Berhasil menyimpan supplier baru ID: ${result.insertId}`);
        res.status(201).json({ 
            success: true, 
            message: 'Supplier berhasil disimpan ke database!', 
            id: result.insertId 
        });

    } catch (error) {
        console.error('❌ Server Internal Error:', error);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan internal pada server' });
    }
});

module.exports = router;