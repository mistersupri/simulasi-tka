# Simulasi TKA: versi server

Versi aplikasi Simulasi TKA yang di-deploy di server sendiri.
Datanya disimpan di PostgreSQL, tidak lagi di Google Spreadsheet.

| Bagian | Teknologi |
|---|---|
| Antarmuka | React 19 + Vite, TanStack React Query, React Router, Tailwind CSS v4, shadcn/ui (Radix) |
| Server | Node.js 22 + Express 5, Zod (validasi) |
| Database | PostgreSQL 16 lewat Prisma 7 |
| Deteksi wajah | MediaPipe Face Detector, berjalan di browser siswa (WebAssembly, disajikan dari server sendiri) |

Arah desain (warna, huruf, motif "stiker") dijelaskan di [`DESIGN.md`](DESIGN.md).

## Fitur

**Siswa**
- Login dengan kartu login, beranda berisi daftar ujian, pengumuman, dan riwayat nilai.
- Ujian dengan timer dari server, tombol ragu-ragu, panel nomor soal, ukuran huruf,
  pilihan ganda & pilihan ganda kompleks, soal bergambar.
- Simpan otomatis setiap 15 detik ditambah cadangan di perangkat. Bila koneksi putus,
  siswa melanjutkan dari soal terakhir.
- Nilai, status tuntas (KKM), dan pembahasan bila diizinkan guru.

**Pengawasan ujian** (diatur per ujian)
| Fitur | Cara kerja |
|---|---|
| Layar penuh | Ujian dibuka layar penuh. Bila siswa keluar, soal disembunyikan sampai ia kembali, dan kejadian itu dicatat sebagai pelanggaran. |
| Tidak bisa blok/salin | Teks soal tidak bisa diblok. Salin, potong, tempel, klik kanan, seret, Ctrl+A/C/V/P/S/U, F12, dan PrintScreen dicegah dan dicatat. |
| Pindah tab/aplikasi | Halaman tersembunyi atau jendela kehilangan fokus dicatat. |
| Deteksi wajah | Kamera memeriksa wajah setiap detik di perangkat siswa. Tidak ada wajah selama ±4 detik, atau lebih dari satu wajah selama ±3 detik, dicatat bersama **foto bukti kecil**. Video tidak direkam dan tidak dikirim. |
| Kirim otomatis | Ujian dikirim otomatis pada pelanggaran ke-N (diatur guru; 0 = hanya dicatat). |
| Monitor | Guru melihat progres, sisa waktu, jumlah pelanggaran, dan foto bukti secara langsung; bisa menambah waktu, mengirim paksa, atau mereset. |

> **Batasan yang perlu diketahui sekolah.** Pengawasan di browser membuat kecurangan
> lebih sulit dan meninggalkan jejak, tetapi tidak bisa mencegah semuanya
> (mis. HP kedua di bawah meja). Tetap gunakan pengawas di ruangan.
> - iPhone/iPad tidak mendukung layar penuh untuk halaman web. Di perangkat itu,
>   pindah aplikasi tetap tercatat, tetapi keluar layar penuh tidak bisa dideteksi.
> - Deteksi wajah butuh kamera dan **HTTPS** (atau `localhost`).
> - Perangkat yang sangat lambat mungkin perlu beberapa detik untuk memuat model wajah
>   (±15 MB WebAssembly, di-cache browser setelah pertama kali).

**Guru & admin** (`/admin`)
- Bank soal: tambah/ubah, gambar, PG kompleks, pratinjau, impor tempel dari Excel/CSV, unduh.
- Jadwal ujian: mapel, kelas, durasi, jumlah soal acak, jadwal buka/tutup, token, acak opsi,
  aturan pengawasan.
- Hasil: detail jawaban & catatan pelanggaran per siswa, analisis butir soal, unduh Excel/CSV.
- Data siswa: impor massal dengan username/kata sandi otomatis, **cetak kartu login**,
  reset kata sandi, aktif/nonaktif.
- Guru & admin (peran GURU hanya bisa mengurus soal, ujian, monitor, dan hasil), pengaturan
  sekolah & logo, log aktivitas, unduh cadangan JSON.
- **Impor dari versi Google Sheets**: unggah file `.xlsx` lama di menu Pengaturan.
  Siswa tetap bisa login dengan kata sandi lama; hash otomatis diperbarui ke scrypt saat login.

## Menjalankan untuk pengembangan

Butuh Node.js 22 dan PostgreSQL 16.

```bash
cd web
cp .env.example .env          # sesuaikan DATABASE_URL
npm install                   # juga menyalin berkas MediaPipe & generate Prisma client
npx prisma migrate deploy     # membuat tabel
ADMIN_PASSWORD=RahasiaAdmin1 SEED_EXCEL=../database/Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx npm run db:seed
npm run dev                   # API :3000 + Vite :5173 (buka http://localhost:5173)
```

## Deploy ke server

### Dengan Docker (disarankan)

```bash
cd web
cp .env.example .env          # isi DB_PASSWORD, ADMIN_PASSWORD
docker compose up -d --build
docker compose exec app npm run db:seed   # membuat akun admin pertama
```

Aplikasi berjalan di port 3000. Data tersimpan di volume `db` (PostgreSQL) dan
`uploads` (gambar soal, logo, foto bukti pelanggaran).

### Tanpa Docker

```bash
cd web
npm ci
npm run build
npx prisma migrate deploy
npm run db:seed
NODE_ENV=production npm start      # gunakan pm2/systemd agar berjalan terus
```

### HTTPS

Pasang reverse proxy (Nginx/Caddy) dengan sertifikat HTTPS di depan port 3000, lalu
set `COOKIE_SECURE=true`. **Kamera untuk deteksi wajah hanya bisa dipakai lewat HTTPS.**
Contoh Caddy: `tka.sekolah.sch.id { reverse_proxy localhost:3000 }`.
Bila berkas `.xlsx` hasil impor berukuran besar, naikkan batas unggah di proxy (mis. `client_max_body_size 10m` di Nginx).

### Cadangan

Unduh cadangan JSON dari menu Pengaturan, atau cadangkan database langsung:
`docker compose exec db pg_dump -U tka simulasi_tka > cadangan.sql`. Cadangkan juga volume `uploads`.

## Struktur

```
web/
  prisma/schema.prisma     tabel: Siswa, Pengguna, Soal, Ujian, SesiUjian, Pelanggaran, Hasil, ...
  prisma/seed.ts           admin pertama + impor Excel lama
  server/
    app.ts                 Express: keamanan (CSP, cookie httpOnly), rute, berkas statis
    lib/mesin.ts           acak soal/opsi, penilaian, penyelesaian sesi
    lib/imporExcel.ts      impor dari versi Google Sheets
    routes/                auth, siswa, admin/*
  src/
    pages/siswa/           Beranda (login), Ujian, Hasil
    pages/admin/           Dashboard, Monitor, Soal, Ujian, Hasil, Siswa, Pengguna, Pengaturan, Log
    hooks/usePengawasan.ts layar penuh, anti salin, pindah tab, deteksi wajah
    components/ui/         komponen shadcn/ui
  tests/api.test.ts        tes API terhadap PostgreSQL sungguhan
```

## Keamanan & privasi

- Kata sandi: scrypt (akun baru) / SHA-256 berulang (akun impor, diperbarui saat login).
- Sesi login disimpan di database, browser hanya memegang cookie `httpOnly`.
- Kunci jawaban tidak pernah dikirim ke browser selama ujian.
- Gambar soal hanya bisa dibuka pengguna yang login; foto pelanggaran hanya oleh guru/admin.
- Content-Security-Policy hanya mengizinkan sumber dari server sendiri. Ini juga memblokir
  telemetri bawaan MediaPipe ke Google, jadi tidak ada data dari perangkat siswa yang keluar.
- 5 kali salah kata sandi mengunci login 5 menit (disimpan di memori proses; untuk lebih dari
  satu instance server, ganti dengan penyimpanan bersama).

## Tes

```bash
createdb simulasi_tka_test     # sekali saja
npm test                       # 15 skenario API: login, ujian, pelanggaran, admin, ekspor, impor
```
