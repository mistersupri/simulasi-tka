# Aplikasi ujian desktop: Windows & Linux (Electron)

Aplikasi "browser ujian" untuk komputer lab. Isinya halaman siswa dari server
Simulasi TKA (folder `web/`) di jendela terkunci. **Alamat server tertanam di installer**,
jadi siswa tidak bisa membuka situs lain. Halaman guru/admin tetap dibuka lewat browser biasa.

## Yang dilakukan aplikasi ini

| Fitur | Keterangan |
|---|---|
| Mode kiosk | Layar penuh, tanpa bilah alamat/menu/taskbar, selalu di atas. Tombol minimize, Alt+F4, dan tombol tutup tidak berlaku saat ujian. |
| Tangkapan layar diblokir | Jendela ujian tidak ikut terekam oleh PrintScreen, Snipping Tool, atau perekam layar (Windows 10 versi 2004 ke atas; versi lebih lama menghasilkan kotak hitam). |
| Alt+Tab / tombol Windows | Aplikasi langsung merebut fokus kembali, dan halaman mencatatnya sebagai pelanggaran "pindah tab". |
| Pintasan diblokir | F11, F12, Ctrl+Shift+I/J/C, Ctrl+P/W/Q/N/T/O/S/U, zoom, serta navigasi Alt+panah. |
| Hanya server sekolah | Tautan ke situs lain, jendela baru, dan webview ditolak. |
| Kamera tanpa HTTPS | Alamat server sekolah dianggap aman, jadi deteksi wajah jalan di LAN tanpa sertifikat. Izin kamera diberikan otomatis, hanya untuk server sekolah. |
| Monitor kedua | Bila ada lebih dari satu layar atau proyektor, ujian ditutup sampai layar tambahan dilepas. |
| Rekam layar | Untuk ujian yang merekam layar, aplikasi mengambil tangkapan seluruh layar langsung (tanpa dialog berbagi layar). Perlindungan tangkapan layar dimatikan sesaat (±150 ms) selama pengambilan agar isi ujian dan jendela lain di atasnya ikut terekam. |
| Wajib aplikasi | Ujian yang diberi tanda "Wajib lewat aplikasi ujian Windows" tidak bisa dikerjakan dari browser biasa atau HP. |
| Ganti siswa | Login siswa sebelumnya dihapus setiap aplikasi dibuka. |
| Tanpa koneksi | Halaman "tidak bisa terhubung" dengan tombol coba lagi; sambung ulang otomatis tiap 15 detik. |

## Menutup aplikasi
- **Di luar ujian** (halaman login/beranda): tombol **Tutup aplikasi**.
- **Saat ujian berjalan**: tekan **Ctrl+Shift+Q** atau tombol tutup. Jendela "Izin pengawas" meminta
  **username & kata sandi akun guru/admin**. Jawaban siswa tetap tersimpan dan bisa dilanjutkan.
  Selama jendela ini terbuka, pengawasan halaman dijeda sehingga tidak tercatat sebagai pelanggaran.
- **Server mati saat ujian**: jendela yang sama menerima **kata sandi darurat** dari installer (bila diisi).

## Membuat installer

Installer harus dibuat ulang setiap kali alamat server berubah.

### Cara 1: rilis otomatis dengan GitHub Actions
Workflow `.github/workflows/rilis.yml` menjalankan tes server, lalu membangun **paket server + image Docker**,
**Windows (.exe)**, dan **Linux (.AppImage, .deb)**
lalu membuat **GitHub Release** berisi ketiga berkas beserta `SHA256SUMS.txt`.

1. Sekali saja, di **Settings > Secrets and variables > Actions**:
   - `TKA_SERVER_URL` (sebagai Variable atau Secret), misalnya `http://192.168.1.10:3000`;
   - tab *Secrets* (opsional): `TKA_KUNCI_APLIKASI` (sama dengan `KUNCI_APLIKASI` server) dan `TKA_SANDI_DARURAT`.
2. Jalankan salah satu:
   - dorong tag: `git tag v1.0.1 && git push origin v1.0.1`;
   - atau **Actions > Rilis > Run workflow**, isi versi (dan alamat server bila berbeda).
3. Setelah sekitar 10 menit, buka halaman **Releases**.

> **Rilis dibuat sebagai draft**, hanya terlihat oleh pemilik dan kolaborator repositori. Repositori ini
> publik: rilis yang diterbitkan bisa diunduh siapa saja, dan alamat server, kunci aplikasi, serta hash
> kata sandi darurat bisa diekstrak dari installer. Centang **publik** hanya bila itu tidak masalah,
> atau pindahkan repositori menjadi privat.

Workflow ini hanya bisa dijalankan manual dari branch utama (aturan GitHub untuk `workflow_dispatch`);
dorongan tag bisa dari commit mana pun.

### Cara 2: di komputer Windows
Butuh Node.js 22.
```powershell
cd desktop
npm ci
$env:TKA_SERVER_URL="http://192.168.1.10:3000"
$env:TKA_KUNCI_APLIKASI="isi-sama-dengan-KUNCI_APLIKASI-server"   # opsional
$env:TKA_SANDI_DARURAT="kata-sandi-darurat"                         # opsional
npm run build:win
```
Hasilnya ada di `dist\Ujian-TKA-Setup-1.0.0.exe` (sekitar 120 MB).
Installer Windows juga bisa dibuat di Linux, dengan Wine 32 & 64-bit terpasang.

### Cara 3: di komputer Linux
```bash
cd desktop && npm ci
TKA_SERVER_URL=http://192.168.1.10:3000 npm run build:linux
```
Hasilnya `dist/Ujian-TKA-1.0.0-x86_64.AppImage` (±125 MB) dan `dist/Ujian-TKA-1.0.0-amd64.deb` (±100 MB).

### Menyiapkan server
Isi `KUNCI_APLIKASI` (minimal 16 karakter acak) di `.env` server, lalu jalankan ulang server.
Setelah itu opsi **Wajib lewat aplikasi ujian Windows** di form jadwal ujian bisa dinyalakan.
Buat kunci acak misalnya dengan `openssl rand -hex 24`.

## Memasang di komputer lab
1. Jalankan `Ujian-TKA-Setup-1.0.0.exe` sebagai administrator. Aplikasi dipasang untuk semua pengguna,
   dengan pintasan **Ujian TKA** di desktop dan menu Start.
2. Installer belum ditandatangani (*code signing*), jadi Windows SmartScreen menampilkan
   "Windows protected your PC". Klik **More info > Run anyway**. Ini hanya perlu sekali per komputer.
3. **Samakan jam komputer** dengan server (Pengaturan > Waktu > Sinkronkan sekarang). Tanda aplikasi
   menerima selisih jam maksimal 10 menit.
4. Disarankan: gunakan akun Windows khusus siswa yang bukan administrator.

## Kamera tidak menyala di Windows

**Percobaan layar hitam (v1.5.1+):** bila gambar kamera tetap hitam walau lampu webcam menyala, coba jalankan aplikasi dengan `TKA_TANPA_PROTEKSI=1`. Perlindungan tangkapan layar jendela dimatikan untuk tes ini; kalau gambar muncul, kabari pengembang. Contoh: `setx TKA_TANPA_PROTEKSI 1`, lalu tutup dan buka lagi aplikasi. Hapus dengan `reg delete HKCU\Environment /v TKA_TANPA_PROTEKSI /f`.


Gejala: ujian berkamera mencatat pelanggaran **"Kamera tidak aktif"** atau layar kunci "Kamera harus menyala".
Penyebab terbanyak bukan aplikasi, melainkan Windows atau perangkatnya. Kode galat asli kini tampil di layar kunci
dan di catatan pelanggaran (menu Hasil > Detail), dan ujian berkamera **tidak dimulai** bila kamera gagal dites dulu.

| Kode galat | Artinya | Perbaikan |
|---|---|---|
| `NotAllowedError` (aplikasi menampilkan "Windows memblokir akses kamera") | Windows menolak kamera untuk aplikasi desktop | **Pengaturan > Privasi & keamanan > Kamera**: nyalakan *Akses kamera*, *Izinkan aplikasi mengakses kamera Anda*, dan **Izinkan aplikasi desktop mengakses kamera**. Di komputer yang dikelola kebijakan (Group Policy `LetAppsAccessCamera`) minta administrator IT mengizinkan. |
| `NotFoundError` | Tidak ada kamera yang terdeteksi | Periksa kabel USB webcam atau Device Manager (Cameras / Imaging devices). |
| `NotReadableError` | Kamera dipakai aplikasi lain atau driver bermasalah | Tutup Zoom, Teams, aplikasi Kamera, atau tab browser yang memakai kamera; pasang ulang driver bila perlu. |
| `AbortError: Timeout starting video source`, atau tes kamera **Bingkai diterima: 0** | Jalur penangkapan kamera Chromium tidak mengirim gambar di perangkat itu | Di layar persiapan, bagian Kamera, pilih **Mode kamera aplikasi: Native Windows (seperti aplikasi Camera)**, lalu Terapkan & mulai ulang. Mode ini membaca kamera lewat program kecil `kamera-native.exe` (Windows.Media.Capture, API yang sama dengan aplikasi Camera) yang ikut installer. Mode lain (Standar, DirectShow, Media Foundation tanpa akselerasi, Tanpa akselerasi GPU) tetap tersedia. Pilihan tersimpan per komputer. |

Lakukan sekali per komputer lab **sebelum hari ujian** (pengaturan Windows tidak bisa dibuka dari jendela ujian yang terkunci).
Baris "status Windows" di kode galat hanya muncul pada aplikasi versi terbaru; pengecekan kamera sebelum ujian dan kode
galatnya bekerja dengan aplikasi versi lama setelah server diperbarui.

## Batasan yang perlu diketahui
- **Ctrl+Alt+Del tidak bisa diblokir** oleh aplikasi apa pun di Windows. Alt+Tab dan tombol Windows
  tidak bisa dimatikan, hanya dibalas dengan merebut fokus kembali dan mencatat pelanggaran.
  Untuk penguncian penuh, gunakan fitur Windows **Assigned Access (kiosk)** untuk akun siswa.
- **Kunci aplikasi tertanam di installer.** Siswa yang sangat paham teknis bisa mengekstraknya.
  Fitur "wajib aplikasi" mempersulit, bukan mustahil.
- Bila server tanpa HTTPS, lalu lintas jaringan bisa disadap di LAN. Gunakan HTTPS bila memungkinkan.
- Bila komputer tidak punya GPU yang didukung, deteksi wajah memakai WebGL perangkat lunak (lebih berat).
  Bila tetap gagal, indikator kamera menampilkan "Deteksi wajah gagal dimuat".
- Windows 10/11 64-bit dan Linux 64-bit (x86_64).
- **Di Linux, perlindungan tangkapan layar tidak ada** (fitur ini hanya ada di Windows dan macOS), dan
  rekam layar di sesi Wayland bisa gagal; gunakan sesi X11 (Xorg). Mode kiosk bergantung pada
  pengelola jendela, dan pintasan sistem (mis. tombol Super) bisa tetap aktif. Versi Linux baru diuji di Xvfb,
  belum di desktop Ubuntu sungguhan.

## Status pengujian
Diuji di Linux (Electron 45 di bawah Xvfb):
- mode kiosk;
- isolasi halaman (tidak ada `require`/`process`);
- pemblokiran navigasi, `window.open`, dan pintasan (F12 & Ctrl+P tidak sampai ke halaman);
- ujian wajib aplikasi: diterima di aplikasi, ditolak 403 di browser;
- kamera dan deteksi wajah;
- jendela izin pengawas: salah, batal, dan benar;
- tidak ada pelanggaran palsu saat jendela izin terbuka;
- halaman tanpa koneksi dan kata sandi darurat.

Installer Windows dibuat dan isinya diperiksa (`Ujian TKA.exe`, `app.asar` dengan konfigurasi, uninstaller).
**Belum diuji di Windows sungguhan**: pemasangan, kiosk, perlindungan tangkapan layar, dan
pengambilalihan fokus khas Windows perlu dicoba di satu komputer lab sebelum dipakai massal.

## Mencoba di komputer pengembang
```bash
cd desktop && npm ci
TKA_SERVER_URL=http://localhost:3000 TKA_DEBUG=1 npm start   # mode debug: berjendela, alat pengembang aktif
```
