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
| Rekam layar | Tangkapan layar berkala (30 detik sampai 5 menit, diatur per ujian) dan sesaat setelah setiap pelanggaran, sehingga terlihat apa yang dibuka siswa saat pindah tab. Di browser, siswa wajib membagikan **seluruh layar**; berhenti berbagi menyembunyikan soal dan dicatat. Di aplikasi Windows layar diambil langsung tanpa dialog. Pengawas melihatnya di Monitor dan detail hasil. |
| Kirim otomatis | Ujian dikirim otomatis pada pelanggaran ke-N (diatur guru; 0 = hanya dicatat). |
| Wajib aplikasi | Ujian bisa dibatasi hanya lewat aplikasi ujian Windows ([`desktop/`](../desktop/README.md)), yang mengunci layar dan memblokir tangkapan layar. Butuh `KUNCI_APLIKASI` di server. |
| Monitor | Guru melihat progres, sisa waktu, jumlah pelanggaran, dan foto bukti secara langsung; bisa menambah waktu, mengirim paksa, atau mereset. |

> **Batasan yang perlu diketahui sekolah.** Pengawasan di browser membuat kecurangan
> lebih sulit dan meninggalkan jejak, tetapi tidak bisa mencegah semuanya
> (mis. HP kedua di bawah meja). Tetap gunakan pengawas di ruangan.
> - iPhone/iPad tidak mendukung layar penuh untuk halaman web. Di perangkat itu,
>   pindah aplikasi tetap tercatat, tetapi keluar layar penuh tidak bisa dideteksi.
> - Deteksi wajah butuh kamera dan **HTTPS** (atau `localhost`).
> - Rekam layar di browser butuh komputer/laptop dengan Chrome, Edge, atau Firefox terbaru. HP dan tablet
>   tidak bisa membagikan layar, sehingga ujian yang merekam layar tidak bisa dikerjakan di sana.
> - **Privasi:** tangkapan layar bisa memuat hal pribadi di layar siswa. Beri tahu siswa dan orang tua
>   sebelum dipakai, minta siswa menutup aplikasi pribadi, dan atur lama simpan di menu Pengaturan
>   (bawaan 30 hari, setelah itu dihapus otomatis). Siswa selalu melihat penanda "Layar direkam" selama ujian.
>   Satu tangkapan halaman ujian berukuran sekitar 50 KB (lebih besar bila layar penuh gambar, hingga ±150 KB);
>   30 siswa x 90 menit dengan interval 1 menit menghasilkan sekitar 130 sampai 400 MB.
> - Perangkat yang sangat lambat mungkin perlu beberapa detik untuk memuat model wajah
>   (±15 MB WebAssembly, di-cache browser setelah pertama kali).

**Petugas** (`/admin`): satu server untuk satu Suku Dinas Pendidikan dengan banyak sekolah.

| Peran | Siapa | Bisa apa |
|---|---|---|
| Admin instansi | Suku Dinas | Semua sekolah: daftar & impor sekolah beserta operatornya, bank soal instansi, ujian bersama (untuk semua atau sebagian sekolah), semua akun, data siswa, monitor, hasil & perbandingan antarsekolah, pengaturan, log. |
| Operator sekolah | 1 per sekolah atau lebih | Hanya sekolahnya: tambah/ubah/impor siswa & cetak kartu login, akun guru, **bank soal & ujian internal sekolah**, monitor ujian (tambah waktu, kirim paksa, reset), token ujian bersama, hasil, log akun sekolahnya. |
| Guru | Sekolah | Hanya melihat hasil & analisis siswa sekolahnya, dan mengunduhnya. |

Pembatasan dilakukan di server (bukan hanya menu yang disembunyikan): operator dan guru tidak
bisa membuka data sekolah lain walau mengubah alamat atau parameter permintaan.
Sekolah yang dinonaktifkan langsung mengeluarkan semua siswa, guru, dan operatornya.

- **Ujian bersama vs ujian sekolah.** Ujian bersama dibuat admin instansi dan memakai bank soal
  instansi; soal ini tidak pernah terlihat oleh sekolah. Ujian sekolah dibuat operator, hanya untuk
  siswa sekolah itu, dan memakai bank soal sekolah itu (ID soal diawali NPSN, mis. `20100001-MTK001`).
- **Username siswa unik per sekolah.** Dua sekolah boleh sama-sama punya `budi123`. Bila ada lebih
  dari satu sekolah, form login siswa menampilkan pilihan sekolah yang diingat di perangkat itu
  (komputer lab cukup memilih sekali). Username petugas tetap unik untuk seluruh instansi.

- Bank soal: dikelompokkan kelas, lalu mata pelajaran, lalu soal. Tipe soal: pilihan ganda, PG kompleks,
  dan **isian singkat/kode**. Pratinjau, unduh, impor tempel dan **impor berkas** (lihat di bawah).
- Jadwal ujian: mapel, kelas, durasi, jumlah soal acak, jadwal buka/tutup, token, acak opsi,
  aturan pengawasan.
- Hasil: detail jawaban & catatan pelanggaran per siswa, analisis butir soal (tingkat kesukaran,
  daya beda, sebaran pengecoh), rekap per sekolah dan per kelas, unduh Excel/CSV.
- Data siswa: impor massal dengan username/kata sandi otomatis, **cetak kartu login**,
  reset kata sandi, aktif/nonaktif.
- Pengaturan instansi (nama, tahun ajaran, KKM, pengumuman, logo), log aktivitas, unduh cadangan JSON.
- **Impor dari versi Google Sheets**: unggah file `.xlsx` lama di menu Pengaturan dan pilih
  sekolahnya (atau isi kolom `NPSN` di lembar DATA_SISWA). Siswa tetap bisa login dengan kata
  sandi lama; hash otomatis diperbarui ke scrypt saat login.

**Mulai pakai untuk banyak sekolah**
1. Admin instansi: menu **Sekolah**, **Impor sekolah & operator**: tempel daftar sekolah dari Excel
   (NPSN, NAMA_SEKOLAH, ALAMAT, dan opsional NAMA/USERNAME/PASSWORD_OPERATOR). Akun operator dibuat
   otomatis (username `op<NPSN>`), lalu cetak kartu loginnya. Impor ulang memperbarui sekolah yang
   sudah ada lewat NPSN.
2. Akun operator atau guru tambahan bisa dibuat satu per satu di menu **Pengguna**.
3. Operator: impor siswa sekolahnya di **Data siswa**, cetak kartu login, buat akun guru.
4. Admin: isi **Bank soal**, buat **Jadwal ujian**, pilih sekolah peserta.
5. Hari ujian: operator membacakan token dari menu **Jadwal ujian** dan memantau di **Monitor ujian**.

Memperbarui dari versi satu sekolah: `prisma migrate deploy` memindahkan semua siswa, guru, dan
hasil lama ke sekolah pertama bernama sesuai pengaturan lama, akun guru tetap guru di sekolah itu,
dan nama instansi bisa diganti di Pengaturan.

### Soal kaya: rumus, gambar, kode, dan bahasa asing

| Kebutuhan | Cara |
|---|---|
| **Rumus matematika** | Dibuat **visual** di editor soal (seperti menulis di kertas): tombol *Rumus*, *a/b*, *√*, *xⁿ* menyisipkan kotak rumus dengan kotak putus-putus yang tinggal diisi; koma desimal ala Indonesia. Bisa di **pertanyaan, pilihan jawaban, dan pembahasan**. Tersimpan sebagai teks `$...$` / `$$...$$` (LaTeX), jadi impor Excel dan tampilan siswa (KaTeX) tidak berubah. Tanda dolar biasa ("harga $5 dan $10") tidak dianggap rumus. Editor (TipTap + MathLive) hanya dimuat di halaman admin. |
| **Papan ketik layar** | Ikon keyboard ada **satu per kotak isian** (pertanyaan, tiap pilihan, pembahasan) dan membuka papan ketik layar. Papan itu tampil seperti keyboard biasa (QWERTY) dengan satu *papan alternatif* yang dipilih lewat pilihan di bagian atasnya: **Formula** atau bahasa asing. Pilihan itu hanya menyiapkan papan; **Ctrl+Shift+T** (atau **Alt+Shift+T**) atau tombol *Ganti papan* mengaktifkannya, dan menekannya lagi mengembalikan papan biasa. Saat aktif, tombol **fisik** menghasilkan karakter yang tertera di papan layar (pemetaan menurut posisi tombol), mis. pada Formula: A → +, S → −, D → ×, F → ÷, G → =, Shift+huruf → huruf Yunani, angka tetap angka. Tombol struktur (√, xⁿ, xₙ, ∑, ∫, pecahan) membuat kotak rumus baru atau mengisi kotak rumus yang sedang aktif. Memilih papan bahasa **sekaligus mengatur bahasa soal** (tidak ada lagi kolom bahasa terpisah). |
| **Bahasa asing (papan ketik)** | Arab, Persia, Ibrani, Yunani, Rusia, Thai, Jerman, Prancis, Spanyol, Italia (pemetaan tombol standar); **Jepang** (kana, tanda ゛゜ menyatu dengan huruf sebelumnya); **Korea** (Hangul dubeolsik, suku kata tersusun otomatis, Backspace melepas satu jamo); **Mandarin** (pinyin: ketik ejaan, pilih huruf Han dengan angka 1-9, spasi = pilihan pertama, Enter = tulis ejaan apa adanya, `-`/`=` pindah halaman). Papan juga melayani kotak jawaban soal isian. **Catatan browser:** Chrome, Edge, dan Firefox umumnya menyimpan Ctrl+Shift+T untuk "buka kembali tab yang ditutup" sehingga tidak sampai ke halaman; di browser itu pakai **Alt+Shift+T** atau tombol *Ganti papan* di papan layar. Ctrl+Shift+T bekerja penuh di aplikasi ujian desktop. Hindi, Urdu, Turki, dan Portugis belum tersedia. Tata letak berasal dari pustaka simple-keyboard-layouts (MIT). |
| **Gambar pada soal dan pilihan** | Tiap pilihan boleh berupa teks, rumus, gambar, atau gabungannya; soal boleh hanya berupa gambar. Gambar ikut teracak bersama pilihannya. |
| **Soal pemrograman** | Blok kode berpagar ` ```python ... ``` ` tampil berwarna (python, javascript, java, c, cpp, csharp, php, sql, html, css, bash, json, pascal). Siswa menjawab lewat pilihan ganda, atau tipe **Isian singkat/kode**: mengetik keluaran program atau potongan kode, dinilai otomatis dari daftar jawaban yang diterima (spasi dinormalkan; huruf besar/kecil dibedakan bila diatur). **Kode siswa tidak dijalankan di server.** |
| **Tampilan bahasa asing** | Bahasa soal menentukan font; arah tulisan kanan-ke-kiri dikenali otomatis per teks, jadi soal Indonesia dengan pilihan Arab tampil benar. Siswa mengetik jawaban isian dengan keyboard bahasa itu di komputernya. |

**Impor berkas** (tombol *Impor berkas* di Bank soal). Unduh **Template ZIP (dengan gambar)**: berisi `soal.xlsx` dengan contoh soal bergambar, folder `gambar/` berisi contoh gambar, dan petunjuk; ganti isinya lalu kompres lagi menjadi ZIP. Tersedia juga template Excel saja.
- `.xlsx` saja: rumus LaTeX di sel; gambar boleh **ditempel di sel Excel** (kolom PERTANYAAN atau OPSI_A..D pada baris soalnya, gambar mengambang biasa, bukan "Place in Cell").
- `.zip`: satu `.xlsx` dan gambar-gambarnya; kolom GAMBAR dan GAMBAR_A..D berisi nama berkas gambar.
- Kolom tambahan: TIPE_SOAL (PG/PGK/ISIAN), BAHASA, PEKA_HURUF, KODE. Jawaban isian dipisah tanda `|` di kolom kunci.
- Baris bermasalah dilewati dan dilaporkan; berkas gambar baris yang gagal tidak tertinggal. Maksimal 40 MB, 500 soal, 5 MB per gambar.
- Belum ada impor langsung dari Word (.docx); rumus dari Word bisa ditempel sebagai gambar di Excel.

**Font.** Latin, Kiril, dan Arab ikut dibundel (Source Sans 3, Noto Naskh Arabic). Mandarin, Jepang, Korea, Hindi, Thai, dan Ibrani memakai font sistem komputer siswa: Windows 10/11 sudah punya; Linux (termasuk aplikasi ujian AppImage/deb) perlu paket fonts-noto-cjk bila belum terpasang.

## Menjalankan untuk pengembangan

Butuh Node.js 22 dan PostgreSQL 16.

```bash
cd web
cp .env.example .env          # sesuaikan DATABASE_URL
npm install                   # juga menyalin berkas MediaPipe & generate Prisma client
npx prisma migrate deploy     # membuat tabel
ADMIN_PASSWORD=RahasiaAdmin1 SEED_EXCEL=../database/Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx SEED_SEKOLAH="SDN Johar Baru 01 Pagi" npm run db:seed
npm run dev                   # API :3000 + Vite :5173 (buka http://localhost:5173)
```

## Deploy ke server

### Dengan Docker (disarankan)

```bash
cd web
cp .env.example .env          # isi DB_PASSWORD, ADMIN_PASSWORD
docker compose up -d --build
docker compose exec -u node app npm run db:seed   # membuat akun admin pertama
```

Aplikasi berjalan di port 3000. Data tersimpan di volume `db` (PostgreSQL) dan
`uploads` (gambar soal, logo, foto bukti pelanggaran).

> **Izin folder unggahan.** Container dimulai sebagai root hanya untuk memperbaiki kepemilikan
> `UPLOAD_DIR` (`/data/uploads`) lalu menjalankan aplikasi sebagai user `node`. Ini mencegah galat
> `EACCES: permission denied, mkdir '/data/uploads/gambar'` pada volume atau bind mount yang dibuat
> root (termasuk volume lama dan platform hosting). Bila tetap gagal, log menampilkan peringatan jelas
> saat server mulai. Jalankan perintah manual dengan `docker compose exec -u node app ...`.

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
  prisma/schema.prisma     tabel: Sekolah, Siswa, Pengguna, Soal, Ujian, SesiUjian, Pelanggaran, Hasil, ...
  prisma/seed.ts           admin pertama + impor Excel lama
  server/
    app.ts                 Express: keamanan (CSP, cookie httpOnly), rute, berkas statis
    lib/mesin.ts           acak soal/opsi, penilaian, penyelesaian sesi
    lib/imporExcel.ts      impor dari versi Google Sheets
    routes/                auth, siswa, admin/*
  src/
    pages/siswa/           Beranda (login), Ujian, Hasil
    pages/admin/           Dashboard, Monitor, Soal, Ujian, Hasil, Sekolah, Siswa, Pengguna, Pengaturan, Log
    hooks/usePengawasan.ts layar penuh, anti salin, pindah tab, deteksi wajah
    components/ui/         komponen shadcn/ui
  tests/api.test.ts        tes API terhadap PostgreSQL sungguhan
```

## Keamanan & privasi

- Kata sandi: scrypt (akun baru) / SHA-256 berulang (akun impor, diperbarui saat login).
- Sesi login disimpan di database, browser hanya memegang cookie `httpOnly`.
- Kunci jawaban tidak pernah dikirim ke browser selama ujian.
- Gambar soal hanya bisa dibuka pengguna yang login; foto pelanggaran & tangkapan layar hanya
  oleh petugas dari sekolah siswa itu (dan admin instansi).
- Content-Security-Policy hanya mengizinkan sumber dari server sendiri. Ini juga memblokir
  telemetri bawaan MediaPipe ke Google, jadi tidak ada data dari perangkat siswa yang keluar.
- 5 kali salah kata sandi mengunci login 5 menit. Hitungan disimpan di database (tabel
  `GagalLogin`), jadi tetap berlaku bila server dijalankan beberapa instance di belakang load
  balancer. Untuk beberapa instance, folder `UPLOAD_DIR` juga harus dibagi bersama (mis. NFS).

## Tes

```bash
createdb simulasi_tka_test     # sekali saja
npm test                       # 69 skenario: login, ujian, pelanggaran, admin, sekolah & peran, ekspor, impor soal (rumus, gambar, ZIP, template), konversi editor, papan ketik (tata letak, Hangul, kana, pinyin), izin folder unggahan
```
