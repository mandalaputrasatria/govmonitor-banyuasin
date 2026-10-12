# 🏛️ GovMonitor Diskoperindag Pemkab Banyuasin

> **Sistem Informasi Pemantauan Output & Input Kerja Staf Pemerintah Kabupaten Banyuasin**  
> *Dinas Koperasi, Usaha Kecil dan Menengah, Perindustrian dan Perdagangan (Diskoperindag)*

![Logo Pemkab Banyuasin](Logo%20Banyuasin.png)

---

## 📌 Tentang Aplikasi

**GovMonitor** adalah aplikasi manajemen lembar kerja, monitoring kinerja staf, dan pelaporan terintegrasi yang dibangun khusus untuk lingkungan instansi pemerintah. Aplikasi ini mengintegrasikan spreadsheet interaktif, dikte suara aparatur (Speech-to-Text), pengenalan teks dokumen dinas (OCR Cloud Vision), siaran pengumuman berjenjang, absensi digital, dan pemantauan aktivitas real-time.

Aplikasi ini dapat dijalankan dalam dua mode:
1. **Google Apps Script Web App (Cloud Production)**: Terhubung langsung ke database Google Sheets, Google Drive, dan Google Cloud Vision API.
2. **Localhost & GitHub Pages (Standalone Development / Demo)**: Berjalan mandiri dengan RPC Bridge dan emulator database lokal tanpa ketergantungan server luar.

---

## ✨ Fitur Unggulan

### 1. 📊 Spreadsheet Interaktif (Luckysheet & SheetJS)
- **Editor Spreadsheet Berbasis Web**: Format tabel dinas, rumus, multi-tab sheet, dan auto-save.
- **Import File Excel (.xlsx)**: Unggah dokumen Excel lokal secara langsung melalui tombol toolbar maupun drag-and-drop file.
- **Ekspor Dokumen Resmi**: Unduh kembali lembar kerja dalam format `.xlsx` sewaktu-waktu.
- **Shortcut Produktivitas**: Mendukung `Ctrl + S` (Sinkronisasi cepat ke Cloud) dan `Ctrl + O` (Impor file Excel).

### 2. 🎙️ GovDikte (Dikte Suara Aparatur Pemerintah)
- Perekaman suara berbasis Web Speech API khusus terminologi birokrasi pemerintahan Indonesia.
- Auto-kapitalisasi, pembersihan tanda baca otomatis, dan input langsung ke sel spreadsheet yang sedang aktif.

### 3. 🔍 GovLens OCR (Digitalisasi Dokumen Fisik)
- Ekstraksi teks dari foto surat tugas, nota dinas, atau berkas arsip menggunakan Google Cloud Vision API.

### 4. 📢 Siaran Berjalan & Absensi Digital
- Running text pengumuman dinas dari Administrator yang wajib dikonfirmasi staf (*Acknowledge*).
- Pencatatan kehadiran otomatis per hari kerja.

### 5. ⛅ Widget Waktu, Cuaca & Kualitas Udara (US AQI)
- Jam digital WIB presisi tinggi.
- Jadwal sholat wilayah Banyuasin dan sekitarnya.
- Prakiraan cuaca dan indeks kualitas udara (US AQI & PM2.5) real-time berbasis koordinat resmi Kabupaten Banyuasin.

---

## 🗂️ Struktur Berkas Proyek (Modular Architecture)

Proyek ini dirancang secara modular sesuai standar resmi Google Apps Script dan Web Standards:

```text
├── Code.gs                   # Backend Google Apps Script (Auth, Sheets DB, Drive, OCR, API)
├── Index.html                # Kerangka antarmuka utama (HTML5 Semantik & Layout DOM)
├── Stylesheet.html           # Desain visual, tema neon gemini, typography & styling
├── Javascript_Core.html      # Safe jQuery fallback, Mock RPC bridge, & Error Boundary
├── Javascript_Auth.html      # Manajemen sesi, multi-role login (Admin / Staf)
├── Javascript_Sheets.html    # Luckysheet engine, LuckyExcel import, & GovDikte
├── Javascript_App.html       # Dasbor admin, log audit, live chat, & monitoring staf
├── Javascript_Widgets.html   # Widget jam, jadwal sholat, cuaca & kualitas udara Banyuasin
├── appsscript.json           # Manifest konfigurasi Google Apps Script
├── server.js                 # Server mandiri Node.js untuk Localhost (Zero-Dependency)
├── jalankan_localhost.bat    # Skrip 1-klik untuk menjalankan server localhost:3000
├── clasp_push.bat            # Skrip 1-klik sinkronisasi ke Google Apps Script
├── Logo Banyuasin.png        # Logo resmi Kabupaten Banyuasin
└── README.md                 # Dokumentasi proyek
```

---

## 🚀 Cara Menjalankan Aplikasi

### 💻 A. Menjalankan di Komputer Lokal (Localhost)
1. Pastikan **Node.js** telah terpasang di komputer Anda.
2. Klik dua kali pada file **`jalankan_localhost.bat`** (atau jalankan `node server.js` di terminal).
3. Buka browser dan akses:  
   👉 **`http://localhost:3000`**

### ☁️ B. Menjalankan di Google Apps Script (Cloud Deployment)
1. Pasang Google Clasp jika belum ada:  
   ```bash
   npm install -g @google/clasp
   ```
2. Hubungkan ke akun Google Apps Script:  
   ```bash
   clasp login
   ```
3. Unggah seluruh perubahan berkas:  
   ```bash
   clasp push -f
   ```
   *(atau cukup klik dua kali berkas `clasp_push.bat`)*

---

## 🔑 Akun Default untuk Pengujian

| Peran (Role) | Username | Password |
|---|---|---|
| **Administrator** | `admin_banyuasin` | `Admin@Banyuasin2026!` |
| **Staf Kerja** | `staf_uji1` | `Staf@Banyuasin2026!` |

---

## 🏛️ Hak Cipta & Lisensi
Dikembangkan untuk **Dinas Koperasi, Usaha Kecil dan Menengah, Perindustrian dan Perdagangan (Diskoperindag) Pemerintah Kabupaten Banyuasin, Provinsi Sumatera Selatan**.
