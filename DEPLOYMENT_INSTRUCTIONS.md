# Panduan Deploy Google Apps Script Proxy

## Langkah-langkah Deployment

### 1. Buka Google Apps Script
- Kunjungi: https://script.google.com/
- Login dengan akun Google Anda

### 2. Buat Project Baru
- Klik **"New project"** atau **"+ Project baru"**
- Beri nama project: **"Paket Sembako API Proxy"**

### 3. Copy Kode
- Hapus kode default yang ada
- Copy semua isi file `Code.gs` 
- Paste ke editor Google Apps Script

### 4. Deploy sebagai Web App
1. Klik **"Deploy"** > **"New deployment"**
2. Klik icon ⚙️ (gear) di sebelah "Select type"
3. Pilih **"Web app"**
4. Isi konfigurasi:
   - **Description:** "API Proxy untuk Paket Sembako"
   - **Execute as:** **Me** (email Anda)
   - **Who has access:** **Anyone**
5. Klik **"Deploy"**
6. Klik **"Authorize access"** jika diminta
7. Pilih akun Google Anda
8. Klik **"Advanced"** > **"Go to Paket Sembako API Proxy (unsafe)"**
9. Klik **"Allow"**

### 5. Copy URL Web App
- Setelah deployment berhasil, Anda akan mendapat **Web app URL**
- URL akan berbentuk seperti:
  ```
  https://script.google.com/macros/s/AKfycby.../exec
  ```
- **COPY URL INI!** Anda akan membutuhkannya di langkah berikutnya

### 6. Update Konfigurasi Website
- Buka file `assets/js/config.js` di project Anda
- Ganti URL di bagian `DEFAULTS`:
  ```javascript
  DEFAULTS: {
      MAIN_API: 'PASTE_URL_WEB_APP_ANDA_DISINI',
      ADMIN_API: 'PASTE_URL_WEB_APP_ANDA_DISINI',
      API_SECRET_KEY: 'PAKET-SEMBAKO-RAHASIA-2026',
  },
  ```

### 7. Test API
- Buka website Anda
- Produk seharusnya sudah muncul
- Cek browser console untuk memastikan tidak ada error

## Troubleshooting

### Error: "Authorization required"
- Pastikan Anda sudah authorize script
- Ulangi langkah 4.6 - 4.9

### Error: "Script function not found"
- Pastikan nama fungsi di script adalah `doGet` dan `doPost`
- Deploy ulang dengan versi baru

### Produk tidak muncul
- Buka browser console (F12)
- Cek apakah ada error
- Pastikan URL Web App sudah benar di config.js
- Pastikan sheet name di SheetDB adalah "products"

### Error 403 Forbidden
- Pastikan "Who has access" diset ke **Anyone**
- Deploy ulang jika perlu

## Update Script

Jika Anda perlu update kode di kemudian hari:

1. Edit kode di Google Apps Script editor
2. Klik **"Deploy"** > **"Manage deployments"**
3. Klik icon ✏️ (edit) di deployment yang aktif
4. Ubah **"Version"** menjadi **"New version"**
5. Klik **"Deploy"**
6. URL tetap sama, tidak perlu update config.js

## Informasi Penting

- **SheetDB API URL:** `https://sheetdb.io/api/v1/tuhdgrr6ngocm`
- **Spreadsheet:** https://docs.google.com/spreadsheets/d/174qAwA2hddfQOFUFDx7czOtpRlD9WUiiIaf6Yao8WRc/edit
- **Secret Key:** `PAKET-SEMBAKO-RAHASIA-2026` (untuk operasi write)

## Sheet Names yang Digunakan

Pastikan sheet-sheet berikut ada di spreadsheet Anda:
- `products` - Data produk
- `orders` - Data pesanan
- `categories` - Data kategori
- `tukar_poin` - Data reward/hadiah
- `user_points` - Data poin pengguna
- `claims` - Data klaim reward
- `admin` - Data admin (login)
- `pinjaman` - Data pinjaman komunitas

## Struktur Kolom Sheet Pinjaman

### Sheet `admin`
Digunakan untuk autentikasi admin (role admin only).

| Kolom | Keterangan |
| --- | --- |
| `id` | ID unik admin |
| `username` | Username login admin |
| `password` | Password login admin |
| `nama` | Nama admin |
| `role` | Tetap `admin` |
| `status` | `active` / `inactive` |

### Sheet `pinjaman`
Menyimpan data pengajuan pinjaman komunitas tertutup.

| Kolom | Keterangan |
| --- | --- |
| `id` | ID unik pengajuan |
| `tanggal_pengajuan` | Tanggal submit (ISO `YYYY-MM-DD`) |
| `nama` | Nama peminjam |
| `nomor_hp` | Nomor WhatsApp/HP |
| `nominal` | Nominal pinjaman |
| `bunga_persen` | 5, 10, atau 20 |
| `bunga_nominal` | Nominal bunga (angka) |
| `total_bayar` | Total bayar (nominal + bunga, angka) |
| `tenor_hari` | Tetap 30 |
| `status` | `pending`, `approved`, `rejected` |
| `dokumen_url` | URL dokumen (opsional) |
| `tanggal_persetujuan` | Diisi saat approve/reject |
| `catatan` | Catatan admin (opsional) |

**Catatan:** `status` default `pending`, dan `tenor_hari` selalu `30`.
