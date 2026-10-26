/**
 * Logika inti ujian yang dipakai halaman siswa maupun admin:
 * membaca soal & jadwal ujian, mengacak soal/opsi, menilai, dan
 * menyimpan hasil.
 *
 * Jawaban selalu disimpan dalam huruf ASLI (sesuai kolom OPSI_A..D di
 * BANK_SOAL). Bila opsi diacak, huruf yang dilihat siswa dikonversi di
 * server melalui URUTAN sesi: { i: ID_SOAL, o: [indeks opsi asli per posisi tampil] }.
 */

// -------------------------------------------------------------------
// Soal
// -------------------------------------------------------------------

function normalisasiKunci_(nilai, tipe) {
  const huruf = (teks_(nilai).toUpperCase().match(/[A-D]/g) || [])
    .filter(function(h, i, arr) { return arr.indexOf(h) === i; })
    .sort();
  if (tipe === TIPE_SOAL.PGK) return huruf.join(',');
  return huruf[0] || '';
}

function tipeSoal_(nilai) {
  return teks_(nilai).toUpperCase() === TIPE_SOAL.PGK ? TIPE_SOAL.PGK : TIPE_SOAL.PG;
}

function soalDariBaris_(b) {
  const tipe = tipeSoal_(b.TIPE_SOAL);
  return {
    id: b.ID_SOAL,
    mataPelajaran: b.MATA_PELAJARAN,
    kelas: normalisasiKelas_(b.KELAS),
    pertanyaan: b.PERTANYAAN,
    opsi: HURUF_OPSI.map(function(h) { return b['OPSI_' + h] || ''; }),
    kunci: normalisasiKunci_(b.KUNCI_JAWABAN, tipe),
    skor: angka_(b.SKOR, 1),
    tipe: tipe,
    gambarId: b.GAMBAR_ID || '',
    pembahasan: b.PEMBAHASAN || '',
    aktif: teks_(b.STATUS).toUpperCase() !== 'NONAKTIF',
    dibuat: b.DIBUAT || null
  };
}

function semuaSoal_() {
  return bacaSemua_('BANK_SOAL')
    .filter(function(b) { return b.ID_SOAL && b.PERTANYAAN; })
    .map(soalDariBaris_);
}

function petaSoal_() {
  const peta = {};
  semuaSoal_().forEach(function(s) { peta[s.id] = s; });
  return peta;
}

function soalUntuk_(mataPelajaran, kelas) {
  const m = teks_(mataPelajaran).toLowerCase();
  const k = normalisasiKelas_(kelas);
  return semuaSoal_().filter(function(s) {
    return s.aktif && s.kunci && s.mataPelajaran.toLowerCase() === m && s.kelas === k;
  });
}

// -------------------------------------------------------------------
// Jadwal ujian
// -------------------------------------------------------------------

function ujianDariBaris_(b) {
  const maks = angka_(b.MAKS_PERCOBAAN, 1);
  return {
    id: b.ID_UJIAN,
    nama: b.NAMA_UJIAN,
    mataPelajaran: b.MATA_PELAJARAN,
    kelas: b.KELAS,
    durasiMenit: angka_(b.DURASI_MENIT, 0),
    jumlahSoal: angka_(b.JUMLAH_SOAL, 0),
    waktuMulai: b.WAKTU_MULAI || null,
    waktuSelesai: b.WAKTU_SELESAI || null,
    token: teks_(b.TOKEN).toUpperCase(),
    acakSoal: ya_(b.ACAK_SOAL),
    acakOpsi: ya_(b.ACAK_OPSI),
    tampilkanNilai: teks_(b.TAMPILKAN_NILAI) === '' || ya_(b.TAMPILKAN_NILAI),
    tampilkanPembahasan: ya_(b.TAMPILKAN_PEMBAHASAN),
    maksPercobaan: maks,
    aktif: teks_(b.STATUS).toUpperCase() !== 'NONAKTIF',
    dibuat: b.DIBUAT || null
  };
}

function semuaUjian_() {
  return bacaSemua_('UJIAN').filter(function(b) { return b.ID_UJIAN; }).map(ujianDariBaris_);
}

function cariUjian_(id) {
  const b = cariSatu_('UJIAN', 'ID_UJIAN', id);
  return b ? ujianDariBaris_(b) : null;
}

// -------------------------------------------------------------------
// Sesi ujian (lembar SESI_UJIAN)
// -------------------------------------------------------------------

function sesiDariBaris_(b) {
  return {
    id: b.ID_SESI,
    idUjian: b.ID_UJIAN,
    username: b.USERNAME,
    nisn: b.NISN,
    namaSiswa: b.NAMA_SISWA,
    kelas: b.KELAS,
    waktuMulai: b.WAKTU_MULAI,
    batasWaktu: b.BATAS_WAKTU || null,
    urutan: parseJson_(b.URUTAN, []),
    jawaban: parseJson_(b.JAWABAN, {}),
    ragu: parseJson_(b.RAGU, []),
    status: teks_(b.STATUS).toUpperCase(),
    terakhirAktif: b.TERAKHIR_AKTIF || null
  };
}

function sesiKadaluarsa_(sesi, sekarang) {
  return !!sesi.batasWaktu && sekarang > sesi.batasWaktu + KONFIGURASI.TOLERANSI_WAKTU_DETIK * 1000;
}

/** Jawaban dari browser (huruf tampil) → huruf asli. */
function keHurufAsli_(itemUrutan, jawabanTampil) {
  const daftar = Array.isArray(jawabanTampil) ? jawabanTampil : teks_(jawabanTampil).split(',');
  const asli = daftar
    .map(function(h) { return HURUF_OPSI.indexOf(teks_(h).toUpperCase()); })
    .filter(function(i) { return i !== -1; })
    .map(function(i) { return HURUF_OPSI[itemUrutan.o ? itemUrutan.o[i] : i]; })
    .filter(function(h, i, arr) { return arr.indexOf(h) === i; })
    .sort();
  return asli.join(',');
}

/** Huruf asli → huruf tampil (untuk dikirim ke browser). */
function keHurufTampil_(itemUrutan, jawabanAsli) {
  return teks_(jawabanAsli).split(',')
    .map(function(h) { return HURUF_OPSI.indexOf(teks_(h).toUpperCase()); })
    .filter(function(i) { return i !== -1; })
    .map(function(i) { return HURUF_OPSI[itemUrutan.o ? itemUrutan.o.indexOf(i) : i]; })
    .sort()
    .join(',');
}

function jawabanKeAsli_(urutan, jawabanTampil) {
  const hasil = {};
  const masuk = jawabanTampil || {};
  urutan.forEach(function(item) {
    if (masuk[item.i] === undefined) return;
    const asli = keHurufAsli_(item, masuk[item.i]);
    if (asli) hasil[item.i] = asli;
  });
  return hasil;
}

function raguValid_(urutan, ragu) {
  const id = urutan.map(function(u) { return u.i; });
  return (Array.isArray(ragu) ? ragu : []).filter(function(r) { return id.indexOf(r) !== -1; });
}

// -------------------------------------------------------------------
// Penilaian
// -------------------------------------------------------------------

/**
 * PG  : benar bila huruf sama dengan kunci.
 * PGK : benar bila semua pilihan sama persis dengan kunci (tanpa nilai parsial).
 * Soal yang tidak dijawab dihitung salah dan juga dicatat sebagai kosong.
 */
function hitungNilai_(daftarId, jawabanAsli, peta) {
  const hasil = { jumlahSoal: 0, jumlahBenar: 0, jumlahSalah: 0, jumlahKosong: 0, nilai: 0, detail: {} };
  let skor = 0;
  let maks = 0;

  daftarId.forEach(function(id) {
    const soal = peta[id];
    if (!soal || !soal.kunci) return;
    const jawab = normalisasiKunci_(jawabanAsli[id], soal.tipe);
    const benar = jawab !== '' && jawab === soal.kunci;

    hasil.jumlahSoal++;
    maks += soal.skor;
    if (benar) {
      hasil.jumlahBenar++;
      skor += soal.skor;
    } else {
      hasil.jumlahSalah++;
      if (!jawab) hasil.jumlahKosong++;
    }
    hasil.detail[id] = benar;
  });

  hasil.nilai = maks > 0 ? Math.round((skor / maks) * 100) : 0;
  return hasil;
}

/**
 * Menyelesaikan sesi: menilai, menulis HASIL_UJIAN, menandai sesi SELESAI.
 * Aman dipanggil berulang (sesi yang sudah selesai tidak dinilai dua kali).
 */
function finalisasiSesi_(idSesi, jawabanAsliBaru, statusUjian) {
  return denganKunci_(function() {
    resetMemo_();
    const baris = cariSatu_('SESI_UJIAN', 'ID_SESI', idSesi);
    if (!baris) throw galat_('Sesi ujian tidak ditemukan.');
    const sesi = sesiDariBaris_(baris);
    if (sesi.status !== 'BERLANGSUNG') throw galat_('Ujian ini sudah dikirim sebelumnya.');

    const ujian = cariUjian_(sesi.idUjian) || { id: sesi.idUjian, nama: '(ujian dihapus)', mataPelajaran: '' };
    const jawaban = jawabanAsliBaru || sesi.jawaban;
    const peta = petaSoal_();
    const daftarId = sesi.urutan.map(function(u) { return u.i; });
    const nilai = hitungNilai_(daftarId, jawaban, peta);

    const sekarang = Date.now();
    const akhir = sesi.batasWaktu ? Math.min(sekarang, sesi.batasWaktu) : sekarang;
    const durasi = Math.max(0, Math.floor((akhir - sesi.waktuMulai) / 1000));
    const siswa = cariSatu_('DATA_SISWA', 'USERNAME', sesi.username);

    const hasil = {
      ID_HASIL: Utilities.getUuid(),
      NISN: siswa ? siswa.NISN : sesi.nisn,
      NAMA_SISWA: siswa ? siswa.NAMA_SISWA : sesi.namaSiswa,
      TANGGAL_UJIAN: sekarang,
      NILAI: nilai.nilai,
      JUMLAH_BENAR: nilai.jumlahBenar,
      JUMLAH_SALAH: nilai.jumlahSalah,
      JUMLAH_KOSONG: nilai.jumlahKosong,
      DURASI_DETIK: durasi,
      STATUS_UJIAN: statusUjian || 'SELESAI',
      MATA_PELAJARAN: ujian.mataPelajaran,
      KELAS: sesi.kelas,
      ID_UJIAN: ujian.id,
      NAMA_UJIAN: ujian.nama,
      USERNAME: sesi.username,
      JAWABAN: JSON.stringify(jawaban),
      ID_SESI: sesi.id
    };
    tambah_('HASIL_UJIAN', hasil);
    ubah_('SESI_UJIAN', 'ID_SESI', sesi.id, {
      STATUS: 'SELESAI',
      JAWABAN: JSON.stringify(jawaban),
      TERAKHIR_AKTIF: sekarang
    });

    return { hasil: hasil, nilai: nilai, sesi: sesi, ujian: ujian, jawaban: jawaban };
  });
}

/** Menilai otomatis sesi yang waktunya sudah habis (siswa menutup halaman, dsb.). */
function selesaikanSesiKadaluarsa_(saring) {
  const sekarang = Date.now();
  let jumlah = 0;
  bacaSemua_('SESI_UJIAN').map(sesiDariBaris_).forEach(function(s) {
    if (s.status === 'BERLANGSUNG' && sesiKadaluarsa_(s, sekarang) && (!saring || saring(s))) {
      try {
        finalisasiSesi_(s.id, null, 'WAKTU_HABIS');
        jumlah++;
      } catch (e) {
        console.warn('Gagal menyelesaikan sesi ' + s.id + ': ' + e);
      }
    }
  });
  if (jumlah) resetMemo_();
  return jumlah;
}

/** Daftar soal + jawaban siswa + kunci, dalam urutan & huruf yang dilihat siswa. */
function susunPembahasan_(urutan, jawabanAsli, peta, denganKunci) {
  return urutan.map(function(item, nomor) {
    const soal = peta[item.i];
    if (!soal) return null;
    const jawab = normalisasiKunci_(jawabanAsli[item.i], soal.tipe);
    return {
      nomor: nomor + 1,
      id: soal.id,
      tipe: soal.tipe,
      pertanyaan: soal.pertanyaan,
      gambarId: soal.gambarId,
      opsi: (item.o || [0, 1, 2, 3]).map(function(k) { return soal.opsi[k]; }),
      jawaban: keHurufTampil_(item, jawab),
      kunci: denganKunci ? keHurufTampil_(item, soal.kunci) : '',
      benar: jawab !== '' && jawab === soal.kunci,
      pembahasan: denganKunci ? soal.pembahasan : ''
    };
  }).filter(function(x) { return x; });
}
