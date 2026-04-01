# Koperasi Pro (Admin-Only Web App)

Sistem koperasi berbasis web dengan akses **hanya admin** (tanpa login nasabah), sesuai desain spreadsheet final:

- `nasabah`
- `simpanan`
- `pinjaman`
- `angsuran`
- `admin`
- `log`

## Fitur

- Login admin wajib (`username + password`, 1 admin).
- Token sesi disimpan di browser (`sessionStorage`).
- Dashboard utama: total nasabah, total simpanan, total pinjaman aktif, total angsuran, grafik bulanan.
- Kelola nasabah: tambah, edit, aktif/nonaktif, cari cepat, filter status.
- Simpanan: input transaksi, riwayat per nasabah/jenis/bulan, export Excel/PDF.
- Pinjaman: input pinjaman, catat angsuran, status otomatis `berjalan/lunas`.
- Export: laporan bulanan, per nasabah, per jenis simpanan, plus export semua sheet Excel.
- Log aktivitas: jejak tambah/edit/login.

## Akun Awal

- Username: `admin`
- Password: `admin123`

`password_hash` disimpan sebagai bcrypt jika library tersedia (fallback plain hash lokal bila CDN bcrypt gagal dimuat).

## Menjalankan

Karena ini aplikasi statis, cukup:

1. Buka file `index.html` di browser.
2. Atau jalankan static server lokal (opsional), contoh:

```powershell
python -m http.server 8080
```

Lalu akses `http://localhost:8080`.

## Struktur Data Internal

Semua data disimpan di `localStorage` key: `koperasi_db_v1` dengan kolom mengikuti struktur sheet final Anda.

## Integrasi Google Sheets (Google Apps Script)

Project ini sudah disiapkan untuk sinkronisasi database ke Google Sheets lewat Web App GAS.

### 1) Pasang kode GAS

1. Buka `script.new`.
2. Salin isi file `google-apps-script/Code.gs`.
3. Simpan project GAS.

Kode tersebut sudah memakai Spreadsheet ID Anda:

- `15rFEqZoJjjNGwcDnXhZTvDcgPApaJYV5hNZUPDbe84s`

Saat pertama dipanggil, GAS otomatis membuat sheet + header:

- `nasabah`
- `simpanan`
- `pinjaman`
- `angsuran`
- `admin`
- `log`

### 2) Deploy jadi Web App

1. Klik `Deploy` -> `New deployment`.
2. Pilih tipe `Web app`.
3. `Execute as`: `Me`.
4. `Who has access`: `Anyone`.
5. Deploy, lalu copy URL `.../exec`.

### 3) Hubungkan dari web

Di `app.js`, isi konstanta:

```js
const GAS_WEBAPP_URL = "PASTE_URL_WEB_APP_EXEC_DI_SINI";
```

Lokasi konstanta: `app.js` bagian atas.

Setelah URL diisi, aplikasi akan:

- tarik data dari Sheets saat startup (`getDb`),
- membuat sheet/header otomatis bila belum ada (`bootstrap`),
- push perubahan data ke Sheets setiap ada perubahan (`setDb`).

## File Utama

- `index.html` - struktur UI (sidebar, topbar, cards, tabel, halaman login).
- `styles.css` - gaya visual dashboard (light/dark, card, tabel, badge).
- `app.js` - logika auth, CRUD, dashboard, laporan, export, dan log aktivitas.
