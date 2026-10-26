# Simulasi TKA — SDN Johar Baru 01 Pagi

Aplikasi web untuk simulasi Tes Kemampuan Akademik (TKA) berbasis **Google Apps Script**.
Datanya disimpan di **Google Spreadsheet**, sedangkan gambar soal, logo, backup, dan
file ekspor disimpan di **Google Drive**. Tidak perlu server atau hosting berbayar.

## Fitur

### Halaman siswa
- Login dengan username & kata sandi (dari kartu login yang dicetak sekolah).
- Beranda: daftar ujian sesuai kelas beserta statusnya (tersedia / belum dibuka / ditutup / selesai), pengumuman sekolah, dan riwayat nilai.
- Ujian bergaya ANBK/TKA:
  - **timer** hitung mundur, dan jawaban **terkirim otomatis** saat waktu habis;
  - tombol **ragu-ragu** dan panel nomor soal berwarna;
  - soal bergambar;
  - soal **pilihan ganda** dan **pilihan ganda kompleks**;
  - tombol untuk memperbesar atau memperkecil huruf.
- **Simpan otomatis** setiap 15 detik, dan ada cadangan di perangkat. Bila koneksi putus atau HP mati, siswa cukup login lagi lalu memilih **Lanjutkan Ujian**. Sisa waktu tetap dihitung oleh server.
- Halaman hasil: nilai, keterangan tuntas/belum tuntas (KKM), serta **pembahasan** bila guru mengizinkan.
- Siswa dapat mengganti kata sandi sendiri (bisa dimatikan admin).

### Halaman guru & admin (`URL_APLIKASI?page=admin`)
| Menu | Isi |
|---|---|
| Dashboard | Ringkasan jumlah siswa, soal, ujian, siswa yang sedang mengerjakan, rata-rata nilai, dan langkah awal |
| Monitor Ujian | Siswa yang sedang mengerjakan: progres, sisa waktu, aktivitas terakhir. Aksi: **tambah waktu**, **kirim paksa**, **reset** (diperbarui otomatis setiap 20 detik) |
| Bank Soal | Tambah, ubah, dan hapus soal; pratinjau; aktif/nonaktif; **unggah gambar ke Drive**; **impor** dari tempelan Excel atau CSV; unduh CSV |
| Jadwal Ujian | Mapel, kelas, durasi, jumlah soal (diambil acak dari bank soal), jadwal buka/tutup, **token ujian**, acak soal/opsi, maksimal percobaan, tampilkan nilai/pembahasan |
| Hasil & Analisis | Filter per ujian/kelas, detail jawaban tiap siswa, **analisis butir soal** (tingkat kesukaran & sebaran pilihan), **ekspor ke Google Sheets**, unduh CSV, hapus hasil (agar siswa bisa mengulang) |
| Data Siswa *(admin)* | Tambah, ubah, hapus, aktif/nonaktif; **impor massal** dengan username & kata sandi otomatis; **reset kata sandi**; **cetak kartu login** |
| Guru & Admin *(admin)* | Kelola akun guru/admin |
| Pengaturan *(admin)* | Nama sekolah, tahun ajaran, KKM, pengumuman, logo, tautan ke spreadsheet & folder Drive, **backup sekarang** / **backup harian otomatis** |
| Log Aktivitas *(admin)* | Jejak siapa melakukan apa dan kapan |

Peran **Guru** dapat mengelola bank soal, jadwal ujian, monitor, dan hasil.
Peran **Admin** dapat mengakses semua menu.

## Usulan yang sudah ditambahkan (dibanding versi awal)

| Usulan | Alasan |
|---|---|
| Jadwal ujian + token pengawas | Ujian hanya bisa dibuka pada jam yang ditentukan, dan hanya siswa di ruangan yang tahu token |
| Timer di server + simpan otomatis + lanjutkan ujian | Koneksi sekolah sering putus; jawaban tidak hilang dan waktu tidak bisa dicurangi |
| Ragu-ragu, panel nomor, ukuran huruf | Membiasakan siswa dengan tampilan TKA/ANBK |
| Pilihan ganda kompleks | Bentuk soal ini ada di TKA SD |
| Acak soal & acak opsi | Mengurangi kesempatan menyontek |
| Soal bergambar di Google Drive | Soal TKA banyak yang memakai gambar/diagram |
| Impor dari Excel + cetak kartu login | Mendaftarkan satu kelas cukup beberapa menit |
| Monitor real-time + tambah waktu/reset | Pengawas bisa membantu siswa yang bermasalah tanpa membuka spreadsheet |
| Analisis butir soal | Guru tahu soal mana yang terlalu sukar atau pengecohnya tidak berfungsi |
| KKM, pembahasan, riwayat nilai | Simulasi juga berfungsi sebagai sarana belajar |
| Peran guru/admin + log aktivitas | Pembagian tugas dan jejak perubahan |
| Backup otomatis ke Drive | Data aman bila spreadsheet terhapus atau rusak |
| Penguncian login 5 menit setelah 5 kali salah | Mencegah tebak-tebakan kata sandi |

## Arsitektur

```
Browser siswa / guru
   │  google.script.run (token sesi)
   ▼
Google Apps Script (Web App, berjalan sebagai pemilik)
   ├── Google Spreadsheet  ← database (satu lembar = satu tabel)
   ├── Google Drive        ← gambar soal, logo, backup, ekspor
   └── CacheService        ← sesi login & penguncian login
```

```
apps-script/
  00_Konfigurasi.gs   konfigurasi & skema tabel
  01_Database.gs      baca/tulis spreadsheet sebagai tabel (berdasarkan nama header)
  02_Utilitas.gs      fungsi bantu
  03_Auth.gs          hash kata sandi, sesi, login siswa & admin
  04_Drive.gs         folder Drive, gambar, backup, ekspor
  05_Ujian.gs         mesin ujian: acak soal/opsi, penilaian, penyimpanan hasil
  10_Siswa.gs         API halaman siswa
  20_Admin.gs         API dashboard, siswa, pengguna, pengaturan, log, backup
  21_AdminSoal.gs     API bank soal
  22_AdminUjian.gs    API jadwal ujian, hasil, analisis, monitor, ekspor
  90_Setup.gs         setupAplikasi() & alat perawatan
  WebApp.gs           doGet() & include()
  Index.html          halaman siswa
  Admin.html          halaman guru/admin
  Gaya.html           CSS bersama
  Klien.html          JavaScript bersama
  appsscript.json     manifest
database/
  Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx   template database (berisi data awal)
tests/                pengujian otomatis (node --test)
```

Keamanan:
- Kata sandi disimpan sebagai hash SHA-256 (10.000 iterasi) dengan salt.
- Browser hanya memegang token sesi; identitas siswa diambil dari server.
- Kunci jawaban tidak pernah dikirim ke browser selama ujian.
- Gambar hanya bisa diambil dari folder *Gambar Soal*.
- Teks disimpan berformat teks biasa, sehingga tidak bisa dieksekusi sebagai rumus.

## Cara memasang

1. **Siapkan spreadsheet database**
   - Unggah `database/Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx` ke Google Drive,
     buka, lalu pilih **File → Simpan sebagai Google Spreadsheet**.
     (Spreadsheet lama juga bisa dipakai langsung; kolom yang kurang akan ditambahkan otomatis.)

2. **Buat proyek Apps Script**
   - Di spreadsheet: **Ekstensi → Apps Script**.
   - Buat file sesuai daftar di `apps-script/` dengan **nama yang sama persis**:
     - file `.gs`: klik **+ → Skrip**, beri nama tanpa `.gs` (misalnya `00_Konfigurasi`);
     - file `.html`: klik **+ → HTML**, beri nama `Index`, `Admin`, `Gaya`, `Klien`.
   - Tempel isi tiap file. Hapus `Kode.gs` bawaan bila kosong.
   - Di `00_Konfigurasi.gs`, kosongkan `SPREADSHEET_ID: ''` karena script dibuat dari spreadsheet itu.
     Bila script dibuat terpisah, isi dengan ID spreadsheet dari URL.
   - *Alternatif:* pakai [clasp](https://github.com/google/clasp) dengan `rootDir` = `apps-script`.

3. **Jalankan setup**
   - Pilih fungsi `setupAplikasi` → **Jalankan** → izinkan akses (Spreadsheet, Drive, pemicu).
   - Buka **Log eksekusi**. Di sana tertulis username `admin` dan **kata sandi admin pertama**.
     Catat, lalu segera ganti setelah login.
   - Setup membuat lembar & kolom yang kurang, folder Drive, akun admin, dan satu
     ujian latihan per mapel/kelas dari bank soal yang sudah ada. Setup aman dijalankan ulang.

4. **Terapkan (deploy)**
   - **Terapkan → Deployment baru → Aplikasi web**.
     *Jalankan sebagai*: **Saya**. *Yang memiliki akses*: **Siapa saja**.
   - URL aplikasi web = halaman siswa. Halaman admin = URL yang sama ditambah `?page=admin`.
   - Setiap kali kode diubah: **Terapkan → Kelola deployment → Edit → Versi: Baru**.

Lupa kata sandi admin? Jalankan `resetPasswordPengguna('admin', 'KataSandiBaru123')` dari editor.

## Alur pemakaian

1. **Data Siswa → Impor**: tempel kolom NISN, Nama, Kelas dari Excel → **Cetak Kartu Login**.
2. **Bank Soal**: tambah soal satu per satu, atau **Impor** (bisa langsung menyalin dari lembar BANK_SOAL lama).
3. **Jadwal Ujian → Buat Ujian**: atur mapel, kelas, durasi, jadwal, dan token.
4. Hari ujian: bacakan token → siswa login dan mengerjakan → pantau di **Monitor Ujian**.
5. **Hasil & Analisis**: lihat nilai, analisis butir soal, lalu **Ekspor ke Google Sheets** untuk rapor/arsip.

## Struktur database

Satu lembar = satu tabel, baris 1 = nama kolom. Kolom dibaca berdasarkan **nama header**,
jadi urutan kolom boleh diubah dan kolom tambahan boleh ditambahkan.

| Lembar | Isi |
|---|---|
| `DATA_SISWA` | NISN, NAMA_SISWA, KELAS, USERNAME, PASSWORD_HASH, STATUS, PASSWORD_SALT, LOGIN_TERAKHIR |
| `BANK_SOAL` | ID_SOAL, MATA_PELAJARAN, KELAS, PERTANYAAN, OPSI_A–D, KUNCI_JAWABAN (`B` atau `A,C`), SKOR, TIPE_SOAL (`PG`/`PGK`), GAMBAR_ID, PEMBAHASAN, STATUS, DIBUAT |
| `UJIAN` | Jadwal & aturan ujian |
| `SESI_UJIAN` | Ujian yang sedang/pernah dikerjakan: urutan soal, jawaban sementara, batas waktu |
| `HASIL_UJIAN` | Nilai akhir + rincian jawaban (JSON) |
| `PENGGUNA` | Akun guru/admin |
| `PENGATURAN` | Pasangan KUNCI–NILAI (nama sekolah, KKM, ID folder Drive, dll.) |
| `LOG_AKTIVITAS` | Jejak aktivitas |

Nilai = jumlah skor soal yang dijawab benar ÷ total skor × 100. Soal PG kompleks dianggap
benar hanya bila semua pilihannya tepat.

Data boleh diedit langsung di spreadsheet. Kolom `PASSWORD_HASH`/`PASSWORD_SALT` jangan
diketik manual; gunakan menu Data Siswa atau fungsi `resetPasswordPengguna`.

## Batasan & tips

- Apps Script membatasi sekitar **30 eksekusi bersamaan** per akun pemilik. Dengan simpan
  otomatis setiap 15 detik, satu sesi ujian nyaman dipakai hingga ±100 siswa sekaligus.
  Untuk jumlah lebih besar, bagi sesi ujian atau naikkan `INTERVAL_SIMPAN_MS` di `Index.html`.
- Login memerlukan beberapa detik karena kata sandi di-hash berulang (demi keamanan). Impor/reset
  kata sandi diproses 10 siswa per tahap.
- Pada akun Google Workspace sekolah yang melarang berbagi file ke publik, gambar tetap
  tampil karena diambil lewat server (sedikit lebih lambat).
- Bila tombol unduh CSV tidak berfungsi di browser tertentu, gunakan **Ekspor ke Google Sheets**.
- Aktifkan **Backup harian** di menu Pengaturan.

## Usulan pengembangan berikutnya

- Bentuk soal lain: menjodohkan, benar-salah per pernyataan, isian singkat.
- Bank soal per guru (guru hanya melihat dan mengubah soal miliknya).
- Rapor/sertifikat PDF per siswa langsung dari hasil ujian.
- Kirim nilai ke orang tua lewat email/WhatsApp.
- Statistik perkembangan siswa antar try out.

## Pengujian

```
npm test
```

Menjalankan semua file `.gs` di Node dengan tiruan layanan Apps Script (Spreadsheet,
Drive, Cache, dll.) memakai data yang sama dengan Excel database. Yang diuji: setup &
migrasi, login, alur ujian lengkap, timer, opsi acak, PG kompleks, gambar, impor, peran,
monitor, analisis, ekspor, backup, dan pengaturan.
