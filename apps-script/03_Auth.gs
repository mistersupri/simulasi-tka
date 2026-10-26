/**
 * Autentikasi: hash password, sesi login (CacheService), login siswa & admin.
 *
 * Sesi disimpan di server dengan token acak. Browser hanya memegang token,
 * sehingga identitas siswa tidak bisa dipalsukan dari browser.
 */

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

/** Menghasilkan { PASSWORD_HASH, PASSWORD_SALT } untuk disimpan. */
function kolomPassword_(password) {
  const p = String(password || '');
  if (p.length < KONFIGURASI.PANJANG_PASSWORD_MIN) {
    throw galat_('Kata sandi minimal ' + KONFIGURASI.PANJANG_PASSWORD_MIN + ' karakter.');
  }
  const salt = Utilities.getUuid();
  return { PASSWORD_HASH: buatHashPassword_(p, salt), PASSWORD_SALT: salt };
}

function passwordCocok_(password, baris) {
  return !!(baris && baris.PASSWORD_SALT && password &&
    buatHashPassword_(String(password), baris.PASSWORD_SALT) === teks_(baris.PASSWORD_HASH).toLowerCase());
}

// -------------------------------------------------------------------
// Sesi
// -------------------------------------------------------------------

function kunciSesi_(token) {
  return 'sesi_' + token;
}

function buatSesi_(data) {
  const token = Utilities.getUuid();
  simpanSesi_(token, data);
  return token;
}

function simpanSesi_(token, data) {
  CacheService.getScriptCache().put(kunciSesi_(token), JSON.stringify(data), KONFIGURASI.DURASI_SESI_DETIK);
}

function ambilSesi_(token) {
  if (!token) return null;
  const isi = CacheService.getScriptCache().get(kunciSesi_(String(token)));
  return isi ? JSON.parse(isi) : null;
}

function errorSesi_(pesan) {
  const err = new Error(pesan || 'Sesi login berakhir. Silakan masuk kembali.');
  err.sesiBerakhir = true;
  return err;
}

function butuhSiswa_(token) {
  const sesi = ambilSesi_(token);
  if (!sesi || sesi.jenis !== 'SISWA') throw errorSesi_();
  return sesi;
}

/** peranDiizinkan kosong = semua peran admin (ADMIN & GURU). */
function butuhAdmin_(token, peranDiizinkan) {
  const sesi = ambilSesi_(token);
  if (!sesi || sesi.jenis !== 'ADMIN') throw errorSesi_();
  if (peranDiizinkan && peranDiizinkan.indexOf(sesi.peran) === -1) {
    throw galat_('Akses ditolak. Fitur ini hanya untuk ' + peranDiizinkan.join('/') + '.');
  }
  return sesi;
}

function butuhSesiApaSaja_(token) {
  const sesi = ambilSesi_(token);
  if (!sesi) throw errorSesi_();
  return sesi;
}

// -------------------------------------------------------------------
// Pembatasan percobaan login
// -------------------------------------------------------------------

function cekKunciLogin_(jenis, username) {
  const n = Number(CacheService.getScriptCache().get('gagal_' + jenis + '_' + username) || 0);
  if (n >= KONFIGURASI.MAKS_GAGAL_LOGIN) {
    throw galat_('Terlalu banyak percobaan gagal. Coba lagi dalam ' +
      Math.round(KONFIGURASI.LAMA_KUNCI_LOGIN_DETIK / 60) + ' menit.');
  }
}

function catatGagalLogin_(jenis, username) {
  const cache = CacheService.getScriptCache();
  const kunci = 'gagal_' + jenis + '_' + username;
  cache.put(kunci, String(Number(cache.get(kunci) || 0) + 1), KONFIGURASI.LAMA_KUNCI_LOGIN_DETIK);
}

function hapusGagalLogin_(jenis, username) {
  CacheService.getScriptCache().remove('gagal_' + jenis + '_' + username);
}

// -------------------------------------------------------------------
// API login (dipanggil dari browser)
// -------------------------------------------------------------------

function profilSiswa_(sesi) {
  const p = ambilPengaturan_();
  return {
    jenis: 'SISWA',
    username: sesi.username,
    nisn: sesi.nisn,
    nama: sesi.nama,
    kelas: sesi.kelas,
    bolehGantiPassword: ya_(p.SISWA_BOLEH_GANTI_PASSWORD)
  };
}

function profilAdmin_(sesi) {
  return { jenis: 'ADMIN', id: sesi.id, username: sesi.username, nama: sesi.nama, peran: sesi.peran };
}

function loginSiswa(username, password) {
  return jalankanAman_(function() {
    username = teks_(username).toLowerCase();
    if (!username || !password) return gagal_('Username dan kata sandi wajib diisi.');
    cekKunciLogin_('S', username);

    const siswa = cariSatu_('DATA_SISWA', 'USERNAME', username);
    if (!passwordCocok_(password, siswa)) {
      catatGagalLogin_('S', username);
      return gagal_('Username atau kata sandi salah.');
    }
    if (teks_(siswa.STATUS).toUpperCase() !== 'AKTIF') {
      return gagal_('Akun belum aktif. Silakan hubungi admin sekolah.');
    }
    hapusGagalLogin_('S', username);
    ubah_('DATA_SISWA', 'USERNAME', siswa.USERNAME, { LOGIN_TERAKHIR: Date.now() });

    const sesi = {
      jenis: 'SISWA',
      username: siswa.USERNAME,
      nisn: siswa.NISN,
      nama: siswa.NAMA_SISWA,
      kelas: normalisasiKelas_(siswa.KELAS)
    };
    return sukses_({ token: buatSesi_(sesi), profil: profilSiswa_(sesi) });
  });
}

function loginAdmin(username, password) {
  return jalankanAman_(function() {
    username = teks_(username).toLowerCase();
    if (!username || !password) return gagal_('Username dan kata sandi wajib diisi.');
    cekKunciLogin_('A', username);

    const pengguna = cariSatu_('PENGGUNA', 'USERNAME', username);
    if (!passwordCocok_(password, pengguna)) {
      catatGagalLogin_('A', username);
      return gagal_('Username atau kata sandi salah.');
    }
    if (teks_(pengguna.STATUS).toUpperCase() !== 'AKTIF') {
      return gagal_('Akun tidak aktif.');
    }
    hapusGagalLogin_('A', username);
    ubah_('PENGGUNA', 'ID_PENGGUNA', pengguna.ID_PENGGUNA, { LOGIN_TERAKHIR: Date.now() });

    const sesi = {
      jenis: 'ADMIN',
      id: pengguna.ID_PENGGUNA,
      username: pengguna.USERNAME,
      nama: pengguna.NAMA,
      peran: teks_(pengguna.PERAN).toUpperCase() === PERAN.ADMIN ? PERAN.ADMIN : PERAN.GURU
    };
    catatLog_(sesi, 'LOGIN', '');
    return sukses_({ token: buatSesi_(sesi), profil: profilAdmin_(sesi) });
  });
}

/** Memulihkan login saat halaman dimuat ulang. */
function cekSesi(token) {
  return jalankanAman_(function() {
    const sesi = butuhSesiApaSaja_(token);
    return sukses_({ profil: sesi.jenis === 'SISWA' ? profilSiswa_(sesi) : profilAdmin_(sesi) });
  });
}

function keluar(token) {
  if (token) CacheService.getScriptCache().remove(kunciSesi_(String(token)));
  return { berhasil: true };
}

function gantiPasswordSendiri(token, passwordLama, passwordBaru) {
  return jalankanAman_(function() {
    const sesi = butuhSesiApaSaja_(token);
    const siswa = sesi.jenis === 'SISWA';
    if (siswa && !ya_(ambilPengaturan_().SISWA_BOLEH_GANTI_PASSWORD)) {
      return gagal_('Penggantian kata sandi oleh siswa sedang dinonaktifkan.');
    }

    const tabel = siswa ? 'DATA_SISWA' : 'PENGGUNA';
    const kolom = siswa ? 'USERNAME' : 'ID_PENGGUNA';
    const nilai = siswa ? sesi.username : sesi.id;
    const baris = cariSatu_(tabel, kolom, nilai);
    if (!passwordCocok_(passwordLama, baris)) return gagal_('Kata sandi lama salah.');

    ubah_(tabel, kolom, nilai, kolomPassword_(passwordBaru));
    catatLog_(sesi, 'GANTI_PASSWORD', '');
    return sukses_({ pesan: 'Kata sandi berhasil diganti.' });
  });
}
