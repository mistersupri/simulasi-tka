/**
 * Lapisan database: membaca dan menulis lembar spreadsheet sebagai tabel.
 *
 * Setiap baris dibaca menjadi objek { NAMA_HEADER: nilai, _baris: nomor }.
 * - Kolom teks dibaca dengan getDisplayValues() (persis seperti di layar).
 * - Kolom tanggal dibaca sebagai milidetik epoch (atau null).
 * - Kolom angka dibaca sebagai Number (atau '').
 * Kolom dicari berdasarkan nama header, jadi urutan kolom bebas.
 */

let MEMO_TABEL_ = {};
let KEDALAMAN_KUNCI_ = 0;
let SPREADSHEET_ = null;

function resetMemo_() {
  MEMO_TABEL_ = {};
}

function bukaSpreadsheet_() {
  if (!SPREADSHEET_) {
    SPREADSHEET_ = KONFIGURASI.SPREADSHEET_ID
      ? SpreadsheetApp.openById(KONFIGURASI.SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  }
  return SPREADSHEET_;
}

function ambilSheet_(nama) {
  const sheet = bukaSpreadsheet_().getSheetByName(nama);
  if (!sheet) {
    throw new Error('Lembar ' + nama + ' belum ada. Jalankan fungsi setupAplikasi() dari editor Apps Script.');
  }
  return sheet;
}

function bacaHeader_(sheet) {
  const jumlahKolom = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, jumlahKolom).getDisplayValues()[0].map(function(h) {
    return teks_(h).toUpperCase();
  });
}

function jenisKolom_(nama, kolom) {
  const skema = SKEMA[nama] || {};
  if ((skema.tanggal || []).indexOf(kolom) !== -1) return 'tanggal';
  if ((skema.angka || []).indexOf(kolom) !== -1) return 'angka';
  return 'teks';
}

function adalahTanggal_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function nilaiSel_(jenis, mentah, tampil) {
  if (jenis === 'tanggal') {
    if (adalahTanggal_(mentah)) return mentah.getTime();
    if (typeof mentah === 'number' && mentah > 1e11) return mentah;
    const t = Date.parse(teks_(tampil));
    return isNaN(t) ? null : t;
  }
  if (jenis === 'angka') {
    if (typeof mentah === 'number') return mentah;
    return teks_(tampil) === '' ? '' : angka_(tampil, '');
  }
  return teks_(tampil);
}

/** Semua baris tabel (salinan, aman diubah). Hasil disimpan selama satu eksekusi. */
function bacaSemua_(nama) {
  if (!MEMO_TABEL_[nama]) {
    const sheet = ambilSheet_(nama);
    const header = bacaHeader_(sheet);
    const jumlah = sheet.getLastRow() - 1;
    const baris = [];

    if (jumlah > 0) {
      const range = sheet.getRange(2, 1, jumlah, header.length);
      const mentah = range.getValues();
      const tampil = range.getDisplayValues();
      const jenis = header.map(function(h) { return jenisKolom_(nama, h); });

      for (let i = 0; i < jumlah; i++) {
        if (tampil[i].every(function(v) { return teks_(v) === ''; })) continue;
        const obj = { _baris: i + 2 };
        for (let j = 0; j < header.length; j++) {
          if (header[j]) obj[header[j]] = nilaiSel_(jenis[j], mentah[i][j], tampil[i][j]);
        }
        baris.push(obj);
      }
    }
    MEMO_TABEL_[nama] = { header: header, baris: baris };
  }
  return MEMO_TABEL_[nama].baris.map(function(b) { return Object.assign({}, b); });
}

function cariSatu_(nama, kolom, nilai) {
  const target = teks_(nilai).toLowerCase();
  return bacaSemua_(nama).filter(function(b) {
    return teks_(b[kolom]).toLowerCase() === target;
  })[0] || null;
}

/** Menjalankan fn dengan LockService agar penulisan tidak bertabrakan. */
function denganKunci_(fn) {
  if (KEDALAMAN_KUNCI_ > 0) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  KEDALAMAN_KUNCI_++;
  try {
    return fn();
  } finally {
    KEDALAMAN_KUNCI_--;
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function susunBaris_(nama, header, data, lama) {
  const nilai = [];
  const format = [];
  header.forEach(function(h) {
    let v = Object.prototype.hasOwnProperty.call(data, h) ? data[h] : (lama ? lama[h] : '');
    const jenis = jenisKolom_(nama, h);

    if (jenis === 'tanggal') {
      v = (v === '' || v === null || v === undefined) ? '' : (adalahTanggal_(v) ? v : new Date(Number(v)));
      format.push('dd/mm/yyyy hh:mm:ss');
    } else if (jenis === 'angka') {
      v = (v === '' || v === null || v === undefined || isNaN(Number(v))) ? '' : Number(v);
      format.push('0');
    } else {
      v = (v === null || v === undefined) ? '' : String(v);
      format.push('@');
    }
    nilai.push(v);
  });
  return { nilai: nilai, format: format };
}

/** Menambah satu atau banyak baris. */
function tambah_(nama, data) {
  const daftar = Array.isArray(data) ? data : [data];
  if (!daftar.length) return 0;

  return denganKunci_(function() {
    const sheet = ambilSheet_(nama);
    const header = bacaHeader_(sheet);
    const awal = sheet.getLastRow() + 1;
    const akhir = awal + daftar.length - 1;
    if (akhir > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), akhir - sheet.getMaxRows());
    }

    const susun = daftar.map(function(d) { return susunBaris_(nama, header, d, null); });
    const range = sheet.getRange(awal, 1, daftar.length, header.length);
    range.setNumberFormats(susun.map(function(s) { return s.format; }));
    range.setValues(susun.map(function(s) { return s.nilai; }));
    delete MEMO_TABEL_[nama];
    return daftar.length;
  });
}

/** Mengubah baris pertama yang kolom kuncinya = nilai. Mengembalikan baris baru atau null. */
function ubah_(nama, kolomKunci, nilaiKunci, perubahan) {
  return denganKunci_(function() {
    delete MEMO_TABEL_[nama];
    const lama = cariSatu_(nama, kolomKunci, nilaiKunci);
    if (!lama) return null;

    const sheet = ambilSheet_(nama);
    const header = bacaHeader_(sheet);
    const susun = susunBaris_(nama, header, perubahan, lama);
    const range = sheet.getRange(lama._baris, 1, 1, header.length);
    range.setNumberFormats([susun.format]);
    range.setValues([susun.nilai]);
    delete MEMO_TABEL_[nama];
    return Object.assign(lama, perubahan);
  });
}

/** Menghapus semua baris yang kolom kuncinya ada di daftarNilai. */
function hapus_(nama, kolomKunci, daftarNilai) {
  const target = {};
  (daftarNilai || []).forEach(function(v) { target[teks_(v).toLowerCase()] = true; });

  return denganKunci_(function() {
    delete MEMO_TABEL_[nama];
    const nomor = bacaSemua_(nama)
      .filter(function(b) { return target[teks_(b[kolomKunci]).toLowerCase()]; })
      .map(function(b) { return b._baris; })
      .sort(function(a, b) { return b - a; });

    const sheet = ambilSheet_(nama);
    // Hapus per kelompok baris berurutan, dari bawah ke atas.
    let i = 0;
    while (i < nomor.length) {
      let j = i;
      while (j + 1 < nomor.length && nomor[j + 1] === nomor[j] - 1) j++;
      sheet.deleteRows(nomor[j], j - i + 1);
      i = j + 1;
    }
    delete MEMO_TABEL_[nama];
    return nomor.length;
  });
}

// -------------------------------------------------------------------
// Pengaturan (lembar PENGATURAN berisi pasangan KUNCI | NILAI)
// -------------------------------------------------------------------

function ambilPengaturan_() {
  const hasil = Object.assign({}, PENGATURAN_BAWAAN);
  bacaSemua_('PENGATURAN').forEach(function(b) {
    if (b.KUNCI) hasil[b.KUNCI.toUpperCase()] = b.NILAI;
  });
  return hasil;
}

function simpanPengaturan_(data) {
  denganKunci_(function() {
    const ada = {};
    bacaSemua_('PENGATURAN').forEach(function(b) { ada[b.KUNCI.toUpperCase()] = true; });
    const baru = [];
    Object.keys(data).forEach(function(k) {
      if (ada[k]) ubah_('PENGATURAN', 'KUNCI', k, { NILAI: data[k] });
      else baru.push({ KUNCI: k, NILAI: data[k] });
    });
    tambah_('PENGATURAN', baru);
  });
}
