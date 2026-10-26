/**
 * Pemasangan & perawatan. Jalankan dari editor Apps Script:
 *   setupAplikasi()  → wajib sekali di awal (aman dijalankan ulang).
 */

function setupAplikasi() {
  resetMemo_();
  const ss = bukaSpreadsheet_();
  const laporan = [];

  // 1. Lembar & kolom
  Object.keys(SKEMA).forEach(function(nama) {
    let sheet = ss.getSheetByName(nama);
    if (!sheet) {
      sheet = ss.insertSheet(nama);
      laporan.push('Lembar ' + nama + ' dibuat.');
    }
    const ada = sheet.getLastColumn() > 0 ? bacaHeader_(sheet) : [];
    const kosong = ada.every(function(h) { return !h; });
    const kurang = SKEMA[nama].kolom.filter(function(k) { return kosong || ada.indexOf(k) === -1; });

    if (kurang.length) {
      const mulai = kosong ? 1 : ada.length + 1;
      if (mulai + kurang.length - 1 > sheet.getMaxColumns()) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), mulai + kurang.length - 1 - sheet.getMaxColumns());
      }
      sheet.getRange(1, mulai, 1, kurang.length).setValues([kurang]);
      if (!kosong) laporan.push(nama + ': kolom baru ' + kurang.join(', '));
    }

    const header = bacaHeader_(sheet);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#dbeafe');
    sheet.setFrozenRows(1);
    aturFormatTeks_(nama, sheet, header);
  });
  resetMemo_();

  // 2. Pengaturan bawaan
  const p = ambilPengaturan_();
  const adaKunci = {};
  bacaSemua_('PENGATURAN').forEach(function(b) { adaKunci[b.KUNCI.toUpperCase()] = true; });
  const bawaan = {};
  Object.keys(PENGATURAN_BAWAAN).forEach(function(k) { if (!adaKunci[k]) bawaan[k] = p[k]; });
  if (Object.keys(bawaan).length) simpanPengaturan_(bawaan);

  // 3. Folder Google Drive
  const folder = folderUtama_();
  Object.keys(FOLDER_SUB_).forEach(folderSub_);
  laporan.push('Folder Drive: ' + folder.getUrl());

  // 4. Akun admin pertama
  if (!bacaSemua_('PENGGUNA').some(function(u) { return u.ID_PENGGUNA; })) {
    const password = buatPasswordAcak_() + 'A!';
    tambah_('PENGGUNA', Object.assign({
      ID_PENGGUNA: buatId_('USR'), NAMA: 'Administrator', USERNAME: 'admin', PERAN: PERAN.ADMIN, STATUS: 'AKTIF'
    }, kolomPassword_(password)));
    laporan.push('AKUN ADMIN DIBUAT → username: admin   password: ' + password + '   (segera ganti setelah login)');
  }

  // 5. Ujian bawaan dari bank soal lama (satu per mapel & kelas)
  if (!bacaSemua_('UJIAN').some(function(u) { return u.ID_UJIAN; })) {
    const grup = {};
    semuaSoal_().forEach(function(s) { grup[s.mataPelajaran + '|' + s.kelas] = s; });
    const baru = Object.keys(grup).map(function(k) {
      const s = grup[k];
      return {
        ID_UJIAN: buatId_('UJ'), NAMA_UJIAN: 'Latihan ' + s.mataPelajaran + ' Kelas ' + s.kelas,
        MATA_PELAJARAN: s.mataPelajaran, KELAS: s.kelas, DURASI_MENIT: 60, JUMLAH_SOAL: 0,
        ACAK_SOAL: 'YA', ACAK_OPSI: 'TIDAK', TAMPILKAN_NILAI: 'YA', TAMPILKAN_PEMBAHASAN: 'TIDAK',
        MAKS_PERCOBAAN: 1, STATUS: 'AKTIF', DIBUAT: Date.now()
      };
    });
    tambah_('UJIAN', baru);
    if (baru.length) laporan.push(baru.length + ' ujian latihan dibuat dari bank soal.');
  }

  laporan.push('Setup selesai. Lanjutkan: Terapkan → Deployment baru → Aplikasi web.');
  laporan.forEach(function(l) { Logger.log(l); });
  return laporan;
}

/**
 * Menjadikan kolom teks berformat "@" (teks biasa) tanpa mengubah isi yang
 * terlihat, agar jawaban seperti 3/4 tidak lagi berubah menjadi tanggal.
 */
function aturFormatTeks_(nama, sheet, header) {
  const jumlahBaris = sheet.getMaxRows() - 1;
  if (jumlahBaris < 1) return;
  header.forEach(function(h, j) {
    if (!h || jenisKolom_(nama, h) !== 'teks') return;
    const range = sheet.getRange(2, j + 1, jumlahBaris, 1);
    if (range.getNumberFormats().every(function(r) { return r[0] === '@'; })) return;
    const tampil = range.getDisplayValues();
    range.setNumberFormat('@');
    range.setValues(tampil);
  });
}

/** Membuat akun admin/guru dari editor. Contoh: buatPengguna('guru1', 'Rahasia123', 'Bu Ani', 'GURU') */
function buatPengguna(username, password, nama, peran) {
  resetMemo_();
  const u = validasiUsername_(username);
  if (usernameDipakai_(u)) throw new Error('Username ' + u + ' sudah dipakai.');
  tambah_('PENGGUNA', Object.assign({
    ID_PENGGUNA: buatId_('USR'), NAMA: nama || u, USERNAME: u,
    PERAN: teks_(peran).toUpperCase() === PERAN.GURU ? PERAN.GURU : PERAN.ADMIN, STATUS: 'AKTIF'
  }, kolomPassword_(password)));
  Logger.log('Akun ' + u + ' dibuat.');
}

/** Bila lupa password admin. Contoh: resetPasswordPengguna('admin', 'PasswordBaru123') */
function resetPasswordPengguna(username, passwordBaru) {
  resetMemo_();
  const p = cariSatu_('PENGGUNA', 'USERNAME', username);
  if (!p) throw new Error('Pengguna ' + username + ' tidak ditemukan.');
  ubah_('PENGGUNA', 'ID_PENGGUNA', p.ID_PENGGUNA, Object.assign({ STATUS: 'AKTIF' }, kolomPassword_(passwordBaru)));
  hapusGagalLogin_('A', teks_(username).toLowerCase());
  Logger.log('Password ' + username + ' berhasil diganti.');
}
