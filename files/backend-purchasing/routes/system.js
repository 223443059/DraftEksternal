const express = require('express');
const router = express.Router();

// 1. DIPERBAIKI: Mengimpor koneksi database dari file yang benar
const db = require('../database'); 

// 2. DIPERBAIKI: Mengimpor middleware dari authUtils.js
const { authenticate } = require('../authUtils'); 

// DELETE /api/system/clear-data
// Menggunakan 'authenticate' untuk memastikan hanya user login yang bisa menghapus data
router.delete('/clear-data', authenticate, async (req, res) => {
  try {
    // Hapus data operasional saja (sesuaikan dengan tabel di database kamu)
    // Gunakan db.promise().query() jika db kamu masih menggunakan versi callback bawaan mysql2
    await db.promise().query('TRUNCATE TABLE purchase_orders');
    await db.promise().query('TRUNCATE TABLE suppliers');
    await db.promise().query('TRUNCATE TABLE reports');
    await db.promise().query('TRUNCATE TABLE otd_performance');
    // CATATAN: Jangan hapus isi tabel `users`

    return res.status(200).json({
      success: true,
      message: 'Seluruh data operasional berhasil dibersihkan.'
    });
  } catch (err) {
    console.error('Error clear data:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal membersihkan data dari server.'
    });
  }
});

module.exports = router;