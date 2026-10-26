/**
 * Google Drive: folder aplikasi, gambar soal, logo, backup, dan ekspor.
 *
 * Struktur folder (dibuat otomatis):
 *   Simulasi TKA/
 *     Gambar Soal/
 *     Backup/
 *     Ekspor/
 */

const FOLDER_SUB_ = {
  FOLDER_GAMBAR_ID: 'Gambar Soal',
  FOLDER_BACKUP_ID: 'Backup',
  FOLDER_EKSPOR_ID: 'Ekspor'
};

function folderDariId_(id) {
  if (!id) return null;
  try {
    const f = DriveApp.getFolderById(id);
    return f.isTrashed() ? null : f;
  } catch (e) {
    return null;
  }
}

function folderUtama_() {
  const p = ambilPengaturan_();
  let folder = folderDariId_(p.FOLDER_ID);
  if (!folder) {
    folder = DriveApp.createFolder(KONFIGURASI.NAMA_FOLDER_DRIVE + ' - ' + p.NAMA_SEKOLAH);
    simpanPengaturan_({ FOLDER_ID: folder.getId() });
  }
  return folder;
}

function folderSub_(kunci) {
  const p = ambilPengaturan_();
  let folder = folderDariId_(p[kunci]);
  if (!folder) {
    folder = folderUtama_().createFolder(FOLDER_SUB_[kunci]);
    const data = {};
    data[kunci] = folder.getId();
    simpanPengaturan_(data);
  }
  return folder;
}

/** berkas = { nama, mime, base64 } dari browser. Mengembalikan ID file Drive. */
function simpanGambar_(berkas, awalanNama) {
  if (!berkas || !berkas.base64) throw galat_('Berkas gambar kosong.');
  const mime = teks_(berkas.mime).toLowerCase();
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(mime)) {
    throw galat_('Format gambar harus PNG, JPG, GIF, atau WEBP.');
  }
  const bytes = Utilities.base64Decode(berkas.base64);
  if (bytes.length > KONFIGURASI.UKURAN_GAMBAR_MAKS_BYTE) {
    throw galat_('Ukuran gambar maksimal ' + Math.round(KONFIGURASI.UKURAN_GAMBAR_MAKS_BYTE / 1048576) + ' MB.');
  }

  const nama = (awalanNama ? awalanNama + '_' : '') + (teks_(berkas.nama) || 'gambar');
  const file = folderSub_('FOLDER_GAMBAR_ID').createFile(Utilities.newBlob(bytes, mime, nama));
  try {
    // Agar gambar bisa tampil langsung lewat URL. Bila kebijakan domain
    // sekolah melarang, gambar tetap tampil lewat ambilGambar().
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn('Tidak dapat membagikan gambar: ' + e);
  }
  return file.getId();
}

function hapusFileDrive_(id) {
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {
    console.warn('Gagal menghapus file ' + id + ': ' + e);
  }
}

function fileDiFolder_(file, folderId) {
  const induk = file.getParents();
  while (induk.hasNext()) {
    if (induk.next().getId() === folderId) return true;
  }
  return false;
}

function dataUrlFile_(file) {
  const blob = file.getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

/**
 * Cadangan bila gambar tidak bisa dibuka lewat URL publik.
 * Hanya file di folder Gambar Soal yang boleh diambil.
 */
function ambilGambar(token, id) {
  return jalankanAman_(function() {
    butuhSesiApaSaja_(token);
    const file = DriveApp.getFileById(teks_(id));
    if (!fileDiFolder_(file, folderSub_('FOLDER_GAMBAR_ID').getId())) {
      return gagal_('Gambar tidak ditemukan.');
    }
    return sukses_({ dataUrl: dataUrlFile_(file) });
  });
}

/** Logo sekolah (tanpa login). */
function ambilLogo() {
  return jalankanAman_(function() {
    const id = ambilPengaturan_().LOGO_ID;
    if (!id) return gagal_('Logo belum diatur.');
    return sukses_({ dataUrl: dataUrlFile_(DriveApp.getFileById(id)) });
  });
}

// -------------------------------------------------------------------
// Backup & ekspor
// -------------------------------------------------------------------

function buatBackup_() {
  const ss = bukaSpreadsheet_();
  const nama = 'Backup ' + ss.getName() + ' ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  const salinan = DriveApp.getFileById(ss.getId()).makeCopy(nama, folderSub_('FOLDER_BACKUP_ID'));
  return { nama: nama, url: salinan.getUrl() };
}

/** Dipanggil oleh pemicu (trigger) harian. */
function backupOtomatis() {
  resetMemo_();
  const hasil = buatBackup_();
  catatLog_(null, 'BACKUP_OTOMATIS', hasil.nama);
}

function pemicuBackup_() {
  return ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'backupOtomatis';
  });
}

function aturBackupHarian_(aktif) {
  pemicuBackup_().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  if (aktif) {
    ScriptApp.newTrigger('backupOtomatis').timeBased().everyDays(1).atHour(1).create();
  }
}

/**
 * Membuat Google Spreadsheet baru di folder Ekspor.
 * lembar = [{ nama: 'Nilai', baris: [[header...], [nilai...], ...] }]
 */
function eksporKeSpreadsheet_(judul, lembar) {
  const ss = SpreadsheetApp.create(judul);
  lembar.forEach(function(l, i) {
    const sheet = i === 0 ? ss.getSheets()[0].setName(l.nama) : ss.insertSheet(l.nama);
    if (l.baris.length && l.baris[0].length) {
      // Teks yang diawali = + - @ bisa dieksekusi sebagai rumus; jadikan teks biasa.
      const aman = l.baris.map(function(b) {
        return b.map(function(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; });
      });
      sheet.getRange(1, 1, aman.length, aman[0].length).setValues(aman);
      sheet.getRange(1, 1, 1, l.baris[0].length).setFontWeight('bold').setBackground('#dbeafe');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, l.baris[0].length);
    }
  });
  const file = DriveApp.getFileById(ss.getId());
  file.moveTo(folderSub_('FOLDER_EKSPOR_ID'));
  return { nama: judul, url: ss.getUrl() };
}
