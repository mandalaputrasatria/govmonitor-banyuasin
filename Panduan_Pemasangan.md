# GovMonitor — pemasangan Google Apps Script baru

Paket 2026.10.07-new-2. Tampilan diambil dari GovMonitor versi 21, termasuk judul neon warna-warni, logo melayang dengan halo emas, subtitle kuning, banner berjalan, kartu staf neon, menu File → Riwayat Absen, ringkasan cuaca/AQI dan kop laporan Diskoperindag Banyuasin.

## Berkas yang dipasang

| Berkas | Tempat pemasangan |
|---|---|
| Code.gs | File script Code.gs pada editor Apps Script |
| Index.html | File HTML bernama **Index** pada editor Apps Script |
| appsscript.json | Manifest proyek; aktifkan tampilan manifest pada Setelan proyek |
| server.js | Server lokal mandiri (Node.js) untuk pengujian di komputer |
| jalankan_localhost.bat | File batch untuk langsung menyalakan server lokal cukup dengan klik dua kali |
| clasp_push.bat | File batch untuk otomatis mengirim kode ke Google Apps Script via Clasp |
| Panduan_Pemasangan.md | Panduan ini, tidak ditempel ke editor |

## ⚡ Pengiriman Otomatis ke Google Apps Script (Clasp Push)

Proyek ini telah dikonfigurasi dengan Google Apps Script ID Anda (`1A0W2XeCW6l9eljBX4ijKMbhOvyK1Gebj1Z3ApWvP8soeWDWOcth7ut-9`):
1. Cukup klik dua kali berkas **`clasp_push.bat`**.
2. Seluruh file (`Code.gs`, `Index.html`, dan `appsscript.json`) akan otomatis terkirim (*pushed*) ke editor Apps Script Anda secara instan tanpa perlu salin-tempel manual.
3. Setelah proses push selesai, buka editor Apps Script dan lakukan **Deploy → Kelola deployment → Versi baru → Terapkan**.

## 🌟 Cara Menjalankan di Localhost (Komputer Anda)

Untuk memudahkan pengembangan dan uji coba cepat tanpa harus bolak-balik deploy ke Google Apps Script:
1. Klik dua kali berkas **`jalankan_localhost.bat`** (atau jalankan perintah `node server.js` di terminal).
2. Buka browser dan kunjungi alamat: **http://localhost:3000**
3. Anda dapat langsung menguji login dengan akun:
   - **Admin:** `admin_banyuasin` / `Admin@Banyuasin2026!`
   - **Staf:** `staf_uji1` / `Staf@Banyuasin2026!`
4. Server lokal menyediakan simulasi lengkap untuk: Autentikasi, Luckysheet, Presensi harian, OCR dokumen, dan Cetak laporan.



## 1. Buat proyek baru

1. Buka https://script.google.com/ dan pilih **Proyek baru / New project**.
2. Beri nama **GovMonitor Diskoperindag Banyuasin**.
3. Ganti seluruh isi `Code.gs` dengan isi file `Code.gs` dari paket.
4. Klik **+ → HTML**, ketik nama **Index**, lalu ganti seluruh isinya dengan file `Index.html` dari paket. Jangan memberi nama `Index.html.html`.
5. Buka **Setelan proyek / Project Settings**. Aktifkan **Tampilkan file manifes appsscript.json di editor**.
6. Kembali ke editor dan ganti isi `appsscript.json` dengan file dari paket. Zona waktu **Asia/Jakarta**, runtime **V8**.
7. Simpan semua file. File `Index.html` disajikan secara statis cepat dan stabil oleh `Code.gs` (`createHtmlOutputFromFile`). File `index new.html` dan `Index.html` sudah disinkronkan 100% dan identik.

## 2. Buat database otomatis

1. Pilih fungsi **setupDatabase** pada dropdown fungsi, lalu klik **Jalankan / Run**.
2. Pilih akun Google pemilik proyek dan berikan izin yang diminta untuk Sheets, Drive, layanan eksternal, serta email pemilik. Jika kebijakan akun kantor membatasi otorisasi, ikuti kebijakan administrator akun.
3. Bila eksekusi berhenti sesudah pemberian izin, jalankan **setupDatabase** kembali.
4. Buka **Log eksekusi / Execution log**. Setup berhasil membuat database dan 3 akun awal bawaan:
   - **Admin:**
     - Username: `admin_banyuasin`
     - Password: `Admin@Banyuasin2026!`
     - Peran: Administrator Sistem
   - **Staf Uji 1:**
     - Username: `staf_uji1`
     - Password: `Staf@Banyuasin2026!`
     - Peran: Staf
   - **Staf Uji 2:**
     - Username: `staf_uji2`
     - Password: `Staf@Banyuasin2026!`
     - Peran: Staf
5. Simpan informasi login di atas. Anda dapat langsung login menggunakan akun tersebut setelah Web App dideploy. Menjalankan setup kembali tetap mempertahankan database dan password yang ada.

Setup membuat Google Sheets baru dengan tab sistem, termasuk **Users**, **Broadcasts**, **BroadcastReads**, dan **DailyAttendance**, serta lembar kerja staf. Setup juga membuat folder arsip laporan di Google Drive. ID database dan pengaturan server diisi otomatis.

**Data, akun, dan arsip dari proyek lama tidak otomatis dipindahkan.** Paket ini untuk proyek baru; tidak perlu mengisi URL deployment atau ID database lama. Jangan menggabungkan Code.gs paket ini dengan script lama atau memasang file tambahan dari paket lain.

## 3. Periksa pemasangan

1. Pilih fungsi **checkSystem**, lalu klik **Jalankan**.
2. Pastikan database, tab sistem, admin, password, zona waktu, Index.html dan folder arsip berstatus **OK**.
3. **OCR: OPSIONAL** berarti API key belum diisi. Fitur lainnya tetap bisa dipakai.
4. **BELUM DEPLOY** wajar sebelum penerapan pertama. **PERLU UJI** berarti alamat deployment perlu dibuka dan dicoba.
5. Perbaiki setiap hasil **GAGAL** sesuai keterangannya sebelum melanjutkan.

## 4. Terapkan sebagai Web App

1. Klik **Terapkan / Deploy → Deployment baru / New deployment**.
2. Pilih jenis **Aplikasi web / Web app** melalui ikon roda gigi.
3. Pada **Jalankan sebagai / Execute as**, pilih **Saya / Me** (pemilik proyek).
4. Pada **Siapa yang memiliki akses / Who has access**, pilih **Siapa saja / Anyone** apabila tersedia dan sesuai kebijakan kantor. Akun GovMonitor tetap harus login untuk membaca dan mengubah data kerja. Jika Anda memilih akses organisasi, pengguna harus memenuhi akses Google tersebut juga; halaman QR mengikuti pembatasan akses deployment.
5. Klik **Terapkan**, selesaikan otorisasi bila diminta, kemudian salin **URL aplikasi web yang berakhir /exec**.
6. Buka URL `/exec` di tab browser baru. Jangan menguji login dengan membuka file HTML hasil unduhan secara lokal.
7. Login menggunakan akun dan password dari log setup. Untuk staf sebenarnya, login sebagai Admin, buka **Manajemen Staf**, dan tambahkan akun staf.

Halaman Index terhubung ke fungsi Code.gs melalui `google.script.run`. Anda tidak perlu menempelkan alamat deployment ke dalam Index.html.

## 5. Uji alur setelah deployment

- **Admin:** buka Dashboard, Manajemen Staf, Live Monitor, Log Sistem, dan Laporan e-Kinerja.
- **Pengumuman:** siarkan pesan; login staf melalui profil browser lain. Pastikan banner berjalan. Tekan **Dimengerti**, muat ulang, dan pastikan pengumuman tersebut tidak muncul lagi untuk staf itu. Konfirmasi tersimpan di **BroadcastReads**.
- **Absen:** mulai **07.30 WIB**, klik **Absen saya Hari ini**. Tunggu konfirmasi berhasil. Periksa **File → Riwayat Absen** dan tab **DailyAttendance** di Sheets. Tanggal dan jam ditentukan server WIB; satu catatan per staf per hari. Klik ulang tidak membuat catatan ganda.
- **Lembar kerja:** ubah satu sel, klik **Sinkronisasi**, muat ulang, dan pastikan isi tetap ada di aplikasi maupun Sheets.
- **Cuaca & Udara:** setelah login, ringkasan tampil di bawah tanggal. Pilih wilayah pada panel, lalu tekan **Perbarui**. Data berasal dari Open-Meteo/CAMS. Hasil yang belum tersedia tidak diganti dengan angka contoh. Data tersimpan diberi label jika sumber gagal diperbarui. Layanan eksternal dapat membatasi permintaan.
- **Laporan:** pilih periode dan staf, periksa kop Diskoperindag, lalu coba cetak/PDF. Jika memakai arsip QR, terbitkan satu laporan uji dan buka halaman verifikasinya.

## 6. OCR dan dikte

**OCR:** backend menggunakan Google Cloud Vision. Admin dapat mengisi API key melalui kartu **OCR Google Cloud Vision** di Dashboard, lalu menekan **Uji OCR**. API harus aktif pada proyek Google Cloud yang digunakan. Tanpa key, fitur OCR belum dapat memproses gambar; fitur lainnya tetap berjalan.

**Dikte suara dan kamera:** memerlukan izin perangkat dan dukungan browser. Apps Script menjalankan halaman dalam iframe, sehingga izin mikrofon, kamera, lokasi, dan pengenalan suara dapat dibatasi browser. Paket mempertahankan fitur dikte, tetapi keberhasilannya perlu diuji pada URL `/exec` di perangkat Anda. Jika izin dibatasi, gunakan input manual atau unggah gambar untuk OCR.

**Log IP:** halaman yang berjalan langsung di Apps Script tidak menyediakan IP jaringan pengguna secara andal. Log menampilkan **Tidak tersedia**, tanpa menggunakan IP contoh.

## 7. Jika lupa password akun

Jika ingin mereset password akun (misalnya akun Admin):
1. Pilih fungsi **resetUserPassword** pada editor Apps Script, lalu klik **Jalankan / Run**. Secara default, fungsi ini akan mereset akun `admin_banyuasin` kembali ke password standar `Admin@Banyuasin2026!`.
2. Jika ingin mereset akun/password tertentu: Buka **Setelan proyek → Properti script / Script Properties**. Tambahkan `RESET_USERNAME` (misal: `staf_uji1`) dan `RESET_PASSWORD` (minimal 10 karakter), lalu jalankan fungsi **resetUserPassword**.

## 8. Pembaruan berikutnya

Sesudah mengganti kode: **Terapkan → Kelola deployment → Edit → Versi baru → Terapkan**. Mengubah isi editor saja tidak memperbarui versi `/exec`. Gunakan deployment yang sama agar alamat aplikasi tetap sama.

Jika layar kosong, pastikan nama HTML tepat **Index**, kedua file disalin lengkap, manifest dipasang, `setupDatabase` berhasil, dan versi deployment diperbarui. Pesan login tidak valid biasanya membutuhkan username/password dari log setup, bukan akun demo proyek sebelumnya.

## Validasi paket

Sintaks JavaScript halaman dan backend, manifest, ID komponen, pasangan fungsi RPC, serta ketiadaan URL API/asset khusus Sites sudah diperiksa. Simulasi absen/pengumuman lulus, termasuk tanggal Sheets berupa objek Date, waktu server WIB, pembatasan peran, konfirmasi dan pencegahan absen ganda.

**Deployment pada akun Google Anda belum dijalankan dari percakapan ini.** Langkah 5 diperlukan untuk memastikan izin, CDN, layanan cuaca, perangkat, dan penyimpanan Google bekerja pada akun Anda.

Referensi resmi:
- https://developers.google.com/apps-script/guides/html
- https://developers.google.com/apps-script/guides/html/communication
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/html/restrictions
