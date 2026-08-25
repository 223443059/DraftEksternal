# 📋 SETUP PROJECT DASHBOARD PURCHASING DARI 0

## Step 1: Buat Folder Project

Buka PowerShell/CMD dan jalankan:

```powershell
# Navigasi ke folder yang diinginkan
cd C:\Users\YourName\Desktop
# atau folder lain yang Anda suka

# Buat folder baru untuk project
mkdir dashboard-purchasing
cd dashboard-purchasing
```

## Step 2: Copy Semua File

Setelah membuat folder, copy semua file yang sudah saya sediakan ke dalam folder `dashboard-purchasing`:

```
dashboard-purchasing/
├── package.json          ← COPY INI
├── vite.config.js        ← COPY INI
├── index.html            ← COPY INI
├── src/
│   ├── main.jsx          ← COPY INI
│   ├── App.jsx           ← COPY INI
│   ├── components/
│   │   └── Dashboard.jsx ← COPY INI
│   └── styles/
│       └── App.css       ← COPY INI (optional)
└── node_modules/         ← Akan dibuat otomatis
```

## Step 3: Install Dependencies

Buka PowerShell di folder project dan jalankan:

```powershell
npm install
```

## Step 4: Jalankan Project

```powershell
npm run dev
```

Browser akan otomatis membuka http://localhost:5173

---

## ✅ Verifikasi Semuanya Berjalan

Jika Anda melihat:
- ✅ Browser membuka http://localhost:5173
- ✅ Dashboard Purchasing tampil di layar
- ✅ Tidak ada error di console (F12)

Berarti **BERHASIL** 🎉

---

## 🆘 Troubleshooting

**Masalah: "npm command not found"**
- Pastikan Node.js sudah terinstall: `node --version`
- Download dari https://nodejs.org/ jika belum

**Masalah: Port 5173 sudah terpakai**
Vite akan otomatis ganti port ke 5174, 5175, dst.

**Masalah: CORS atau Module Error**
Coba: `npm install` lagi atau `npm cache clean --force`

---

## 📱 Cara Buka di Device Lain (Network)

Setelah `npm run dev`, cari output:
```
Local:   http://localhost:5173
Network: http://192.168.x.x:5173  <- GUNAKAN INI
```

Buka URL Network di device lain di network yang sama.

---

**Siap melanjutkan? Cek file-file di bawah!**
