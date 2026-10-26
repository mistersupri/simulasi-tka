# Simulasi TKA — SDN Johar Baru 01 Pagi

Web app simulasi Tes Kemampuan Akademik (TKA) berbasis **Google Apps Script**
dengan database **Google Spreadsheet**.

```
apps-script/
  Kode.gs           ← kode server (salin ke file Kode.gs di Apps Script)
  Index.html        ← halaman web (salin ke file HTML bernama "Index")
  appsscript.json   ← manifest (opsional, untuk clasp)
database/
  Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx  ← template database
tests/              ← pengujian otomatis (node --test)
```

## Cara memasang

1. **Siapkan database di Google Sheets**
   - Unggah `database/Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx` ke Google Drive.
   - Buka file itu, lalu pilih **File → Simpan sebagai Google Spreadsheet**.
     (Apps Script *tidak bisa* membaca file `.xlsx` secara langsung.)
   - Salin ID spreadsheet dari alamat URL:
     `https://docs.google.com/spreadsheets/d/`**`ID_DI_SINI`**`/edit`

2. **Buat proyek Apps Script**
   - Di spreadsheet tadi: **Ekstensi → Apps Script**.
   - Ganti isi `Kode.gs` dengan isi `apps-script/Kode.gs`.
   - Klik **+ → HTML**, beri nama **`Index`** (huruf I besar), lalu tempel isi `apps-script/Index.html`.
   - Di bagian atas `Kode.gs`, isi `SPREADSHEET_ID` dengan ID dari langkah 1,
     atau kosongkan (`''`) karena script dibuat langsung dari spreadsheet tersebut.

3. **Periksa database**
   - Pilih fungsi `periksaDatabase` → **Jalankan** → izinkan akses.
   - Lihat **Log eksekusi**: jumlah siswa, jumlah soal per mapel/kelas, dan peringatan bila ada masalah.

4. **Terapkan (deploy)**
   - **Terapkan → Deployment baru → Aplikasi web**.
   - *Jalankan sebagai*: **Saya**. *Yang memiliki akses*: **Siapa saja**.
   - Bagikan URL aplikasi web ke siswa.
   - Setiap kali kode diubah: **Terapkan → Kelola deployment → Edit → Versi baru**.

Akun uji bawaan: username `uji_tka`, kata sandi `LatihanTKA2026!`.
Ubah STATUS akun ini menjadi `NONAKTIF` saat simulasi sungguhan.

## Struktur database

| Lembar | Kolom |
|---|---|
| `DATA_SISWA` | NISN, NAMA_SISWA, KELAS, USERNAME, PASSWORD_HASH, STATUS, PASSWORD_SALT |
| `BANK_SOAL` | ID_SOAL, MATA_PELAJARAN, KELAS, PERTANYAAN, OPSI_A–OPSI_D, KUNCI_JAWABAN (A/B/C/D), SKOR |
| `HASIL_UJIAN` | ID_HASIL, NISN, NAMA_SISWA, TANGGAL_UJIAN, NILAI, JUMLAH_BENAR, JUMLAH_SALAH, DURASI_DETIK, STATUS_UJIAN, *MATA_PELAJARAN (opsional)*, *KELAS (opsional)* |

- Kolom dibaca berdasarkan **nama header** di baris 1, jadi urutan kolom boleh diubah.
- Setiap mata pelajaran yang ada di `BANK_SOAL` untuk kelas siswa otomatis muncul
  sebagai pilihan setelah login (bila hanya satu, ujian langsung dimulai).
- `SKOR` adalah bobot soal; nilai akhir = skor diperoleh ÷ skor maksimal × 100.

### Menambah soal
Isi baris baru di `BANK_SOAL`. Kolom pertanyaan dan opsi sebaiknya berformat
**Teks biasa** (Format → Angka → Teks biasa) agar jawaban seperti `3/4` tidak
berubah menjadi tanggal. Bila sudah terlanjur, jalankan `rapikanFormatBankSoal()`.

### Menambah siswa
- **Banyak siswa sekaligus:** isi `DATA_SISWA`, tulis password *asli* di kolom
  `PASSWORD_HASH`, kosongkan `PASSWORD_SALT`, lalu jalankan `hashPasswordBaru()`.
  Catat password asli sebelum menjalankan, karena akan diganti dengan hash.
- **Satu siswa:** `tambahAkunSiswa(nisn, nama, kelas, username, password)`.
- **Ganti password:** `gantiPasswordSiswa(username, passwordBaru)`.

## Pengujian

```
npm test
```
Menjalankan `Kode.gs` dengan tiruan layanan Apps Script dan data yang sama
seperti file Excel database.
