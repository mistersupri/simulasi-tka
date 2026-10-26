// Tiruan layanan Google Apps Script untuk menguji file .gs di Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const DIR_GS = path.join(__dirname, '..', 'apps-script');

function tampil(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function buatSheet(nama, baris) {
  const sheet = {
    data: baris.map((r) => r.slice()),
    getName: () => nama,
    setName(n) { nama = n; return sheet; },
    getLastRow() {
      for (let i = sheet.data.length - 1; i >= 0; i--) {
        if ((sheet.data[i] || []).some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
      }
      return 0;
    },
    getLastColumn() { return Math.max(0, ...sheet.data.map((r) => r.length)); },
    getMaxRows() { return Math.max(sheet.data.length, 1); },
    getMaxColumns() { return Math.max(sheet.getLastColumn(), 1); },
    insertRowsAfter() {},
    insertColumnsAfter() {},
    deleteRows(awal, jumlah) { sheet.data.splice(awal - 1, jumlah); },
    setFrozenRows() {},
    autoResizeColumns() {},
    appendRow(row) { sheet.data.push(row.slice()); },
    getRange(r, c, nr = 1, nc = 1) {
      const sel = (i, j) => (sheet.data[r - 1 + i] || [])[c - 1 + j];
      const peta = (fn) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fn(i, j)));
      const range = {
        getValues: () => peta((i, j) => sel(i, j) ?? ''),
        getDisplayValues: () => peta((i, j) => tampil(sel(i, j))),
        getNumberFormats: () => peta(() => ''),
        setValues(vals) {
          vals.forEach((row, i) => row.forEach((v, j) => {
            while (sheet.data.length < r + i) sheet.data.push([]);
            sheet.data[r - 1 + i][c - 1 + j] = v;
          }));
          return range;
        },
        setNumberFormats: () => range,
        setNumberFormat: () => range,
        setFontWeight: () => range,
        setBackground: () => range
      };
      return range;
    }
  };
  return sheet;
}

function buatSpreadsheet(nama, sheets) {
  const ss = {
    sheets,
    getId: () => 'ss-' + nama,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/ss-' + nama,
    getName: () => nama,
    getSheets: () => Object.values(sheets),
    getSheetByName: (n) => sheets[n] || null,
    insertSheet(n) { sheets[n] = buatSheet(n, []); return sheets[n]; }
  };
  return ss;
}

function buatDrive() {
  const files = {};
  const folders = {};
  let n = 0;
  function folder(nama) {
    const id = 'folder' + (++n);
    const f = {
      getId: () => id, getUrl: () => 'https://drive.google.com/drive/folders/' + id, isTrashed: () => false,
      createFolder: (x) => folder(x),
      createFile(blob) {
        const fid = 'file' + (++n);
        files[fid] = {
          blob, trashed: false, induk: [id],
          getId: () => fid, getUrl: () => 'https://drive.google.com/file/d/' + fid,
          setSharing() {}, setTrashed(t) { files[fid].trashed = t; },
          getParents() { let i = 0; const ids = files[fid].induk; return { hasNext: () => i < ids.length, next: () => folders[ids[i++]] }; },
          getBlob: () => blob, moveTo(fd) { files[fid].induk = [fd.getId()]; }, makeCopy: (nm, fd) => f.createFile({ nama: nm })
        };
        return files[fid];
      }
    };
    folders[id] = f;
    return f;
  }
  return {
    files, folders,
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    createFolder: folder,
    getFolderById(id) { if (!folders[id]) throw new Error('tidak ada'); return folders[id]; },
    getFileById(id) {
      if (files[id]) return files[id];
      // file spreadsheet (untuk backup/ekspor)
      const root = folder('root');
      const f = root.createFile({ nama: id });
      files[id] = f;
      return f;
    }
  };
}

function muatKode(database) {
  const sheets = Object.fromEntries(Object.entries(database).map(([n, b]) => [n, buatSheet(n, b)]));
  const ss = buatSpreadsheet('Database Uji', sheets);
  const dibuat = [];
  const cache = new Map();
  const log = [];
  const pemicu = [];
  const drive = buatDrive();

  const konteks = {
    console: { error: () => {}, log: () => {}, warn: () => {} },
    SpreadsheetApp: {
      openById: () => ss,
      getActiveSpreadsheet: () => ss,
      flush() {},
      create(nama) { const s = buatSpreadsheet(nama, { Sheet1: buatSheet('Sheet1', []) }); dibuat.push(s); return s; }
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k)
      })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log: (m) => log.push(String(m)) },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    DriveApp: drive,
    ScriptApp: {
      getProjectTriggers: () => pemicu.slice(),
      deleteTrigger: (t) => pemicu.splice(pemicu.indexOf(t), 1),
      newTrigger: (fn) => {
        const b = { timeBased: () => b, everyDays: () => b, atHour: () => b,
          create: () => { const t = { getHandlerFunction: () => fn }; pemicu.push(t); return t; } };
        return b;
      },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/uji/exec' })
    },
    HtmlService: {},
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, teks) =>
        Array.from(crypto.createHash(alg).update(teks, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      base64Encode: (b) => Buffer.from(b.map((x) => (x + 256) % 256)).toString('base64'),
      newBlob: (bytes, mime, nama) => ({ getBytes: () => bytes, getContentType: () => mime, nama }),
      formatDate: (d) => d.toISOString()
    }
  };
  vm.createContext(konteks);
  fs.readdirSync(DIR_GS).filter((f) => f.endsWith('.gs')).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(DIR_GS, f), 'utf8'), konteks, { filename: f });
  });
  return { gs: konteks, sheets, ss, log, drive, cache, dibuat, pemicu };
}

// Data persis seperti file Excel database lama (nilai yang tampil di layar).
function databaseContoh() {
  return {
    DATA_SISWA: [
      ['NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'PASSWORD_HASH', 'STATUS', 'PASSWORD_SALT'],
      ['UJI001', 'Siswa Uji', 6, 'uji_tka', '1af353d6b15ae733cfde7a15eaff5454df696d2a1b3b5503dced1fdb657edbc2', 'AKTIF', 'bd36ec40-6df4-4580-8310-fdd6edf6cc72']
    ],
    BANK_SOAL: [
      ['ID_SOAL', 'MATA_PELAJARAN', 'KELAS', 'PERTANYAAN', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'KUNCI_JAWABAN', 'SKOR'],
      ['MTK001', 'Matematika', 6, 'Sebuah toko memiliki 125 pensil. Toko menerima tambahan 75 pensil. Jika seluruh pensil dibagikan sama banyak kepada 10 kelas, berapa pensil yang diterima setiap kelas?', 15, 20, 25, 30, 'B', 1],
      ['MTK002', 'Matematika', 6, 'Hasil dari 3/4 + 1/2 adalah ....', '4/6', '1/4', '5/4', '3/8', 'C', 1],
      ['MTK003', 'Matematika', 6, 'Sebuah persegi memiliki panjang sisi 12 cm. Berapa keliling persegi tersebut?', '24 cm', '36 cm', '48 cm', '144 cm', 'C', 1]
    ],
    HASIL_UJIAN: [
      ['ID_HASIL', 'NISN', 'NAMA_SISWA', 'TANGGAL_UJIAN', 'NILAI', 'JUMLAH_BENAR', 'JUMLAH_SALAH', 'DURASI_DETIK', 'STATUS_UJIAN']
    ]
  };
}

/** Database lama + setupAplikasi() + login admin. */
function siapkan() {
  const env = muatKode(databaseContoh());
  const laporan = env.gs.setupAplikasi();
  const baris = laporan.find((l) => l.includes('AKUN ADMIN'));
  env.passwordAdmin = baris.match(/password: (\S+)/)[1];
  env.tokenAdmin = env.gs.loginAdmin('admin', env.passwordAdmin).token;
  return env;
}

module.exports = { muatKode, databaseContoh, siapkan };
