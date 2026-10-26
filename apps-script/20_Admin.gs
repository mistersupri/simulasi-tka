/**
 * API halaman admin: dashboard, data siswa, pengguna (admin/guru),
 * pengaturan, log aktivitas, dan backup.
 *
 * Peran:
 *   ADMIN : semua fitur.
 *   GURU  : dashboard, bank soal, ujian, hasil & monitoring.
 */

const HANYA_ADMIN_ = ['ADMIN']; // literal: jangan bergantung pada urutan file
const MAKS_HASH_PER_PANGGILAN_ = 15;

function adminDashboard(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    const sekarang = Date.now();
    const siswa = bacaSemua_('DATA_SISWA').filter(function(s) { return s.USERNAME; });
    const soal = semuaSoal_();
    const ujian = semuaUjian_();
    const hasil = bacaSemua_('HASIL_UJIAN').filter(function(h) { return h.ID_HASIL; });
    const berlangsung = bacaSemua_('SESI_UJIAN').filter(function(s) {
      return teks_(s.STATUS).toUpperCase() === 'BERLANGSUNG';
    });

    const perKelas = {};
    siswa.forEach(function(s) {
      const k = normalisasiKelas_(s.KELAS) || '-';
      perKelas[k] = (perKelas[k] || 0) + 1;
    });
    const perMapel = {};
    soal.forEach(function(s) {
      const k = s.mataPelajaran + ' (kelas ' + s.kelas + ')';
      perMapel[k] = (perMapel[k] || 0) + 1;
    });

    const nilai = hasil.map(function(h) { return Number(h.NILAI) || 0; });
    const rataRata = nilai.length ? Math.round(nilai.reduce(function(a, b) { return a + b; }, 0) / nilai.length) : 0;

    return sukses_({
      jumlahSiswa: siswa.length,
      siswaAktif: siswa.filter(function(s) { return teks_(s.STATUS).toUpperCase() === 'AKTIF'; }).length,
      jumlahSoal: soal.length,
      jumlahUjian: ujian.length,
      ujianBerjalan: ujian.filter(function(u) {
        return u.aktif && (!u.waktuMulai || u.waktuMulai <= sekarang) && (!u.waktuSelesai || u.waktuSelesai >= sekarang);
      }).length,
      jumlahHasil: hasil.length,
      rataRata: rataRata,
      sedangUjian: berlangsung.length,
      perKelas: perKelas,
      perMapel: perMapel,
      hasilTerbaru: hasil
        .sort(function(a, b) { return (b.TANGGAL_UJIAN || 0) - (a.TANGGAL_UJIAN || 0); })
        .slice(0, 8)
        .map(function(h) {
          return { nama: h.NAMA_SISWA, kelas: h.KELAS, ujian: h.NAMA_UJIAN || h.MATA_PELAJARAN, nilai: h.NILAI, tanggal: h.TANGGAL_UJIAN };
        })
    });
  });
}

// -------------------------------------------------------------------
// Data siswa
// -------------------------------------------------------------------

function siswaKeKlien_(s) {
  return {
    nisn: s.NISN,
    nama: s.NAMA_SISWA,
    kelas: normalisasiKelas_(s.KELAS),
    username: s.USERNAME,
    status: teks_(s.STATUS).toUpperCase() || 'NONAKTIF',
    loginTerakhir: s.LOGIN_TERAKHIR || null,
    sudahAdaPassword: !!s.PASSWORD_SALT
  };
}

function adminDaftarSiswa(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token, HANYA_ADMIN_);
    return sukses_({
      siswa: bacaSemua_('DATA_SISWA').filter(function(s) { return s.USERNAME; }).map(siswaKeKlien_)
    });
  });
}

function validasiUsername_(username) {
  const u = teks_(username).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw galat_('Username "' + username + '" tidak valid. Gunakan 3–30 huruf kecil, angka, titik, garis bawah, atau strip.');
  }
  return u;
}

function usernameDipakai_(username) {
  return !!cariSatu_('DATA_SISWA', 'USERNAME', username) || !!cariSatu_('PENGGUNA', 'USERNAME', username);
}

/** Username otomatis dari nama, mis. "Budi Santoso" → "budi" + 3 angka. */
function buatUsernameOtomatis_(nama, terpakai) {
  const dasar = (teks_(nama).toLowerCase().split(/\s+/)[0] || 'siswa').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'siswa';
  for (let i = 0; i < 200; i++) {
    const calon = dasar + String(Math.floor(100 + Math.random() * 900));
    if (!terpakai[calon] && !usernameDipakai_(calon)) return calon;
  }
  throw galat_('Gagal membuat username otomatis untuk ' + nama);
}

/** Membuat (usernameLama kosong) atau mengubah data siswa. */
function adminSimpanSiswa(token, data, usernameLama) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    data = data || {};
    const nama = teks_(data.nama);
    const kelas = normalisasiKelas_(data.kelas);
    if (!nama) return gagal_('Nama siswa wajib diisi.');
    if (!kelas) return gagal_('Kelas wajib diisi.');
    const status = teks_(data.status).toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';

    if (usernameLama) {
      const lama = cariSatu_('DATA_SISWA', 'USERNAME', usernameLama);
      if (!lama) return gagal_('Siswa tidak ditemukan.');
      const perubahan = { NISN: teks_(data.nisn), NAMA_SISWA: nama, KELAS: kelas, STATUS: status };
      if (data.password) Object.assign(perubahan, kolomPassword_(data.password));
      ubah_('DATA_SISWA', 'USERNAME', lama.USERNAME, perubahan);
      catatLog_(sesi, 'UBAH_SISWA', lama.USERNAME);
      return sukses_({ pesan: 'Data siswa diperbarui.' });
    }

    const username = data.username ? validasiUsername_(data.username) : buatUsernameOtomatis_(nama, {});
    if (usernameDipakai_(username)) return gagal_('Username ' + username + ' sudah dipakai.');
    const password = teks_(data.password) || buatPasswordAcak_();

    tambah_('DATA_SISWA', Object.assign({
      NISN: teks_(data.nisn), NAMA_SISWA: nama, KELAS: kelas, USERNAME: username, STATUS: status
    }, kolomPassword_(password)));
    catatLog_(sesi, 'TAMBAH_SISWA', username);
    return sukses_({
      pesan: 'Siswa ditambahkan.',
      akun: [{ nama: nama, kelas: kelas, username: username, password: password }]
    });
  });
}

function adminHapusSiswa(token, daftarUsername) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    const n = hapus_('DATA_SISWA', 'USERNAME', daftarUsername);
    catatLog_(sesi, 'HAPUS_SISWA', daftarUsername.join(', '));
    return sukses_({ pesan: n + ' siswa dihapus. Hasil ujian mereka tetap tersimpan.' });
  });
}

function adminStatusSiswa(token, daftarUsername, status) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    const s = teks_(status).toUpperCase() === 'AKTIF' ? 'AKTIF' : 'NONAKTIF';
    daftarUsername.forEach(function(u) { ubah_('DATA_SISWA', 'USERNAME', u, { STATUS: s }); });
    catatLog_(sesi, 'STATUS_SISWA_' + s, daftarUsername.join(', '));
    return sukses_({ pesan: daftarUsername.length + ' siswa diubah menjadi ' + s + '.' });
  });
}

/** Membuat password baru acak. Maks 15 siswa per panggilan (browser mengirim bertahap). */
function adminResetPasswordSiswa(token, daftarUsername) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    if (daftarUsername.length > MAKS_HASH_PER_PANGGILAN_) return gagal_('Maksimal ' + MAKS_HASH_PER_PANGGILAN_ + ' siswa per proses.');
    const akun = [];
    daftarUsername.forEach(function(u) {
      const s = cariSatu_('DATA_SISWA', 'USERNAME', u);
      if (!s) return;
      const password = buatPasswordAcak_();
      ubah_('DATA_SISWA', 'USERNAME', s.USERNAME, kolomPassword_(password));
      akun.push({ nama: s.NAMA_SISWA, kelas: normalisasiKelas_(s.KELAS), username: s.USERNAME, password: password });
    });
    catatLog_(sesi, 'RESET_PASSWORD_SISWA', daftarUsername.join(', '));
    return sukses_({ akun: akun });
  });
}

/**
 * Impor siswa dari tabel yang ditempel (Excel/Sheets/CSV).
 * baris = [{ nisn, nama, kelas, username?, password? }], maks 15 per panggilan.
 */
function adminImporSiswa(token, baris) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    if (baris.length > MAKS_HASH_PER_PANGGILAN_) return gagal_('Maksimal ' + MAKS_HASH_PER_PANGGILAN_ + ' baris per proses.');

    const akun = [];
    const ditolak = [];
    const baru = [];
    const terpakai = {};

    baris.forEach(function(b) {
      try {
        const nama = teks_(b.nama);
        const kelas = normalisasiKelas_(b.kelas);
        if (!nama || !kelas) throw galat_('Nama dan kelas wajib diisi.');
        const username = b.username ? validasiUsername_(b.username) : buatUsernameOtomatis_(nama, terpakai);
        if (terpakai[username] || usernameDipakai_(username)) throw galat_('Username ' + username + ' sudah dipakai.');
        const password = teks_(b.password) || buatPasswordAcak_();

        baru.push(Object.assign({
          NISN: teks_(b.nisn), NAMA_SISWA: nama, KELAS: kelas, USERNAME: username, STATUS: 'AKTIF'
        }, kolomPassword_(password)));
        terpakai[username] = true;
        akun.push({ nama: nama, kelas: kelas, username: username, password: password });
      } catch (e) {
        ditolak.push({ nomor: b.nomor, nama: b.nama, alasan: e.message });
      }
    });

    tambah_('DATA_SISWA', baru);
    if (baru.length) catatLog_(sesi, 'IMPOR_SISWA', baru.length + ' siswa');
    return sukses_({ akun: akun, ditolak: ditolak });
  });
}

// -------------------------------------------------------------------
// Pengguna (admin & guru)
// -------------------------------------------------------------------

function adminDaftarPengguna(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token, HANYA_ADMIN_);
    return sukses_({
      pengguna: bacaSemua_('PENGGUNA').filter(function(p) { return p.ID_PENGGUNA; }).map(function(p) {
        return {
          id: p.ID_PENGGUNA, nama: p.NAMA, username: p.USERNAME,
          peran: teks_(p.PERAN).toUpperCase(), status: teks_(p.STATUS).toUpperCase(), loginTerakhir: p.LOGIN_TERAKHIR || null
        };
      })
    });
  });
}

function jumlahAdminAktif_(kecualiId) {
  return bacaSemua_('PENGGUNA').filter(function(p) {
    return p.ID_PENGGUNA !== kecualiId && teks_(p.PERAN).toUpperCase() === PERAN.ADMIN &&
      teks_(p.STATUS).toUpperCase() === 'AKTIF';
  }).length;
}

function adminSimpanPengguna(token, data, idLama) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    data = data || {};
    const nama = teks_(data.nama);
    if (!nama) return gagal_('Nama wajib diisi.');
    const peran = teks_(data.peran).toUpperCase() === PERAN.ADMIN ? PERAN.ADMIN : PERAN.GURU;
    const status = teks_(data.status).toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';

    if (idLama) {
      const lama = cariSatu_('PENGGUNA', 'ID_PENGGUNA', idLama);
      if (!lama) return gagal_('Pengguna tidak ditemukan.');
      if ((peran !== PERAN.ADMIN || status !== 'AKTIF') && jumlahAdminAktif_(idLama) === 0) {
        return gagal_('Harus ada minimal satu admin aktif.');
      }
      const perubahan = { NAMA: nama, PERAN: peran, STATUS: status };
      if (data.password) Object.assign(perubahan, kolomPassword_(data.password));
      ubah_('PENGGUNA', 'ID_PENGGUNA', idLama, perubahan);
      catatLog_(sesi, 'UBAH_PENGGUNA', lama.USERNAME);
      return sukses_({ pesan: 'Pengguna diperbarui.' });
    }

    const username = validasiUsername_(data.username);
    if (usernameDipakai_(username)) return gagal_('Username ' + username + ' sudah dipakai.');
    const password = teks_(data.password) || buatPasswordAcak_();
    tambah_('PENGGUNA', Object.assign({
      ID_PENGGUNA: buatId_('USR'), NAMA: nama, USERNAME: username, PERAN: peran, STATUS: status
    }, kolomPassword_(password)));
    catatLog_(sesi, 'TAMBAH_PENGGUNA', username + ' (' + peran + ')');
    return sukses_({ pesan: 'Pengguna ditambahkan.', akun: [{ nama: nama, username: username, password: password, kelas: peran }] });
  });
}

function adminHapusPengguna(token, daftarId) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    if (daftarId.indexOf(sesi.id) !== -1) return gagal_('Tidak bisa menghapus akun sendiri.');
    const sisaAdmin = bacaSemua_('PENGGUNA').filter(function(p) {
      return daftarId.indexOf(p.ID_PENGGUNA) === -1 && teks_(p.PERAN).toUpperCase() === PERAN.ADMIN &&
        teks_(p.STATUS).toUpperCase() === 'AKTIF';
    }).length;
    if (!sisaAdmin) return gagal_('Harus ada minimal satu admin aktif.');
    const n = hapus_('PENGGUNA', 'ID_PENGGUNA', daftarId);
    catatLog_(sesi, 'HAPUS_PENGGUNA', daftarId.join(', '));
    return sukses_({ pesan: n + ' pengguna dihapus.' });
  });
}

// -------------------------------------------------------------------
// Pengaturan, log, backup
// -------------------------------------------------------------------

function adminAmbilPengaturan(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token, HANYA_ADMIN_);
    const p = ambilPengaturan_();
    const data = {};
    PENGATURAN_DAPAT_DIUBAH.forEach(function(k) { data[k] = p[k]; });
    let urlFolder = '';
    let backupHarian = false;
    try { urlFolder = folderUtama_().getUrl(); } catch (e) { console.warn(e); }
    try { backupHarian = pemicuBackup_().length > 0; } catch (e) { console.warn(e); }
    return sukses_({
      pengaturan: data,
      logoId: p.LOGO_ID,
      urlSpreadsheet: bukaSpreadsheet_().getUrl(),
      urlFolder: urlFolder,
      backupHarian: backupHarian
    });
  });
}

function adminSimpanPengaturan(token, data) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    const simpan = {};
    PENGATURAN_DAPAT_DIUBAH.forEach(function(k) {
      if (data && data[k] !== undefined) simpan[k] = teks_(data[k]);
    });
    if (simpan.KKM !== undefined && (isNaN(Number(simpan.KKM)) || Number(simpan.KKM) < 0 || Number(simpan.KKM) > 100)) {
      return gagal_('KKM harus angka 0–100.');
    }
    if (simpan.SISWA_BOLEH_GANTI_PASSWORD !== undefined) simpan.SISWA_BOLEH_GANTI_PASSWORD = yaTidak_(simpan.SISWA_BOLEH_GANTI_PASSWORD);
    simpanPengaturan_(simpan);
    catatLog_(sesi, 'UBAH_PENGATURAN', Object.keys(simpan).join(', '));
    return sukses_({ pesan: 'Pengaturan disimpan.' });
  });
}

function adminUnggahLogo(token, berkas) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    const lama = ambilPengaturan_().LOGO_ID;
    const id = simpanGambar_(berkas, 'logo');
    simpanPengaturan_({ LOGO_ID: id });
    if (lama) hapusFileDrive_(lama);
    catatLog_(sesi, 'UBAH_LOGO', id);
    return sukses_({ logoId: id });
  });
}

function adminDaftarLog(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token, HANYA_ADMIN_);
    const log = bacaSemua_('LOG_AKTIVITAS')
      .sort(function(a, b) { return (b.WAKTU || 0) - (a.WAKTU || 0); })
      .slice(0, 500)
      .map(function(l) { return { waktu: l.WAKTU, pengguna: l.PENGGUNA, peran: l.PERAN, aksi: l.AKSI, detail: l.DETAIL }; });
    return sukses_({ log: log });
  });
}

function adminBackupSekarang(token) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    const hasil = buatBackup_();
    catatLog_(sesi, 'BACKUP', hasil.nama);
    return sukses_(hasil);
  });
}

function adminAturBackupHarian(token, aktif) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token, HANYA_ADMIN_);
    aturBackupHarian_(!!aktif);
    catatLog_(sesi, aktif ? 'BACKUP_HARIAN_AKTIF' : 'BACKUP_HARIAN_NONAKTIF', '');
    return sukses_({ pesan: aktif ? 'Backup harian aktif (setiap pukul 01.00).' : 'Backup harian dimatikan.' });
  });
}
