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
  /** Jalur kamera yang dipakai: "native" (Windows, kamera-native.exe) atau "standar" (Chromium). */
  modeKamera: () => ipcRenderer.invoke('tka:mode-kamera'),
  /** Kamera native Windows: proses terpisah yang mengirim JPEG (mode kamera "native"). */
  kameraNative: {
    daftar: () => ipcRenderer.invoke('tka:kamera-native-daftar'),
    mulai: (id, token) => ipcRenderer.invoke('tka:kamera-native-mulai', id, token),
    henti: (token) => ipcRenderer.invoke('tka:kamera-native-henti', token),
    padaBingkai: (cb) => {
      const h = (_e, token, data) => cb(token, data);
      ipcRenderer.on('tka:kamera-native-bingkai', h);
      return () => ipcRenderer.removeListener('tka:kamera-native-bingkai', h);
    },
    padaBerhenti: (cb) => {
      const h = (_e, token, info) => cb(token, info);
      ipcRenderer.on('tka:kamera-native-berhenti', h);
      return () => ipcRenderer.removeListener('tka:kamera-native-berhenti', h);
    },
  },
  /** Pembaruan otomatis dari server sekolah (hanya di layar persiapan). */
  pembaruan: {
    cek: () => ipcRenderer.invoke('tka:pembaruan-cek'),
    unduh: () => ipcRenderer.invoke('tka:pembaruan-unduh'),
    pasang: () => ipcRenderer.invoke('tka:pembaruan-pasang'),
    padaProgres: (cb) => {
      const h = (_e, persen) => cb(persen);
      ipcRenderer.on('tka:pembaruan-progres', h);
      return () => ipcRenderer.removeListener('tka:pembaruan-progres', h);
    },
  },
  /** Muat ulang server (dipakai halaman galat koneksi). */
  cobaLagi: () => ipcRenderer.send('tka:coba-lagi'),
  /** Tangkapan seluruh layar (JPEG) untuk ujian yang merekam layar. */
  tangkapLayar: () => ipcRenderer.invoke('tka:tangkap-layar'),
  /** Status izin kamera di sistem operasi ("granted", "denied", ...). */
  statusKamera: () => ipcRenderer.invoke('tka:status-kamera'),
});
