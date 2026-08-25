# 🚀 QUICK START - Setup Dashboard Purchasing dari 0

## 📂 Struktur Folder Lengkap

```
dashboard-purchasing/
├── package.json                    (Konfigurasi project)
├── vite.config.js                  (Konfigurasi build)
├── index.html                      (HTML main)
├── src/
│   ├── main.jsx                    (Entry point React)
│   ├── App.jsx                     (Root component)
│   ├── components/
│   │   └── Dashboard.jsx           (Component dashboard)
│   └── styles/
│       └── App.css                 (Styling)
├── public/
│   └── vite.svg                    (Optional icon)
└── node_modules/                   (Auto-generated setelah npm install)
```

---

## ✅ Step-by-Step Setup

### **Step 1: Buat Folder Project**

Buka PowerShell (Windows) atau Terminal (Mac/Linux) dan jalankan:

```powershell
# Navigasi ke folder yang diinginkan (contoh: Desktop)
cd $HOME\Desktop

# Buat folder baru
mkdir dashboard-purchasing
cd dashboard-purchasing
```

### **Step 2: Buat File-File Project**

Copy setiap file berikut ke folder `dashboard-purchasing`:

#### 📄 **File 1: package.json**
Salin isi dari file `01-package.json` → simpan sebagai `package.json`

#### 📄 **File 2: vite.config.js**
Salin isi dari file `02-vite.config.js` → simpan sebagai `vite.config.js`

#### 📄 **File 3: index.html**
Salin isi dari file `03-index.html` → simpan sebagai `index.html`

#### 📁 **Buat Folder src**
```powershell
mkdir src
mkdir src\components
mkdir src\styles
```

#### 📄 **File 4: src/main.jsx**
Salin isi dari file `04-main.jsx` → simpan di `src\main.jsx`

#### 📄 **File 5: src/App.jsx**
Salin isi dari file `05-App.jsx` → simpan di `src\App.jsx`

#### 📄 **File 6: src/components/Dashboard.jsx**
Salin isi dari file `06-Dashboard.jsx` → simpan di `src\components\Dashboard.jsx`

#### 📄 **File 7: src/styles/App.css**
Salin isi dari file `07-App.css` → simpan di `src\styles\App.css`

---

### **Step 3: Verifikasi Struktur Folder**

Pastikan struktur folder sudah benar:

```powershell
# Lihat struktur folder
tree /F

# Atau di Mac/Linux:
find . -type f -name "*.json" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.html"
```

Harus ada file-file:
- ✅ package.json
- ✅ vite.config.js
- ✅ index.html
- ✅ src/main.jsx
- ✅ src/App.jsx
- ✅ src/components/Dashboard.jsx
- ✅ src/styles/App.css

### **Step 4: Install Dependencies**

Jalankan command ini di PowerShell/Terminal (dalam folder `dashboard-purchasing`):

```powershell
npm install
```

**Tunggu sampai selesai** (~1-2 menit). Output akan melihat seperti:

```
added 200+ packages in 1m 30s
```

### **Step 5: Jalankan Project**

```powershell
npm run dev
```

**Output yang benar:**

```
  VITE v5.0.0  ready in 300 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

### **Step 6: Buka di Browser**

Browser akan **otomatis membuka** `http://localhost:5173`

Jika tidak, buka secara manual:
- URL: `http://localhost:5173`
- Atau copy URL dari terminal ke browser

---

## ✨ Anda Selesai!

Selamat! Dashboard Purchasing sudah siap digunakan! 🎉

### Fitur yang Tersedia:

✅ **Tambah Pembelian** - Form input data pembelian
✅ **Export Excel** - Download data ke .xlsx
✅ **Import Excel** - Upload data dari .xlsx
✅ **Filter Status** - Lihat data berdasarkan status
✅ **Delete Data** - Hapus data yang tidak perlu
✅ **KPI Dashboard** - Ringkasan data pembelian
✅ **Breakdown Kategori** - Analisis per kategori

---

## 🧑‍💻 Mode Development

Selama menjalankan `npm run dev`:

- **Edit file** → Browser **otomatis refresh** (hot reload)
- **Lihat error** → Check di console browser (F12)
- **Stop server** → Tekan `Ctrl + C` di terminal

Setiap kali edit file, browser langsung update tanpa perlu refresh manual!

---

## 📦 Build untuk Production

Saat sudah siap deploy:

```powershell
npm run build
```

Hasil build ada di folder `dist/` - bisa diupload ke server/hosting.

---

## ❓ FAQ & Troubleshooting

### Q: "Command 'npm' is not recognized"
**A:** Node.js belum diinstall. Download dari https://nodejs.org/

### Q: Port 5173 sudah terpakai
**A:** Vite otomatis coba port lain (5174, 5175, dst)

### Q: File ada tapi error "module not found"
**A:** Pastikan path file benar, terutama folder `src/` dan `components/`

### Q: "React is not defined"
**A:** Pastikan `import React from 'react'` di awal file

### Q: Data menghilang setelah refresh
**A:** Normal - data disimpan di browser memory. Use Excel export untuk backup!

---

## 💾 Backup Data

**Jangan lupa export data secara berkala:**

1. Klik tombol **"📥 Export ke Excel"**
2. File `.xlsx` akan didownload
3. Simpan di Drive/Cloud untuk backup

---

## 📖 Dokumentasi Lengkap

Buka file `PANDUAN-DASHBOARD-PURCHASING.md` untuk:
- Penjelasan setiap fitur detail
- Format data Excel yang benar
- Tips & trik penggunaan
- Troubleshooting lebih detail

---

## 🔧 Customization

Mau customize dashboard? Edit file:

- **Styling** → `src/styles/App.css`
- **Fungsi** → `src/components/Dashboard.jsx`
- **Warna** → Cari `:root` di `App.css`
- **Kategori** → Edit di bagian `<select>` di `Dashboard.jsx`

---

**Butuh bantuan? Cek PANDUAN-DASHBOARD-PURCHASING.md atau hubungi tim dev!**

Happy coding! 🚀
