/**
 * Aplikasi ujian Simulasi TKA untuk komputer lab Windows.
 *
 * Jendela kiosk yang hanya membuka server sekolah (alamat tertanam di konfigurasi.json).
 * Halaman web tidak pernah mendapat akses Node.js: contextIsolation + sandbox, dan
 * preload hanya menjembatani "tutup aplikasi" serta status jeda pengawasan.
 *
 * Yang dilakukan aplikasi ini (di luar kemampuan browser biasa):
 *  - kiosk: layar penuh, tanpa bilah alamat/menu, selalu di atas, tidak bisa ditutup
 *    saat ujian tanpa akun pengawas
 *  - setContentProtection: PrintScreen/Snipping Tool/perekam layar hanya mendapat layar hitam
 *  - fokus direbut kembali bila siswa menekan Alt+Tab/tombol Windows
 *  - menolak bila ada monitor kedua
 *  - kamera diizinkan otomatis hanya untuk server sekolah, juga tanpa HTTPS
 *  - menandatangani setiap permintaan (header X-TKA-Aplikasi) untuk ujian "wajib aplikasi"
 *
 * Batasan: Ctrl+Alt+Del tidak bisa diblokir oleh aplikasi apa pun di Windows.
 */
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, desktopCapturer, ipcMain, screen, session, systemPreferences } = require('electron');

const konfigurasi = require('../konfigurasi.json');

// Pembaruan otomatis (electron-updater) dari server sekolah. Tidak tersedia di build lama/pengembangan.
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}
const SERVER = new URL(konfigurasi.server).origin;
const DEBUG = !app.isPackaged && process.env.TKA_DEBUG === '1';

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

// Kamera (getUserMedia) hanya jalan di "secure context". Server LAN sekolah sering tanpa
// HTTPS, jadi alamat server sekolah saja yang dianggap aman.
if (SERVER.startsWith('http://')) {
  app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', SERVER);
}

// Deteksi wajah (MediaPipe) butuh WebGL. PC lab dengan GPU/driver lama yang tidak didukung
// Chromium tidak lagi otomatis mendapat WebGL perangkat lunak; aktifkan cadangan SwiftShader.
// Aman di sini karena aplikasi hanya memuat server sekolah.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// Kamera di Windows dibaca lewat kamera-native.exe (Windows.Media.Capture, API yang sama dengan aplikasi
// Camera bawaan Windows; ikut installer sebagai extraResources). Jalur kamera Chromium di sebagian laptop
// tidak mengirim gambar walau lampu webcam menyala. Bila exe tidak ada, kamera memakai jalur Chromium biasa.
const BERKAS_KAMERA_NATIVE = path.join(process.resourcesPath, 'kamera-native', 'kamera-native.exe');
const kameraNativeAda = () => process.platform === 'win32' && fs.existsSync(BERKAS_KAMERA_NATIVE);
const modeKamera = kameraNativeAda() ? 'native' : 'standar';

let jendela = null;
/** Jendela utama baru masuk mode kiosk setelah layar persiapan selesai. */
let kioskAktif = false;
/** Percobaan: matikan proteksi tangkapan layar agar video kamera bisa tampil (lihat desktop/README.md). */
const TANPA_PROTEKSI = process.env.TKA_TANPA_PROTEKSI === '1';
let jendelaKeluar = null;
let bolehTutup = false;
let urlTerakhir = `${SERVER}/`;

const halamanLokal = (nama) => path.join(__dirname, 'halaman', nama);
const milikServer = (url) => {
  try {
    return new URL(url).origin === SERVER;
  } catch {
    return false;
  }
};
const sedangUjian = () => {
  try {
    return new URL(urlTerakhir).pathname.startsWith('/ujian/');
  } catch {
    return false;
  }
};

/** Header berganti tiap menit: HMAC-SHA256(kunci, "simulasi-tka:<menit>"). Sama dengan server/lib/aplikasi.ts. */
function tandaAplikasi() {
  const menit = Math.floor(Date.now() / 60000);
  return `${menit}.${crypto.createHmac('sha256', konfigurasi.kunciAplikasi).update(`simulasi-tka:${menit}`).digest('hex')}`;
}

function aturSesi() {
  const ses = session.defaultSession;
  ses.setUserAgent(`${ses.getUserAgent()} SimulasiTKA/${app.getVersion()}`);

  if (konfigurasi.kunciAplikasi) {
    ses.webRequest.onBeforeSendHeaders({ urls: [`${SERVER}/*`] }, (detail, lanjut) => {
      lanjut({ requestHeaders: { ...detail.requestHeaders, 'X-TKA-Aplikasi': tandaAplikasi() } });
    });
  }

  // Hanya kamera (tanpa mikrofon) dan hanya untuk server sekolah.
  // Asal diambil dari beberapa sumber: Electron kadang mengirim asal kosong atau berbeda bentuk
  // (mis. saat memeriksa izin), sehingga kamera ikut tertolak walau halamannya milik server sekolah.
  const asalSah = (wc, ...kandidat) => [...kandidat, wc && !wc.isDestroyed() ? wc.getURL() : ''].some((a) => a && milikServer(a));
  ses.setPermissionRequestHandler((wc, izin, jawab, detail) => {
    const sah = asalSah(wc, detail.requestingUrl, detail.securityOrigin);
    let diizinkan = false;
    if (izin === 'media') {
      const jenis = detail.mediaTypes || [];
      diizinkan = sah && jenis.length > 0 && jenis.every((t) => t === 'video');
    } else {
      diizinkan = izin === 'fullscreen' && sah;
    }
    if (izin === 'media') console.log(`[izin] media ${JSON.stringify(detail.mediaTypes)} dari ${detail.requestingUrl} -> ${diizinkan ? 'diizinkan' : 'ditolak'}`);
    jawab(diizinkan);
  });
  ses.setPermissionCheckHandler((wc, izin, asal, detail) =>
    (izin === 'media' || izin === 'fullscreen') && asalSah(wc, asal, detail?.requestingUrl, detail?.securityOrigin));
}

function bukaServer(url = urlTerakhir) {
  jendela.loadURL(milikServer(url) ? url : `${SERVER}/`);
}

function cekMonitor() {
  if (!jendela) return;
  const banyak = screen.getAllDisplays().length > 1;
  const diHalamanMonitor = jendela.webContents.getURL().endsWith('monitor-ganda.html');
  if (banyak && !diHalamanMonitor) jendela.loadFile(halamanLokal('monitor-ganda.html'));
  else if (!banyak && diHalamanMonitor) bukaServer();
}

/** Tombol yang tidak boleh sampai ke halaman: alat pengembang, cetak, tutup, zoom, muat ulang paksa. */
function tombolTerlarang(input) {
  const k = input.key.toLowerCase();
  const ctrl = input.control || input.meta;
  if (['f11', 'f12', 'browserback', 'browserforward'].includes(k)) return true;
  if (input.alt && ['f4', 'arrowleft', 'arrowright', 'home'].includes(k)) return true;
  if (ctrl && input.shift && ['i', 'j', 'c', 'r'].includes(k)) return true;
  return ctrl && ['p', 'w', 'q', 'n', 't', 'o', 's', 'u', '+', '=', '-', '0'].includes(k);
}

/** Pengawasan di halaman dijeda selama jendela kata sandi terbuka, agar tidak tercatat sebagai pindah tab. */
function kirimJeda(aktif) {
  if (jendela && !jendela.isDestroyed()) jendela.webContents.send('tka:jeda', aktif);
}

function mintaKeluar() {
  if (!sedangUjian()) {
    bolehTutup = true;
    app.exit(0);
    return;
  }
  if (jendelaKeluar) {
    jendelaKeluar.focus();
    return;
  }
  kirimJeda(true);
  setTimeout(() => {
    jendelaKeluar = new BrowserWindow({
      parent: jendela,
      modal: true,
      width: 420,
      height: 540,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      alwaysOnTop: true,
      backgroundColor: '#F3F5F8',
      webPreferences: { preload: path.join(__dirname, 'preload-lokal.cjs'), contextIsolation: true, sandbox: true, devTools: DEBUG },
    });
    jendelaKeluar.setAlwaysOnTop(true, 'screen-saver', 1);
    jendelaKeluar.setContentProtection(true);
    jendelaKeluar.loadFile(halamanLokal('keluar.html'));
    jendelaKeluar.on('closed', () => {
      jendelaKeluar = null;
      // Beri waktu fokus kembali ke jendela ujian sebelum pengawasan aktif lagi.
      setTimeout(() => kirimJeda(false), 800);
      if (jendela && !jendela.isDestroyed()) jendela.focus();
    });
  }, 150);
}

function cocokSandiDarurat(sandi) {
  const bagian = (konfigurasi.sandiDarurat || '').split('$');
  if (bagian[0] !== 'scrypt' || bagian.length !== 4) return false;
  const hash = crypto.scryptSync(String(sandi), Buffer.from(bagian[2], 'base64'), 32, { N: Number(bagian[1]) });
  const simpan = Buffer.from(bagian[3], 'base64');
  return hash.length === simpan.length && crypto.timingSafeEqual(hash, simpan);
}

ipcMain.on('tka:minta-keluar', (e) => {
  if (e.sender === jendela?.webContents) mintaKeluar();
});

ipcMain.handle('tka:izin-keluar', async (e, username, sandi) => {
  if (e.sender !== jendelaKeluar?.webContents) return { ok: false, pesan: 'Permintaan tidak sah.' };
  try {
    const res = await fetch(`${SERVER}/api/aplikasi/izin-keluar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(konfigurasi.kunciAplikasi ? { 'X-TKA-Aplikasi': tandaAplikasi() } : {}) },
      body: JSON.stringify({ username, password: sandi }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, pesan: data.pesan || 'Akun pengawas salah.' };
  } catch {
    // Server tidak bisa dihubungi: pakai kata sandi darurat dari installer bila ada.
    if (!konfigurasi.sandiDarurat) return { ok: false, pesan: 'Server tidak bisa dihubungi dan installer ini tidak punya kata sandi darurat.' };
    if (!cocokSandiDarurat(sandi)) return { ok: false, pesan: 'Server tidak bisa dihubungi. Kata sandi darurat salah.' };
  }
  bolehTutup = true;
  setTimeout(() => app.exit(0), 50);
  return { ok: true };
});

ipcMain.on('tka:batal-keluar', (e) => {
  if (e.sender === jendelaKeluar?.webContents) jendelaKeluar.close();
});

/**
 * Tangkapan seluruh layar untuk fitur "rekam layar" ujian.
 * Jendela ujian memakai setContentProtection, yang membuatnya TIDAK ikut terekam.
 * Agar pengawas melihat isi layar sebenarnya (ujian + jendela lain di atasnya),
 * perlindungan dimatikan sesaat selama pengambilan lalu dinyalakan kembali.
 */
let sedangMenangkap = false;
ipcMain.handle('tka:tangkap-layar', async (e) => {
  if (e.sender !== jendela?.webContents || sedangMenangkap) return null;
  sedangMenangkap = true;
  const lindungi = (aktif) => {
    if (jendela && !jendela.isDestroyed()) jendela.setContentProtection(aktif && !TANPA_PROTEKSI);
    if (jendelaKeluar && !jendelaKeluar.isDestroyed()) jendelaKeluar.setContentProtection(aktif);
  };
  try {
    const layar = screen.getPrimaryDisplay();
    const lebar = Math.min(1280, layar.size.width);
    const tinggi = Math.round((layar.size.height * lebar) / layar.size.width);
    lindungi(false);
    await new Promise((r) => setTimeout(r, 150));
    const sumber = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: lebar, height: tinggi } });
    const utama = sumber.find((s) => s.display_id === String(layar.id)) ?? sumber[0];
    if (!utama || utama.thumbnail.isEmpty()) return null;
    return new Uint8Array(utama.thumbnail.toJPEG(60));
  } catch (err) {
    console.error('Tangkapan layar gagal', err);
    return null;
  } finally {
    lindungi(true);
    sedangMenangkap = false;
  }
});

/**
 * Status izin kamera di sistem operasi (Windows: Pengaturan > Privasi & keamanan > Kamera). Dipakai halaman ujian
 * untuk menjelaskan bahwa Windows, bukan aplikasi, yang memblokir kamera.
 */
ipcMain.handle('tka:status-kamera', (e) => {
  if (e.sender !== jendela?.webContents) return null;
  try {
    return systemPreferences.getMediaAccessStatus('camera');
  } catch {
    return null;
  }
});

/** Layar persiapan selesai: jendela utama pindah ke mode kiosk (layar penuh, selalu di atas). */
function masukKiosk() {
  if (!jendela || jendela.isDestroyed() || kioskAktif || DEBUG) return;
  kioskAktif = true;
  jendela.setAlwaysOnTop(true, 'screen-saver');
  jendela.setKiosk(true);
}
ipcMain.on('tka:masuk-kiosk', (e) => {
  if (e.sender === jendela?.webContents) masukKiosk();
});

// ---------------------------------------------------------------------------
// Pembaruan otomatis: installer terbaru disajikan server sekolah di /api/aplikasi/pembaruan
// (latest.yml + Ujian-TKA-Setup-<versi>.exe). Dipicu dari layar persiapan bila versi aplikasi berbeda
// dengan server; tidak pernah saat mode kiosk/ujian.
// ---------------------------------------------------------------------------
let pembaruanSiap = false;
function pembaru() {
  if (!autoUpdater || !app.isPackaged || process.platform !== 'win32') return null;
  if (!pembaruanSiap) {
    pembaruanSiap = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    // Versi aplikasi harus sama dengan server, termasuk bila server justru lebih lama.
    autoUpdater.allowDowngrade = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: `${SERVER}/api/aplikasi/pembaruan` });
    autoUpdater.on('download-progress', (p) => {
      if (jendela && !jendela.isDestroyed()) jendela.webContents.send('tka:pembaruan-progres', Math.round(p.percent ?? 0));
    });
  }
  // Tanda aplikasi berganti tiap menit: perbarui sebelum setiap permintaan.
  autoUpdater.requestHeaders = konfigurasi.kunciAplikasi ? { 'X-TKA-Aplikasi': tandaAplikasi() } : null;
  return autoUpdater;
}
const bolehPerbarui = (e) => e.sender === jendela?.webContents && !kioskAktif && !sedangUjian();

ipcMain.handle('tka:pembaruan-cek', async (e) => {
  if (!bolehPerbarui(e)) return { didukung: false };
  const u = pembaru();
  if (!u) return { didukung: false };
  try {
    const r = await u.checkForUpdates();
    const versi = r?.updateInfo?.version ?? null;
    return { didukung: true, versi, ada: !!versi && versi !== app.getVersion() };
  } catch (err) {
    return { didukung: true, galat: String(err?.message ?? err).slice(0, 300) };
  }
});

ipcMain.handle('tka:pembaruan-unduh', async (e) => {
  if (!bolehPerbarui(e)) return { ok: false, galat: 'Pembaruan hanya bisa di layar persiapan.' };
  const u = pembaru();
  if (!u) return { ok: false, galat: 'Pembaruan otomatis tidak tersedia di aplikasi ini.' };
  try {
    await u.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, galat: String(err?.message ?? err).slice(0, 300) };
  }
});

ipcMain.handle('tka:pembaruan-pasang', (e) => {
  if (!bolehPerbarui(e) || !autoUpdater) return false;
  bolehTutup = true;
  hentikanKameraNative();
  // Pasang diam-diam lalu jalankan lagi aplikasinya.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
});

ipcMain.handle('tka:mode-kamera', (e) => {
  if (e.sender !== jendela?.webContents) return null;
  return { mode: modeKamera, daftar: [modeKamera] };
});

// ---------------------------------------------------------------------------
// Kamera native: proses kamera-native.exe mengirim JPEG lewat stdout ([panjang int32 LE][JPEG]),
// diteruskan ke halaman. Satu proses saja; token membedakan sesi agar sisa event sesi lama tidak terbaca.
// ---------------------------------------------------------------------------
let prosesKamera = null;
function hentikanKameraNative() {
  if (!prosesKamera) return;
  try { prosesKamera.anak.kill(); } catch { /* sudah berhenti */ }
  prosesKamera = null;
}

ipcMain.handle('tka:kamera-native-daftar', (e) => {
  if (e.sender !== jendela?.webContents || !kameraNativeAda()) return [];
  return new Promise((selesai) => {
    execFile(BERKAS_KAMERA_NATIVE, ['--daftar'], { timeout: 20000, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) {
        console.error('Daftar kamera native gagal', err);
        return selesai([]);
      }
      try {
        const d = JSON.parse(stdout);
        selesai(Array.isArray(d) ? d.filter((x) => typeof x?.id === 'string').map((x) => ({ id: x.id, nama: String(x.nama ?? 'kamera') })) : []);
      } catch {
        selesai([]);
      }
    });
  });
});

ipcMain.handle('tka:kamera-native-mulai', (e, id, token) => {
  if (e.sender !== jendela?.webContents || !kameraNativeAda() || typeof id !== 'string' || typeof token !== 'string') return false;
  hentikanKameraNative();
  const anak = spawn(BERKAS_KAMERA_NATIVE, ['--kamera', id, '--lebar', '640', '--fps', '8'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const proses = { anak, token };
  prosesKamera = proses;
  const kirim = (kanal, data) => {
    if (jendela && !jendela.isDestroyed()) jendela.webContents.send(kanal, token, data);
  };
  let sisa = Buffer.alloc(0);
  anak.stdout.on('data', (potongan) => {
    sisa = sisa.length ? Buffer.concat([sisa, potongan]) : potongan;
    while (sisa.length >= 4) {
      const panjang = sisa.readInt32LE(0);
      if (panjang <= 0 || panjang > 20 * 1024 * 1024) {
        anak.kill();
        return;
      }
      if (sisa.length < 4 + panjang) break;
      kirim('tka:kamera-native-bingkai', new Uint8Array(sisa.subarray(4, 4 + panjang)));
      sisa = sisa.subarray(4 + panjang);
    }
  });
  let galatTerakhir = '';
  anak.stderr.setEncoding('utf8');
  anak.stderr.on('data', (teks) => {
    for (const baris of teks.split(/\r?\n/)) if (baris.startsWith('GALAT:')) galatTerakhir = baris.slice(6);
  });
  let sudahSelesai = false;
  const selesai = (kode) => {
    if (sudahSelesai) return;
    sudahSelesai = true;
    if (prosesKamera === proses) prosesKamera = null;
    const [nama, ...pesan] = (galatTerakhir || `NotReadableError:Kamera native berhenti (kode ${kode})`).split(':');
    kirim('tka:kamera-native-berhenti', { nama, pesan: pesan.join(':') });
  };
  anak.on('error', (err) => {
    galatTerakhir = `NotReadableError:${err.message}`;
    selesai(-1);
  });
  anak.on('exit', selesai);
  return true;
});

ipcMain.handle('tka:kamera-native-henti', (e, token) => {
  if (e.sender !== jendela?.webContents) return;
  if (prosesKamera && (!token || prosesKamera.token === token)) hentikanKameraNative();
});
app.on('will-quit', hentikanKameraNative);

ipcMain.on('tka:coba-lagi', (e) => {
  if (e.sender === jendela?.webContents) bukaServer();
});

function buatJendela() {
  jendela = new BrowserWindow({
    kiosk: false,
    fullscreen: false,
    width: 1280,
    height: 800,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#F3F5F8',
    title: 'Ujian TKA',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: DEBUG,
      spellcheck: false,
      additionalArguments: [`--tka-versi=${app.getVersion()}`],
    },
  });
  jendela.setContentProtection(!TANPA_PROTEKSI);
  jendela.once('ready-to-show', () => jendela.show());

  const wc = jendela.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    if (!milikServer(url) && !url.startsWith('file://')) e.preventDefault();
  });
  wc.on('will-redirect', (e, url) => {
    if (!milikServer(url)) e.preventDefault();
  });
  wc.on('did-navigate', (_e, url) => {
    if (milikServer(url)) urlTerakhir = url;
  });
  wc.on('did-navigate-in-page', (_e, url) => {
    if (milikServer(url)) urlTerakhir = url;
  });
  wc.on('did-fail-load', (_e, kode, deskripsi, url, utama) => {
    // -3 = dibatalkan (navigasi lain), bukan galat jaringan.
    if (!utama || kode === -3 || !milikServer(url)) return;
    jendela.loadFile(halamanLokal('galat.html'), { query: { pesan: deskripsi } });
  });
  wc.on('render-process-gone', () => setTimeout(() => bukaServer(), 1000));
  // Halaman ujian memasang beforeunload (untuk browser biasa). Di aplikasi, semua perpindahan
  // halaman sudah dikendalikan di sini, jadi jangan biarkan itu memblokir halaman galat/monitor.
  wc.on('will-prevent-unload', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase();
    // Ctrl+Shift+Q: pintasan pengawas untuk keluar.
    if ((input.control || input.meta) && input.shift && k === 'q') {
      e.preventDefault();
      mintaKeluar();
      return;
    }
    if (tombolTerlarang(input)) e.preventDefault();
  });

  jendela.on('close', (e) => {
    if (bolehTutup) return;
    e.preventDefault();
    mintaKeluar();
  });
  // Alt+Tab / tombol Windows: rebut fokus kembali. Halaman sendiri mencatatnya sebagai pindah tab.
  jendela.on('blur', () => {
    if (DEBUG || !kioskAktif || jendelaKeluar || bolehTutup) return;
    setTimeout(() => {
      if (!jendela || jendela.isDestroyed() || jendelaKeluar) return;
      jendela.show();
      jendela.moveTop();
      jendela.focus();
    }, 150);
  });
  jendela.on('minimize', () => {
    if (kioskAktif) jendela.restore();
  });

  bukaServer(`${SERVER}/`);
  cekMonitor();
}

app.on('second-instance', () => {
  if (jendela) {
    jendela.show();
    jendela.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Komputer lab dipakai bergantian: login siswa sebelumnya tidak boleh terbawa.
  // Hanya cookie yang dihapus; cadangan jawaban di localStorage tetap ada.
  await session.defaultSession.clearStorageData({ storages: ['cookies'] });
  aturSesi();
  buatJendela();
  screen.on('display-added', cekMonitor);
  screen.on('display-removed', cekMonitor);
});

app.on('window-all-closed', () => app.quit());

// Jangan izinkan webview atau jendela tambahan dari halaman mana pun.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
});
