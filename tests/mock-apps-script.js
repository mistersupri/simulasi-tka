// Tiruan minimal layanan Google Apps Script untuk menguji Kode.gs di Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function buatSheet(nama, baris) {
  return {
    data: baris,
    getName: () => nama,
    getLastRow() { return this.data.length; },
    getLastColumn() { return this.data[0].length; },
    getMaxRows() { return this.data.length; },
    getRange(r, c, nr = 1, nc = 1) {
      const sheet = this;
      return {
        getDisplayValues: () => Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => {
            const v = (sheet.data[r - 1 + i] || [])[c - 1 + j];
            return v === undefined || v === null ? '' : String(v);
          })),
        getValues: () => Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => (sheet.data[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValue: (v) => { sheet.data[r - 1][c - 1] = v; },
        setValues: (vals) => vals.forEach((row, i) => row.forEach((v, j) => { sheet.data[r - 1 + i][c - 1 + j] = v; })),
        setNumberFormat: () => {}
      };
    },
    appendRow(row) { this.data.push(row.slice()); }
  };
}

function muatKode(database) {
  const sheets = Object.fromEntries(Object.entries(database).map(([n, b]) => [n, buatSheet(n, b)]));
  const cache = new Map();
  const log = [];
  const ss = {
    getName: () => 'Database Uji',
    getSheets: () => Object.values(sheets),
    getSheetByName: (n) => sheets[n] || null
  };
  const konteks = {
    console: { error: () => {}, log: () => {} },
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k)
      })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log: (m) => log.push(String(m)) },
    HtmlService: {},
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, teks) =>
        Array.from(crypto.createHash(alg).update(teks, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b))
    }
  };
  vm.createContext(konteks);
  const kode = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Kode.gs'), 'utf8');
  vm.runInContext(kode, konteks);
  return { gs: konteks, sheets, log };
}

// Data persis seperti file Excel database (nilai yang tampil di layar).
function databaseContoh() {
  return {
    DATA_SISWA: [
      ['NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'PASSWORD_HASH', 'STATUS', 'PASSWORD_SALT'],
      ['UJI001', 'Siswa Uji', '6', 'uji_tka', '1af353d6b15ae733cfde7a15eaff5454df696d2a1b3b5503dced1fdb657edbc2', 'AKTIF', 'bd36ec40-6df4-4580-8310-fdd6edf6cc72'],
      ['', '', '', '', '', '', '']
    ],
    BANK_SOAL: [
      ['ID_SOAL', 'MATA_PELAJARAN', 'KELAS', 'PERTANYAAN', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'KUNCI_JAWABAN', 'SKOR'],
      ['MTK001', 'Matematika', '6', 'Sebuah toko memiliki 125 pensil. Toko menerima tambahan 75 pensil. Jika seluruh pensil dibagikan sama banyak kepada 10 kelas, berapa pensil yang diterima setiap kelas?', '15', '20', '25', '30', 'B', '1'],
      ['MTK002', 'Matematika', '6', 'Hasil dari 3/4 + 1/2 adalah ....', '4/6', '1/4', '5/4', '3/8', 'C', '1'],
      ['MTK003', 'Matematika', '6', 'Sebuah persegi memiliki panjang sisi 12 cm. Berapa keliling persegi tersebut?', '24 cm', '36 cm', '48 cm', '144 cm', 'C', '1'],
      ['', '', '', '', '', '', '', '', '', '']
    ],
    HASIL_UJIAN: [
      ['ID_HASIL', 'NISN', 'NAMA_SISWA', 'TANGGAL_UJIAN', 'NILAI', 'JUMLAH_BENAR', 'JUMLAH_SALAH', 'DURASI_DETIK', 'STATUS_UJIAN']
    ]
  };
}

module.exports = { muatKode, databaseContoh };
