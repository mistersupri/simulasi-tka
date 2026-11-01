# Aplikasi ujian Windows (Electron)

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

### Cara 1: GitHub Actions (tanpa menyiapkan komputer)
1. Di repositori GitHub: **Settings > Secrets and variables > Actions**, tambahkan
   `TKA_KUNCI_APLIKASI` (sama dengan `KUNCI_APLIKASI` server) dan `TKA_SANDI_DARURAT` (opsional).
2. Tab **Actions > Installer Windows > Run workflow**, isi alamat server, misalnya `http://192.168.1.10:3000`.
3. Setelah selesai, unduh `installer-ujian-tka` dari halaman hasil workflow.

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
Di Linux juga bisa, dengan Wine 32 & 64-bit terpasang.

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

## Batasan yang perlu diketahui
- **Ctrl+Alt+Del tidak bisa diblokir** oleh aplikasi apa pun di Windows. Alt+Tab dan tombol Windows
  tidak bisa dimatikan, hanya dibalas dengan merebut fokus kembali dan mencatat pelanggaran.
  Untuk penguncian penuh, gunakan fitur Windows **Assigned Access (kiosk)** untuk akun siswa.
- **Kunci aplikasi tertanam di installer.** Siswa yang sangat paham teknis bisa mengekstraknya.
  Fitur "wajib aplikasi" mempersulit, bukan mustahil.
- Bila server tanpa HTTPS, lalu lintas jaringan bisa disadap di LAN. Gunakan HTTPS bila memungkinkan.
- Bila komputer tidak punya GPU yang didukung, deteksi wajah memakai WebGL perangkat lunak (lebih berat).
  Bila tetap gagal, indikator kamera menampilkan "Deteksi wajah gagal dimuat".
- Hanya Windows 10/11 64-bit.

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
