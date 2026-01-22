# Struktur Google Sheet - Pinjaman Komunitas

Dokumen ini menjelaskan struktur **Google Sheets** yang wajib disiapkan untuk
platform pinjaman komunitas tertutup. Pastikan nama sheet dan kolom **persis**
sesuai agar SheetDB dapat membaca data dengan benar.

## Sheet yang Wajib Ada
- `admin` (data admin)
- `pinjaman` (data pengajuan pinjaman)

---

## 1. Sheet: `admin`
Digunakan untuk autentikasi admin (tanpa pendaftaran umum).

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | number/string | ID unik admin |
| `username` | string | Username login admin |
| `password` | string | Password login admin |
| `nama` | string | Nama admin |
| `role` | string | Tetap `admin` |
| `status` | string | `active` / `inactive` |

**Catatan:**
- Semua baris admin **wajib** memiliki `role=admin`.
- Gunakan `status=active` untuk akun yang boleh login.

---

## 2. Sheet: `pinjaman`
Menyimpan data pengajuan pinjaman dan status persetujuan.

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | number/string | ID unik pengajuan |
| `tanggal_pengajuan` | date/string | Tanggal submit (ISO `YYYY-MM-DD`) |
| `nama` | string | Nama peminjam |
| `nomor_hp` | string | Nomor WhatsApp/HP |
| `nominal` | number | Nominal pinjaman |
| `bunga_persen` | number | Angka persentase: 5, 10, atau 20 |
| `bunga_nominal` | number | Nominal bunga |
| `total_bayar` | number | Total bayar (nominal + bunga) |
| `tenor_hari` | number | Tetap 30 |
| `status` | string | `pending`, `approved`, `rejected` |
| `dokumen_url` | string | URL dokumen (opsional) |
| `tanggal_persetujuan` | date/string | Diisi saat approve/reject (ISO `YYYY-MM-DD`) |
| `catatan` | string | Catatan admin (opsional) |

**Catatan:**
- Gunakan `status=pending` untuk pengajuan baru.
- Kolom `tenor_hari` selalu `30` sesuai ketentuan.
- Rumus: `bunga_nominal = nominal × (bunga_persen / 100)`, `total_bayar = nominal + bunga_nominal`.

---

## Checklist Setup
1. Buat sheet baru dengan nama persis `admin` dan `pinjaman`.
2. Isi header kolom di baris pertama sesuai tabel masing-masing sheet di atas.
3. Pastikan data numerik (nominal, bunga, total) berformat angka.
