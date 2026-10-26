/**
 * Simulasi TKA SDN Johar Baru 01 Pagi — server (Google Apps Script).
 *
 * Database: Google Spreadsheet dengan tiga lembar:
 *   DATA_SISWA  : NISN | NAMA_SISWA | KELAS | USERNAME | PASSWORD_HASH | STATUS | PASSWORD_SALT
 *   BANK_SOAL   : ID_SOAL | MATA_PELAJARAN | KELAS | PERTANYAAN | OPSI_A | OPSI_B | OPSI_C | OPSI_D | KUNCI_JAWABAN | SKOR
 *   HASIL_UJIAN : ID_HASIL | NISN | NAMA_SISWA | TANGGAL_UJIAN | NILAI | JUMLAH_BENAR | JUMLAH_SALAH | DURASI_DETIK | STATUS_UJIAN
 *                 (kolom tambahan opsional: MATA_PELAJARAN, KELAS)
 *
 * Kolom dibaca berdasarkan NAMA HEADER (baris pertama), bukan posisi,
 * sehingga urutan kolom boleh berubah asalkan nama header tetap sama.
 */

// ===================================================================
// KONFIGURASI
// ===================================================================

const KONFIGURASI = {
  // ID Google Spreadsheet database. Kosongkan ('') jika script ini
  // dibuat dari menu Ekstensi > Apps Script di spreadsheet itu sendiri.
  SPREADSHEET_ID: '18tugdIyOXBAnOmYoHaT0WxSsYW4BW54Phg5i0w0GmS8',

  NAMA_SEKOLAH: 'SDN Johar Baru 01 Pagi',
  TAHUN_AJARAN: '2026/2027',

  SHEET_SISWA: 'DATA_SISWA',
  SHEET_SOAL: 'BANK_SOAL',
  SHEET_HASIL: 'HASIL_UJIAN',

  // Jangan diubah setelah ada akun: hash lama tidak akan cocok lagi.
  ITERASI_HASH: 10000,

  // Lama sesi login (maksimum CacheService: 6 jam).
  DURASI_SESI_DETIK: 6 * 60 * 60,

  // Acak urutan soal setiap kali ujian dimulai.
  ACAK_SOAL: true
};

const KOLOM_SISWA = ['NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'PASSWORD_HASH', 'STATUS', 'PASSWORD_SALT'];
const KOLOM_SOAL = ['ID_SOAL', 'MATA_PELAJARAN', 'KELAS', 'PERTANYAAN', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'KUNCI_JAWABAN', 'SKOR'];
const KOLOM_HASIL = ['ID_HASIL', 'NISN', 'NAMA_SISWA', 'TANGGAL_UJIAN', 'NILAI', 'JUMLAH_BENAR', 'JUMLAH_SALAH', 'DURASI_DETIK', 'STATUS_UJIAN'];
const KOLOM_OPSI = ['OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D'];
const HURUF_OPSI = ['A', 'B', 'C', 'D'];

// ===================================================================
// WEB APP
// ===================================================================

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Simulasi TKA ' + KONFIGURASI.NAMA_SEKOLAH)
    // Tag viewport di dalam file HTML diabaikan oleh Apps Script,
    // jadi harus ditambahkan di sini agar tampilan pas di HP.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===================================================================
// FUNGSI YANG DIPANGGIL DARI HALAMAN (google.script.run)
// Semua mengembalikan objek { berhasil, pesan, ... } dan tidak
// pernah melempar error ke browser.
// ===================================================================

function infoAplikasi() {
  return {
    berhasil: true,
    namaSekolah: KONFIGURASI.NAMA_SEKOLAH,
    tahunAjaran: KONFIGURASI.TAHUN_AJARAN
  };
}

function loginSiswa(username, password) {
  return jalankanAman_(function() {
    username = teks_(username);
    password = String(password || '');

    if (!username || !password) {
      return gagal_('Username dan kata sandi wajib diisi.');
    }

    const siswa = cariSiswa_(username);
    const hashCocok = siswa &&
      siswa.salt &&
      buatHashPassword_(password, siswa.salt) === siswa.passwordHash;

    if (!hashCocok) {
      return gagal_('Username atau kata sandi salah.');
    }
    if (siswa.status !== 'AKTIF') {
      return gagal_('Akun belum aktif. Silakan hubungi admin sekolah.');
    }

    const daftarMapel = daftarMapelUntukKelas_(siswa.kelas);
    const token = buatSesi_({
      nisn: siswa.nisn,
      namaSiswa: siswa.namaSiswa,
      kelas: siswa.kelas,
      username: siswa.username
    });

    return {
      berhasil: true,
      pesan: 'Login berhasil.',
      token: token,
      namaSiswa: siswa.namaSiswa,
      kelas: siswa.kelas,
      daftarMapel: daftarMapel
    };
  });
}

function mulaiUjian(token, mataPelajaran) {
  return jalankanAman_(function() {
    const sesi = ambilSesi_(token);
    if (!sesi) return gagalSesi_();

    const daftarSoal = ambilSoal_(sesi.kelas, mataPelajaran);
    if (daftarSoal.length === 0) {
      return gagal_('Belum ada soal ' + teks_(mataPelajaran) + ' untuk kelas ' + sesi.kelas + '.');
    }

    const soalTampil = (KONFIGURASI.ACAK_SOAL ? acakUrutan_(daftarSoal) : daftarSoal)
      .map(function(soal) {
        // Kunci jawaban dan skor TIDAK dikirim ke browser.
        return {
          id: soal.id,
          pertanyaan: soal.pertanyaan,
          opsi: soal.opsi
        };
      });

    sesi.ujian = {
      mataPelajaran: daftarSoal[0].mataPelajaran,
      idSoal: soalTampil.map(function(s) { return s.id; }),
      waktuMulai: Date.now()
    };
    simpanSesi_(token, sesi);

    return {
      berhasil: true,
      pesan: 'Soal berhasil disiapkan.',
      mataPelajaran: sesi.ujian.mataPelajaran,
      soal: soalTampil
    };
  });
}

function simpanHasilUjian(token, daftarJawaban) {
  return jalankanAman_(function() {
    const sesi = ambilSesi_(token);
    if (!sesi) return gagalSesi_();
    if (!sesi.ujian) return gagal_('Ujian belum dimulai.');

    // Pastikan akun masih aktif saat hasil disimpan.
    const siswa = cariSiswa_(sesi.username);
    if (!siswa || siswa.status !== 'AKTIF') {
      return gagal_('Akun siswa tidak ditemukan atau tidak aktif.');
    }

    const hasil = hitungNilai_(sesi.ujian.idSoal, daftarJawaban);
    if (hasil.jumlahSoal === 0) {
      return gagal_('Tidak ada soal yang dapat dinilai.');
    }

    const durasiDetik = Math.max(0, Math.floor((Date.now() - sesi.ujian.waktuMulai) / 1000));

    tambahBaris_(KONFIGURASI.SHEET_HASIL, {
      ID_HASIL: Utilities.getUuid(),
      NISN: siswa.nisn,
      NAMA_SISWA: siswa.namaSiswa,
      KELAS: siswa.kelas,
      MATA_PELAJARAN: sesi.ujian.mataPelajaran,
      TANGGAL_UJIAN: new Date(),
      NILAI: hasil.nilai,
      JUMLAH_BENAR: hasil.jumlahBenar,
      JUMLAH_SALAH: hasil.jumlahSalah,
      DURASI_DETIK: durasiDetik,
      STATUS_UJIAN: 'SELESAI'
    });

    // Satu ujian hanya bisa dikirim sekali.
    delete sesi.ujian;
    simpanSesi_(token, sesi);

    return {
      berhasil: true,
      pesan: 'Hasil ujian berhasil disimpan.',
      nilai: hasil.nilai,
      jumlahBenar: hasil.jumlahBenar,
      jumlahSalah: hasil.jumlahSalah,
      jumlahKosong: hasil.jumlahKosong,
      jumlahSoal: hasil.jumlahSoal,
      durasiDetik: durasiDetik
    };
  });
}

function keluar(token) {
  if (token) CacheService.getScriptCache().remove(kunciSesi_(token));
  return { berhasil: true };
}

// ===================================================================
// LOGIKA INTI
// ===================================================================

function cariSiswa_(username) {
  const target = teks_(username).toLowerCase();
  const baris = bacaTabel_(KONFIGURASI.SHEET_SISWA, KOLOM_SISWA).baris;

  for (let i = 0; i < baris.length; i++) {
    if (baris[i].USERNAME.toLowerCase() === target) {
      return {
        nisn: baris[i].NISN,
        namaSiswa: baris[i].NAMA_SISWA,
        kelas: normalisasiKelas_(baris[i].KELAS),
        username: baris[i].USERNAME,
        passwordHash: baris[i].PASSWORD_HASH.toLowerCase(),
        salt: baris[i].PASSWORD_SALT,
        status: baris[i].STATUS.toUpperCase()
      };
    }
  }
  return null;
}

function semuaSoal_() {
  return bacaTabel_(KONFIGURASI.SHEET_SOAL, KOLOM_SOAL).baris
    .filter(function(b) { return b.ID_SOAL && b.PERTANYAAN; })
    .map(function(b) {
      return {
        id: b.ID_SOAL,
        mataPelajaran: b.MATA_PELAJARAN,
        kelas: normalisasiKelas_(b.KELAS),
        pertanyaan: b.PERTANYAAN,
        opsi: KOLOM_OPSI.map(function(k) { return b[k]; }),
        kunci: b.KUNCI_JAWABAN.toUpperCase(),
        skor: angka_(b.SKOR, 1)
      };
    });
}

function ambilSoal_(kelas, mataPelajaran) {
  const k = normalisasiKelas_(kelas);
  const m = teks_(mataPelajaran).toLowerCase();
  return semuaSoal_().filter(function(s) {
    return s.kelas === k && s.mataPelajaran.toLowerCase() === m;
  });
}

function daftarMapelUntukKelas_(kelas) {
  const k = normalisasiKelas_(kelas);
  const unik = {};
  semuaSoal_().forEach(function(s) {
    if (s.kelas === k && s.mataPelajaran) {
      unik[s.mataPelajaran.toLowerCase()] = unik[s.mataPelajaran.toLowerCase()] || s.mataPelajaran;
    }
  });
  return Object.keys(unik).sort().map(function(key) { return unik[key]; });
}

function hitungNilai_(daftarIdSoal, daftarJawaban) {
  const jawaban = daftarJawaban || {};
  const peta = {};
  semuaSoal_().forEach(function(s) { peta[s.id] = s; });

  const hasil = { jumlahSoal: 0, jumlahBenar: 0, jumlahSalah: 0, jumlahKosong: 0, nilai: 0 };
  let skorDiperoleh = 0;
  let skorMaksimal = 0;

  daftarIdSoal.forEach(function(id) {
    const soal = peta[id];
    if (!soal || HURUF_OPSI.indexOf(soal.kunci) === -1) return;

    const pilihan = teks_(jawaban[id]).toUpperCase();
    hasil.jumlahSoal++;
    skorMaksimal += soal.skor;

    if (pilihan === soal.kunci) {
      hasil.jumlahBenar++;
      skorDiperoleh += soal.skor;
    } else {
      // Soal yang tidak dijawab dihitung salah (seperti versi sebelumnya).
      hasil.jumlahSalah++;
      if (!pilihan) hasil.jumlahKosong++;
    }
  });

  hasil.nilai = skorMaksimal > 0 ? Math.round((skorDiperoleh / skorMaksimal) * 100) : 0;
  return hasil;
}

function acakUrutan_(daftar) {
  const salinan = daftar.slice();
  for (let i = salinan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const sementara = salinan[i];
    salinan[i] = salinan[j];
    salinan[j] = sementara;
  }
  return salinan;
}

function buatHashPassword_(password, salt) {
  let hasil = password + ':' + salt;
  for (let i = 0; i < KONFIGURASI.ITERASI_HASH; i++) {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      hasil,
      Utilities.Charset.UTF_8
    );
    hasil = bytes.map(function(b) {
      return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
    }).join('');
  }
  return hasil;
}

// ===================================================================
// SESI LOGIN (disimpan di CacheService, bukan di browser)
// ===================================================================

function kunciSesi_(token) {
  return 'sesi_' + token;
}

function buatSesi_(data) {
  const token = Utilities.getUuid();
  simpanSesi_(token, data);
  return token;
}

function simpanSesi_(token, data) {
  CacheService.getScriptCache().put(
    kunciSesi_(token),
    JSON.stringify(data),
    KONFIGURASI.DURASI_SESI_DETIK
  );
}

function ambilSesi_(token) {
  if (!token) return null;
  const isi = CacheService.getScriptCache().get(kunciSesi_(String(token)));
  return isi ? JSON.parse(isi) : null;
}

function gagalSesi_() {
  return { berhasil: false, sesiBerakhir: true, pesan: 'Sesi login berakhir. Silakan masuk kembali.' };
}

// ===================================================================
// AKSES SPREADSHEET
// ===================================================================

function bukaSpreadsheet_() {
  return KONFIGURASI.SPREADSHEET_ID
    ? SpreadsheetApp.openById(KONFIGURASI.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function ambilSheet_(nama) {
  const sheet = bukaSpreadsheet_().getSheetByName(nama);
  if (!sheet) throw new Error('Lembar ' + nama + ' tidak ditemukan di database.');
  return sheet;
}

function bacaHeader_(sheet) {
  const jumlahKolom = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, jumlahKolom).getDisplayValues()[0].map(function(h) {
    return teks_(h).toUpperCase();
  });
}

/**
 * Membaca satu lembar menjadi array objek { NAMA_HEADER: nilai }.
 * Memakai getDisplayValues() agar nilai terbaca persis seperti yang
 * terlihat di layar. Ini penting untuk opsi seperti "3/4" atau "1/2"
 * yang otomatis diubah menjadi tanggal oleh Excel/Google Sheets.
 * Baris kosong dilewati.
 */
function bacaTabel_(namaSheet, kolomWajib) {
  const sheet = ambilSheet_(namaSheet);
  const header = bacaHeader_(sheet);

  const kurang = (kolomWajib || []).filter(function(k) { return header.indexOf(k) === -1; });
  if (kurang.length) {
    throw new Error('Lembar ' + namaSheet + ' tidak memiliki kolom: ' + kurang.join(', '));
  }

  const jumlahBaris = sheet.getLastRow() - 1;
  if (jumlahBaris < 1) return { sheet: sheet, header: header, baris: [] };

  const nilai = sheet.getRange(2, 1, jumlahBaris, header.length).getDisplayValues();
  const baris = [];

  nilai.forEach(function(isiBaris, i) {
    if (isiBaris.every(function(v) { return teks_(v) === ''; })) return;
    const obj = { _nomorBaris: i + 2 };
    header.forEach(function(h, j) {
      if (h) obj[h] = teks_(isiBaris[j]);
    });
    baris.push(obj);
  });

  return { sheet: sheet, header: header, baris: baris };
}

/** Menambah satu baris sesuai urutan header; kolom tak dikenal dibiarkan kosong. */
function tambahBaris_(namaSheet, data) {
  const sheet = ambilSheet_(namaSheet);
  const header = bacaHeader_(sheet);
  const baris = header.map(function(h) {
    return Object.prototype.hasOwnProperty.call(data, h) ? data[h] : '';
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet.appendRow(baris);
  } finally {
    lock.releaseLock();
  }
}

// ===================================================================
// UTILITAS
// ===================================================================

function jalankanAman_(fn) {
  try {
    return fn();
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return gagal_('Terjadi kesalahan pada server: ' + (err && err.message ? err.message : err));
  }
}

function gagal_(pesan) {
  return { berhasil: false, pesan: pesan };
}

function teks_(nilai) {
  return nilai === null || nilai === undefined ? '' : String(nilai).trim();
}

/** "6", "6.0", "06", "Kelas 6", 6 → "6" */
function normalisasiKelas_(nilai) {
  const t = teks_(nilai);
  const cocok = t.match(/\d+/);
  return cocok ? String(Number(cocok[0])) : t.toUpperCase();
}

/** Mengubah "1", "1,5", "1.5" menjadi angka; nilai kosong/aneh → bawaan. */
function angka_(nilai, bawaan) {
  const n = Number(teks_(nilai).replace(',', '.'));
  return teks_(nilai) !== '' && isFinite(n) ? n : bawaan;
}

// ===================================================================
// ALAT ADMIN — jalankan dari editor Apps Script (pilih fungsi > Jalankan)
// ===================================================================

/** Cek koneksi dan struktur database, tampilkan ringkasan di Log eksekusi. */
function periksaDatabase() {
  const ss = bukaSpreadsheet_();
  Logger.log('Database: ' + ss.getName());
  Logger.log('Lembar: ' + ss.getSheets().map(function(s) { return s.getName(); }).join(', '));

  const siswa = bacaTabel_(KONFIGURASI.SHEET_SISWA, KOLOM_SISWA).baris;
  Logger.log('Jumlah siswa: ' + siswa.length +
    ' (aktif: ' + siswa.filter(function(s) { return s.STATUS.toUpperCase() === 'AKTIF'; }).length + ')');
  siswa.forEach(function(s) {
    if (!s.USERNAME) Logger.log('  ! Baris ' + s._nomorBaris + ': USERNAME kosong');
    if (!s.PASSWORD_SALT) Logger.log('  ! Baris ' + s._nomorBaris + ' (' + s.USERNAME + '): password belum di-hash. Jalankan hashPasswordBaru().');
  });

  const tabelSoal = bacaTabel_(KONFIGURASI.SHEET_SOAL, KOLOM_SOAL);
  const rekap = {};
  tabelSoal.baris.forEach(function(b) {
    const grup = b.MATA_PELAJARAN + ' / kelas ' + normalisasiKelas_(b.KELAS);
    rekap[grup] = (rekap[grup] || 0) + 1;
    if (HURUF_OPSI.indexOf(b.KUNCI_JAWABAN.toUpperCase()) === -1) {
      Logger.log('  ! Soal ' + b.ID_SOAL + ': KUNCI_JAWABAN harus A, B, C, atau D');
    }
  });
  Logger.log('Jumlah soal: ' + tabelSoal.baris.length);
  Object.keys(rekap).forEach(function(k) { Logger.log('  ' + k + ': ' + rekap[k] + ' soal'); });

  const sel = selOpsiBerformatTanggal_(tabelSoal.sheet, tabelSoal.header);
  if (sel.length) {
    Logger.log('  ! ' + sel.length + ' sel opsi tersimpan sebagai tanggal (mis. "3/4" jadi 4 Mar). ' +
      'Tampilan web tetap benar, tapi sebaiknya jalankan rapikanFormatBankSoal().');
  }

  bacaTabel_(KONFIGURASI.SHEET_HASIL, KOLOM_HASIL);
  Logger.log('Struktur HASIL_UJIAN OK.');
}

/**
 * Mengubah kolom pertanyaan & opsi BANK_SOAL menjadi format teks biasa,
 * sehingga nilai seperti "3/4" tidak lagi berubah menjadi tanggal.
 * Isi sel dipertahankan persis seperti yang terlihat.
 */
function rapikanFormatBankSoal() {
  const sheet = ambilSheet_(KONFIGURASI.SHEET_SOAL);
  const header = bacaHeader_(sheet);
  const jumlahBaris = Math.max(sheet.getMaxRows() - 1, 1);

  ['PERTANYAAN'].concat(KOLOM_OPSI, ['KUNCI_JAWABAN']).forEach(function(nama) {
    const kolom = header.indexOf(nama) + 1;
    if (!kolom) return;
    const range = sheet.getRange(2, kolom, jumlahBaris, 1);
    const tampil = range.getDisplayValues();
    range.setNumberFormat('@');
    range.setValues(tampil);
  });
  Logger.log('Format kolom BANK_SOAL sudah diubah menjadi teks.');
}

function selOpsiBerformatTanggal_(sheet, header) {
  const hasil = [];
  const jumlahBaris = sheet.getLastRow() - 1;
  if (jumlahBaris < 1) return hasil;
  KOLOM_OPSI.forEach(function(nama) {
    const kolom = header.indexOf(nama) + 1;
    sheet.getRange(2, kolom, jumlahBaris, 1).getValues().forEach(function(r, i) {
      if (Object.prototype.toString.call(r[0]) === '[object Date]') hasil.push(nama + (i + 2));
    });
  });
  return hasil;
}

/**
 * Menambah satu akun siswa dengan password yang langsung di-hash.
 * Contoh (jalankan lewat fungsi lain atau ubah parameternya):
 *   tambahAkunSiswa('0123456789', 'Budi Santoso', '6', 'budi', 'Rahasia123');
 */
function tambahAkunSiswa(nisn, namaSiswa, kelas, username, password) {
  if (!username || !password) throw new Error('Username dan password wajib diisi.');
  if (cariSiswa_(username)) throw new Error('Username ' + username + ' sudah dipakai.');

  const salt = Utilities.getUuid();
  tambahBaris_(KONFIGURASI.SHEET_SISWA, {
    NISN: nisn,
    NAMA_SISWA: namaSiswa,
    KELAS: kelas,
    USERNAME: teks_(username),
    PASSWORD_HASH: buatHashPassword_(String(password), salt),
    STATUS: 'AKTIF',
    PASSWORD_SALT: salt
  });
  Logger.log('Akun ' + username + ' berhasil dibuat.');
}

/**
 * Cara cepat menambah banyak siswa:
 *   1. Isi DATA_SISWA seperti biasa, tulis password ASLI di kolom
 *      PASSWORD_HASH dan biarkan PASSWORD_SALT kosong.
 *   2. Jalankan fungsi ini. Password asli akan diganti dengan hash.
 * Catat password asli di tempat lain sebelum menjalankan fungsi ini.
 */
function hashPasswordBaru() {
  const tabel = bacaTabel_(KONFIGURASI.SHEET_SISWA, KOLOM_SISWA);
  const kolomHash = tabel.header.indexOf('PASSWORD_HASH') + 1;
  const kolomSalt = tabel.header.indexOf('PASSWORD_SALT') + 1;
  const kolomStatus = tabel.header.indexOf('STATUS') + 1;
  let jumlah = 0;

  tabel.baris.forEach(function(b) {
    if (b.PASSWORD_SALT || !b.PASSWORD_HASH) return;
    const salt = Utilities.getUuid();
    tabel.sheet.getRange(b._nomorBaris, kolomHash).setValue(buatHashPassword_(b.PASSWORD_HASH, salt));
    tabel.sheet.getRange(b._nomorBaris, kolomSalt).setValue(salt);
    if (!b.STATUS) tabel.sheet.getRange(b._nomorBaris, kolomStatus).setValue('AKTIF');
    jumlah++;
  });
  Logger.log(jumlah + ' password berhasil di-hash.');
}

/** Mengganti password satu siswa. */
function gantiPasswordSiswa(username, passwordBaru) {
  const siswa = cariSiswa_(username);
  if (!siswa) throw new Error('Username ' + username + ' tidak ditemukan.');

  const tabel = bacaTabel_(KONFIGURASI.SHEET_SISWA, KOLOM_SISWA);
  const baris = tabel.baris.filter(function(b) { return b.USERNAME === siswa.username; })[0];
  const salt = Utilities.getUuid();
  tabel.sheet.getRange(baris._nomorBaris, tabel.header.indexOf('PASSWORD_HASH') + 1)
    .setValue(buatHashPassword_(String(passwordBaru), salt));
  tabel.sheet.getRange(baris._nomorBaris, tabel.header.indexOf('PASSWORD_SALT') + 1).setValue(salt);
  Logger.log('Password ' + username + ' berhasil diganti.');
}

/** Membuat akun uji: username uji_tka, password LatihanTKA2026! */
function buatAkunUji() {
  tambahAkunSiswa('UJI001', 'Siswa Uji', '6', 'uji_tka', 'LatihanTKA2026!');
}

/** Uji alur login → mulai → simpan dengan akun uji (hasil ikut tersimpan). */
function tesAlurUjian() {
  const login = loginSiswa('uji_tka', 'LatihanTKA2026!');
  Logger.log(JSON.stringify(login));
  if (!login.berhasil) return;
  const ujian = mulaiUjian(login.token, login.daftarMapel[0]);
  Logger.log('Soal: ' + (ujian.soal || []).map(function(s) { return s.id + ' ' + JSON.stringify(s.opsi); }).join(' | '));
  if (!ujian.berhasil) return;
  Logger.log(JSON.stringify(simpanHasilUjian(login.token, {})));
}
