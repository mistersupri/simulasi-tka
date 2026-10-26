/** Fungsi bantu umum. */

/**
 * Pembungkus semua fungsi yang dipanggil dari browser: tidak pernah
 * melempar error, selalu mengembalikan { berhasil, pesan, ... }.
 */
function jalankanAman_(fn) {
  resetMemo_();
  try {
    return fn();
  } catch (err) {
    if (err && err.sesiBerakhir) {
      return { berhasil: false, sesiBerakhir: true, pesan: err.message };
    }
    if (!(err && err.pesanPengguna)) console.error(err && err.stack ? err.stack : err);
    return gagal_(err && err.message ? err.message : String(err));
  }
}

function gagal_(pesan) {
  return { berhasil: false, pesan: pesan };
}

function sukses_(data) {
  return Object.assign({ berhasil: true }, data || {});
}

/** Error yang pesannya aman ditampilkan ke pengguna. */
function galat_(pesan) {
  const err = new Error(pesan);
  err.pesanPengguna = true;
  return err;
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

/** Daftar kelas dari teks "5, 6" → ["5","6"]; kosong / SEMUA → [] (berarti semua kelas). */
function daftarKelas_(nilai) {
  const t = teks_(nilai).toUpperCase();
  if (!t || t === 'SEMUA') return [];
  return t.split(/[,;]/).map(normalisasiKelas_).filter(function(k) { return k; });
}

function kelasCocok_(daftarKelasUjian, kelas) {
  const daftar = daftarKelas_(daftarKelasUjian);
  return daftar.length === 0 || daftar.indexOf(normalisasiKelas_(kelas)) !== -1;
}

/** "1", "1,5", "1.5" → angka; kosong/aneh → bawaan. */
function angka_(nilai, bawaan) {
  const t = teks_(nilai).replace(',', '.');
  const n = Number(t);
  return t !== '' && isFinite(n) ? n : bawaan;
}

/** "YA", "ya", "TRUE", "1", true → true */
function ya_(nilai) {
  return ['YA', 'Y', 'TRUE', '1', 'BENAR', 'AKTIF'].indexOf(teks_(nilai).toUpperCase()) !== -1;
}

function yaTidak_(nilai) {
  return nilai === true || ya_(nilai) ? 'YA' : 'TIDAK';
}

function parseJson_(teks, bawaan) {
  try {
    return teks ? JSON.parse(teks) : bawaan;
  } catch (e) {
    return bawaan;
  }
}

function buatId_(awalan) {
  return awalan + Date.now().toString(36).toUpperCase() +
    Math.floor(Math.random() * 1296).toString(36).toUpperCase();
}

function acak_(daftar) {
  const salinan = daftar.slice();
  for (let i = salinan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = salinan[i];
    salinan[i] = salinan[j];
    salinan[j] = t;
  }
  return salinan;
}

/** Password acak mudah dibaca (tanpa huruf/angka yang mirip: l, 1, o, 0). */
function buatPasswordAcak_() {
  const huruf = 'abcdefghjkmnpqrstuvwxyz';
  const angka = '23456789';
  let hasil = '';
  for (let i = 0; i < 4; i++) hasil += huruf.charAt(Math.floor(Math.random() * huruf.length));
  for (let j = 0; j < 3; j++) hasil += angka.charAt(Math.floor(Math.random() * angka.length));
  return hasil;
}

function formatTanggal_(ms) {
  if (!ms) return '';
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function catatLog_(sesi, aksi, detail) {
  try {
    tambah_('LOG_AKTIVITAS', {
      WAKTU: Date.now(),
      PENGGUNA: sesi ? sesi.username : '-',
      PERAN: sesi ? (sesi.peran || sesi.jenis) : '-',
      AKSI: aksi,
      DETAIL: typeof detail === 'string' ? detail : JSON.stringify(detail || '')
    });
  } catch (e) {
    console.error('Gagal mencatat log: ' + e);
  }
}
