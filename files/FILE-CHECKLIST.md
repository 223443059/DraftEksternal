# 📋 CHECKLIST: File-File yang Harus Di-Copy

Gunakan checklist ini untuk pastikan semua file sudah di-copy dengan benar!

---

## 📂 STEP 1: Buat Struktur Folder

```
dashboard-purchasing/                    👈 Folder utama (buat di Desktop atau folder lain)
├── src/                                 👈 Buat folder ini
│   ├── components/                      👈 Buat folder ini
│   └── styles/                          👈 Buat folder ini
```

---

## 📄 STEP 2: Copy File-File Ini

Setiap file di bawah harus di-copy ke folder yang sesuai. Gunakan VS Code atau Notepad untuk paste isi file.

### **File Root Folder (dashboard-purchasing/)**

| Nama File | Sumber | Copy Ke | Status |
|-----------|--------|---------|--------|
| `package.json` | `01-package.json` | `dashboard-purchasing/` | ☐ |
| `vite.config.js` | `02-vite.config.js` | `dashboard-purchasing/` | ☐ |
| `index.html` | `03-index.html` | `dashboard-purchasing/` | ☐ |

### **File di Folder src/**

| Nama File | Sumber | Copy Ke | Status |
|-----------|--------|---------|--------|
| `main.jsx` | `04-main.jsx` | `dashboard-purchasing/src/` | ☐ |
| `App.jsx` | `05-App.jsx` | `dashboard-purchasing/src/` | ☐ |

### **File di Folder src/components/**

| Nama File | Sumber | Copy Ke | Status |
|-----------|--------|---------|--------|
| `Dashboard.jsx` | `06-Dashboard.jsx` | `dashboard-purchasing/src/components/` | ☐ |

### **File di Folder src/styles/**

| Nama File | Sumber | Copy Ke | Status |
|-----------|--------|---------|--------|
| `App.css` | `07-App.css` | `dashboard-purchasing/src/styles/` | ☐ |

---

## 🖥️ Cara Copy File

### **Metode 1: Menggunakan VS Code (Recommended)**

1. **Buka VS Code**
   - File → Open Folder → Pilih `dashboard-purchasing`

2. **Buat File Baru**
   - Klik kanan di folder → New File
   - Ketik nama file (misal: `package.json`)

3. **Copy Isi File**
   - Buka file sumber (misal: `01-package.json`)
   - Select semua (Ctrl+A)
   - Copy (Ctrl+C)
   - Paste ke file baru (Ctrl+V)
   - Save (Ctrl+S)

4. **Ulangi untuk setiap file**

### **Metode 2: Menggunakan Windows Explorer**

1. **Buka Folder** `dashboard-purchasing` di Windows Explorer
2. **Buat Folder Baru** `src` → `components` dan `styles`
3. **Buat File** dengan Notepad:
   - Klik kanan → New → Text Document
   - Rename ke `package.json` (hapus .txt)
   - Edit dengan Notepad
4. **Copy-Paste isi file** dari sumber

---

## ✅ Verifikasi Struktur Final

Setelah semua file di-copy, folder Anda harus terlihat seperti ini:

```
dashboard-purchasing/
├── package.json                    ✅
├── vite.config.js                  ✅
├── index.html                      ✅
└── src/
    ├── main.jsx                    ✅
    ├── App.jsx                     ✅
    ├── components/
    │   └── Dashboard.jsx           ✅
    └── styles/
        └── App.css                 ✅
```

**Pastikan struktur folder EXACT sama dengan di atas!**

---

## 🚀 Setelah Semua File Siap

1. **Buka PowerShell** di folder `dashboard-purchasing`
2. **Jalankan command:**
   ```powershell
   npm install
   npm run dev
   ```
3. **Browser akan membuka otomatis** dengan dashboard

---

## 🆘 Common Mistakes

❌ **SALAH**: Copy isi file sumber ke file yang salah
- Pastikan file names PERSIS sama dengan checklist

❌ **SALAH**: Lupa membuat folder `src`, `components`, `styles`
- Harus membuat folder dulu sebelum membuat file

❌ **SALAH**: Edit atau menghapus bagian dari kode
- Copy-paste PERSIS seperti di sumber tanpa modifikasi

❌ **SALAH**: File punya extension `.txt` (misal: `package.json.txt`)
- Rename dan hilangkan `.txt`

---

## 💡 Tips

✅ **Gunakan VS Code** - Lebih mudah dan error lebih terlihat
✅ **Perhatikan Indentation** - Jangan edit structure/indentation
✅ **Double-check Nama File** - Case-sensitive (main.jsx ≠ Main.jsx)
✅ **Verify Path** - File harus di folder yang benar

---

## 📞 Bantuan

Jika ada yang tidak jelas:
1. Buka `QUICK-START.md` untuk panduan step-by-step
2. Buka `PANDUAN-DASHBOARD-PURCHASING.md` untuk penjelasan detail
3. Cek error message di browser (F12 → Console)

---

**SETELAH SELESAI: Lanjut ke QUICK-START.md untuk step berikutnya!**
