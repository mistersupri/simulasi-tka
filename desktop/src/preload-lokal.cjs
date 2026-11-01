// Jembatan untuk jendela kata sandi pengawas (halaman/keluar.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pengawas', {
  izinKeluar: (username, sandi) => ipcRenderer.invoke('tka:izin-keluar', username, sandi),
  batal: () => ipcRenderer.send('tka:batal-keluar'),
});
