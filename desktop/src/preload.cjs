// Jembatan untuk halaman di jendela utama (server sekolah dan halaman lokal galat/monitor).
// Hanya tiga hal yang dibuka; tidak ada akses Node.js ke halaman.
const { contextBridge, ipcRenderer } = require('electron');

let jeda = false;
ipcRenderer.on('tka:jeda', (_e, aktif) => {
  jeda = !!aktif;
});

contextBridge.exposeInMainWorld('aplikasiTka', {
  versi: (process.argv.find((a) => a.startsWith('--tka-versi=')) ?? '').split('=')[1] ?? '',
  /** Tutup aplikasi; saat ujian berjalan aplikasi meminta akun pengawas. */
  keluar: () => ipcRenderer.send('tka:minta-keluar'),
  /** true selama jendela kata sandi pengawas terbuka: pengawasan halaman tidak mencatat. */
  jeda: () => jeda,
  /** Layar persiapan selesai: pindah ke mode kiosk (layar penuh). */
  masukKiosk: () => ipcRenderer.send('tka:masuk-kiosk'),
  /** Mode penangkapan kamera saat ini dan daftar pilihannya (Windows). */
  modeKamera: () => ipcRenderer.invoke('tka:mode-kamera'),
  /** Simpan mode kamera lalu mulai ulang aplikasi. Hanya bisa di layar persiapan. */
  gantiModeKamera: (mode) => ipcRenderer.invoke('tka:ganti-mode-kamera', mode),
  /** Muat ulang server (dipakai halaman galat koneksi). */
  cobaLagi: () => ipcRenderer.send('tka:coba-lagi'),
  /** Tangkapan seluruh layar (JPEG) untuk ujian yang merekam layar. */
  tangkapLayar: () => ipcRenderer.invoke('tka:tangkap-layar'),
  /** Status izin kamera di sistem operasi ("granted", "denied", ...). */
  statusKamera: () => ipcRenderer.invoke('tka:status-kamera'),
});
