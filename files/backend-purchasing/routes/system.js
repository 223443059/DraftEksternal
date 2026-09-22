const express = require('express');
const router = express.Router();

// 1. DIPERBAIKI: Mengimpor koneksi database dari file yang benar
const db = require('../database'); 

// 2. DIPERBAIKI: Mengimpor middleware dari authUtils.js
const { authenticate } = require('../authUtils'); 

// Mapping modul (checkbox di frontend) -> tabel & kolom tanggal untuk filter periode.
// ⚠️ SESUAIKAN nama tabel & kolom tanggal di bawah ini dengan skema database kamu yang sebenarnya,
// terutama untuk 'suppliers' dan 'report' — saya asumsikan kolomnya 'created_at',
// silakan ganti kalau kolom tanggal aslinya berbeda (mis. 'tanggal_dibuat', 'date', dst).
const MODULE_CONFIG = {
  suppliers:      { table: 'suppliers',       dateColumn: 'created_at' },
  purchaseOrders: { table: 'purchase_orders', dateColumn: 'receipt_date' },
  // Analytics tidak punya tabel sendiri — datanya berasal dari purchase_orders,
  // jadi diarahkan ke tabel yang sama.
  analytics:      { table: 'purchase_orders', dateColumn: 'receipt_date' },
  report:         { table: 'reports',         dateColumn: 'created_at' },
};

// DELETE /api/system/clear-data
// Menggunakan 'authenticate' untuk memastikan hanya user login yang bisa menghapus data
router.delete('/clear-data', authenticate, async (req, res) => {
  try {
    const { modules, month, year } = req.body || {};

    if (!Array.isArray(modules) || modules.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal satu modul yang ingin dibersihkan.'
      });
    }

    // Hanya proses modul yang dikenali, dedupe tabel yang sama (mis. analytics & purchaseOrders)
    const seenTables = new Set();
    const targets = [];
    for (const key of modules) {
      const config = MODULE_CONFIG[key];
      if (!config) continue; // abaikan key yang tidak dikenal
      if (seenTables.has(config.table)) continue;
      seenTables.add(config.table);
      targets.push(config);
    }

    if (targets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Modul yang dipilih tidak dikenali.'
      });
    }

    const hasMonth = month !== undefined && month !== null && month !== '';
    const hasYear = year !== undefined && year !== null && year !== '';
    const monthNum = hasMonth ? Number(month) : null;
    const yearNum = hasYear ? Number(year) : null;

    if (hasMonth && (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12)) {
      return res.status(400).json({ success: false, message: 'Bulan tidak valid.' });
    }
    if (hasYear && (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100)) {
      return res.status(400).json({ success: false, message: 'Tahun tidak valid.' });
    }

    const useDateFilter = hasMonth && hasYear;

    for (const { table, dateColumn } of targets) {
      if (useDateFilter) {
        // TRUNCATE tidak bisa pakai WHERE, jadi pakai DELETE saat ada filter periode
        await db.promise().query(
          `DELETE FROM ${table} WHERE MONTH(${dateColumn}) = ? AND YEAR(${dateColumn}) = ?`,
          [monthNum, yearNum]
        );
      } else {
        // Tanpa filter periode -> kosongkan seluruh tabel seperti sebelumnya
        await db.promise().query(`TRUNCATE TABLE ${table}`);
      }
    }
    // CATATAN: Jangan hapus isi tabel `users`

    return res.status(200).json({
      success: true,
      message: useDateFilter
        ? `Data pada periode ${monthNum}/${yearNum} berhasil dibersihkan dari modul terpilih.`
        : 'Data operasional terpilih berhasil dibersihkan.'
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