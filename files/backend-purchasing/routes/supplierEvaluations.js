const express = require('express');
const router = express.Router();
// Import koneksi database dari database.js yang ada di root backend
const db = require('../database'); 

// POST endpoint untuk menyimpan data evaluasi
// URL sesungguhnya saat dipanggil adalah: /api/supplier-evaluations
router.post('/', async (req, res) => {
    try {
        const { supplier_id, weighted_score, rating_tier, evaluation_date } = req.body;

        // Validasi data dasar
        if (!supplier_id || !weighted_score) {
            return res.status(400).json({ message: "supplier_id dan weighted_score wajib diisi" });
        }

        // Query INSERT disesuaikan dengan kolom di HeidiSQL Anda
        const query = `
            INSERT INTO supplier_evaluations 
            (supplier_id, weighted_score, rating_tier, evaluation_date) 
            VALUES (?, ?, ?, ?)
        `;
        
        // Asumsi menggunakan mysql2 (promise)
        const [result] = await db.query(query, [supplier_id, weighted_score, rating_tier, evaluation_date]);
        
        res.status(201).json({ 
            message: "Data evaluasi berhasil disimpan",
            insertId: result.insertId 
        });

    } catch (error) {
        console.error("Error Database:", error);
        res.status(500).json({ 
            message: "Terjadi kesalahan pada server saat menyimpan evaluasi", 
            error: error.message 
        });
    }
});

module.exports = router;