const express = require('express');
const router = express.Router();
// Impor middleware otentikasi kamu
const { verifyToken } = require('../middleware/authMiddleware'); 
const db = require('../config/db'); // Impor koneksi database kamu (MySQL/PostgreSQL/MongoDB)

// DELETE /api/system/clear-data
router.delete('/clear-data', verifyToken, async (req, res) => {
  try {
    // Hapus data operasional saja (sesuaikan dengan tabel di database kamu)
    await db.query('TRUNCATE TABLE purchase_orders');
    await db.query('TRUNCATE TABLE suppliers');
    await db.query('TRUNCATE TABLE reports');
    await db.query('TRUNCATE TABLE otd_performance');
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