/**
 * API admin: jadwal ujian, hasil, analisis butir soal, monitoring peserta,
 * dan ekspor ke Google Sheets.
 */

function ujianKeKlien_(u, semuaSoal, hasil) {
  const kelas = daftarKelas_(u.kelas);
  const kelasSoal = kelas.length ? kelas : semuaSoal
    .filter(function(s) { return s.mataPelajaran.toLowerCase() === teks_(u.mataPelajaran).toLowerCase(); })
    .map(function(s) { return s.kelas; })
    .filter(function(k, i, arr) { return arr.indexOf(k) === i; });

  const soalPerKelas = {};
  kelasSoal.forEach(function(k) {
    soalPerKelas[k] = semuaSoal.filter(function(s) {
      return s.aktif && s.kunci && s.kelas === k && s.mataPelajaran.toLowerCase() === teks_(u.mataPelajaran).toLowerCase();
    }).length;
  });

  return Object.assign({}, u, {
    soalPerKelas: soalPerKelas,
    jumlahPeserta: hasil.filter(function(h) { return h.ID_UJIAN === u.id; }).length
  });
}

function adminDaftarUjian(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    const soal = semuaSoal_();
    const hasil = bacaSemua_('HASIL_UJIAN');
    const mapel = soal.map(function(s) { return s.mataPelajaran; })
      .filter(function(m, i, arr) { return m && arr.indexOf(m) === i; }).sort();
    return sukses_({
      ujian: semuaUjian_().map(function(u) { return ujianKeKlien_(u, soal, hasil); }),
      daftarMapel: mapel
    });
  });
}

function adminSimpanUjian(token, data, idLama) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    data = data || {};
    const nama = teks_(data.nama);
    const mapel = teks_(data.mataPelajaran);
    if (!nama) return gagal_('Nama ujian wajib diisi.');
    if (!mapel) return gagal_('Mata pelajaran wajib diisi.');

    const mulai = data.waktuMulai ? Number(data.waktuMulai) : null;
    const selesai = data.waktuSelesai ? Number(data.waktuSelesai) : null;
    if (mulai && selesai && selesai <= mulai) return gagal_('Waktu selesai harus setelah waktu mulai.');

    const baris = {
      NAMA_UJIAN: nama,
      MATA_PELAJARAN: mapel,
      KELAS: daftarKelas_(data.kelas).join(','),
      DURASI_MENIT: Math.max(0, Math.round(angka_(data.durasiMenit, 0))),
      JUMLAH_SOAL: Math.max(0, Math.round(angka_(data.jumlahSoal, 0))),
      WAKTU_MULAI: mulai,
      WAKTU_SELESAI: selesai,
      TOKEN: teks_(data.token).toUpperCase(),
      ACAK_SOAL: yaTidak_(data.acakSoal),
      ACAK_OPSI: yaTidak_(data.acakOpsi),
      TAMPILKAN_NILAI: data.tampilkanNilai === undefined ? 'YA' : yaTidak_(data.tampilkanNilai),
      TAMPILKAN_PEMBAHASAN: yaTidak_(data.tampilkanPembahasan),
      MAKS_PERCOBAAN: Math.max(0, Math.round(angka_(data.maksPercobaan, 1))),
      STATUS: data.aktif === false || teks_(data.status).toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF'
    };

    if (idLama) {
      if (!ubah_('UJIAN', 'ID_UJIAN', idLama, baris)) return gagal_('Ujian tidak ditemukan.');
      catatLog_(sesi, 'UBAH_UJIAN', idLama + ' ' + nama);
      return sukses_({ pesan: 'Ujian diperbarui.', id: idLama });
    }
    baris.ID_UJIAN = buatId_('UJ');
    baris.DIBUAT = Date.now();
    tambah_('UJIAN', baris);
    catatLog_(sesi, 'TAMBAH_UJIAN', baris.ID_UJIAN + ' ' + nama);
    return sukses_({ pesan: 'Ujian ditambahkan.', id: baris.ID_UJIAN });
  });
}

function adminHapusUjian(token, daftarId) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const berjalan = bacaSemua_('SESI_UJIAN').filter(function(s) {
      return daftarId.indexOf(s.ID_UJIAN) !== -1 && teks_(s.STATUS).toUpperCase() === 'BERLANGSUNG';
    }).length;
    if (berjalan) return gagal_('Masih ada ' + berjalan + ' siswa yang sedang mengerjakan ujian ini.');
    const n = hapus_('UJIAN', 'ID_UJIAN', daftarId);
    catatLog_(sesi, 'HAPUS_UJIAN', daftarId.join(', '));
    return sukses_({ pesan: n + ' ujian dihapus. Hasil ujian tetap tersimpan.' });
  });
}

/** Membuat token acak 6 huruf untuk dibacakan pengawas. */
function adminBuatTokenUjian(token, idUjian) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let t = '';
    for (let i = 0; i < 6; i++) t += huruf.charAt(Math.floor(Math.random() * huruf.length));
    if (!ubah_('UJIAN', 'ID_UJIAN', idUjian, { TOKEN: t })) return gagal_('Ujian tidak ditemukan.');
    catatLog_(sesi, 'TOKEN_UJIAN', idUjian);
    return sukses_({ token: t });
  });
}

// -------------------------------------------------------------------
// Hasil
// -------------------------------------------------------------------

function hasilKeKlien_(h, kkm) {
  return {
    id: h.ID_HASIL,
    nisn: h.NISN,
    nama: h.NAMA_SISWA,
    kelas: h.KELAS,
    username: h.USERNAME,
    idUjian: h.ID_UJIAN,
    namaUjian: h.NAMA_UJIAN || h.MATA_PELAJARAN || '-',
    mataPelajaran: h.MATA_PELAJARAN,
    tanggal: h.TANGGAL_UJIAN,
    nilai: h.NILAI,
    benar: h.JUMLAH_BENAR,
    salah: h.JUMLAH_SALAH,
    kosong: h.JUMLAH_KOSONG,
    durasi: h.DURASI_DETIK,
    status: h.STATUS_UJIAN,
    tuntas: kkm > 0 ? Number(h.NILAI) >= kkm : null,
    adaDetail: !!h.JAWABAN
  };
}

function adminDaftarHasil(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    const kkm = angka_(ambilPengaturan_().KKM, 0);
    return sukses_({
      kkm: kkm,
      hasil: bacaSemua_('HASIL_UJIAN')
        .filter(function(h) { return h.ID_HASIL; })
        .sort(function(a, b) { return (b.TANGGAL_UJIAN || 0) - (a.TANGGAL_UJIAN || 0); })
        .map(function(h) { return hasilKeKlien_(h, kkm); })
    });
  });
}

/** Jawaban siswa per soal (huruf asli, bukan acakan). */
function adminDetailHasil(token, idHasil) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    const h = cariSatu_('HASIL_UJIAN', 'ID_HASIL', idHasil);
    if (!h) return gagal_('Hasil tidak ditemukan.');
    const jawaban = parseJson_(h.JAWABAN, null);
    if (!jawaban) return gagal_('Hasil ini tidak menyimpan rincian jawaban.');

    const su = h.ID_SESI ? cariSatu_('SESI_UJIAN', 'ID_SESI', h.ID_SESI) : null;
    const urutanAsli = su ? sesiDariBaris_(su).urutan.map(function(u) { return { i: u.i }; })
      : Object.keys(jawaban).map(function(id) { return { i: id }; });
    return sukses_({
      hasil: hasilKeKlien_(h, angka_(ambilPengaturan_().KKM, 0)),
      soal: susunPembahasan_(urutanAsli, jawaban, petaSoal_(), true)
    });
  });
}

function adminHapusHasil(token, daftarId) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const n = hapus_('HASIL_UJIAN', 'ID_HASIL', daftarId);
    catatLog_(sesi, 'HAPUS_HASIL', daftarId.join(', '));
    return sukses_({ pesan: n + ' hasil dihapus. Siswa dapat mengerjakan ujian itu lagi.' });
  });
}

/**
 * Statistik ujian dan analisis butir soal:
 * tingkat kesukaran (p = proporsi benar) dan sebaran pilihan jawaban.
 */
function analisisUjian_(idUjian) {
  const hasil = bacaSemua_('HASIL_UJIAN').filter(function(h) { return h.ID_UJIAN === idUjian; });
  const kkm = angka_(ambilPengaturan_().KKM, 0);
  const peta = petaSoal_();
  const nilai = hasil.map(function(h) { return Number(h.NILAI) || 0; });
  const butir = {};

  hasil.forEach(function(h) {
    const jawaban = parseJson_(h.JAWABAN, {});
    const su = h.ID_SESI ? cariSatu_('SESI_UJIAN', 'ID_SESI', h.ID_SESI) : null;
    const daftarId = su ? sesiDariBaris_(su).urutan.map(function(u) { return u.i; }) : Object.keys(jawaban);
    daftarId.forEach(function(id) {
      const soal = peta[id];
      if (!soal) return;
      if (!butir[id]) {
        butir[id] = { id: id, pertanyaan: soal.pertanyaan, kunci: soal.kunci, tipe: soal.tipe,
          peserta: 0, benar: 0, kosong: 0, sebaran: { A: 0, B: 0, C: 0, D: 0 } };
      }
      const b = butir[id];
      const jawab = normalisasiKunci_(jawaban[id], soal.tipe);
      b.peserta++;
      if (!jawab) b.kosong++;
      if (jawab && jawab === soal.kunci) b.benar++;
      jawab.split(',').forEach(function(x) { if (b.sebaran[x] !== undefined) b.sebaran[x]++; });
    });
  });

  const daftarButir = Object.keys(butir).map(function(id) {
    const b = butir[id];
    b.p = b.peserta ? Math.round((b.benar / b.peserta) * 100) : 0;
    b.kategori = b.p >= 70 ? 'Mudah' : b.p >= 30 ? 'Sedang' : 'Sukar';
    return b;
  }).sort(function(a, b) { return a.id.localeCompare(b.id); });

  return {
    jumlahPeserta: hasil.length,
    rataRata: nilai.length ? Math.round(nilai.reduce(function(a, b) { return a + b; }, 0) / nilai.length * 10) / 10 : 0,
    tertinggi: nilai.length ? Math.max.apply(null, nilai) : 0,
    terendah: nilai.length ? Math.min.apply(null, nilai) : 0,
    kkm: kkm,
    tuntas: kkm > 0 ? nilai.filter(function(n) { return n >= kkm; }).length : null,
    sebaranNilai: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function(i) {
      return nilai.filter(function(n) { return Math.min(9, Math.floor(n / 10)) === i; }).length;
    }),
    butir: daftarButir
  };
}

function adminAnalisisUjian(token, idUjian) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    const ujian = cariUjian_(idUjian);
    return sukses_({ ujian: ujian, analisis: analisisUjian_(idUjian) });
  });
}

/** Ekspor nilai (dan analisis butir bila satu ujian) ke Google Sheets baru di folder Ekspor. */
function adminEksporHasil(token, idUjian) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const kkm = angka_(ambilPengaturan_().KKM, 0);
    const ujian = idUjian ? cariUjian_(idUjian) : null;
    const hasil = bacaSemua_('HASIL_UJIAN')
      .filter(function(h) { return h.ID_HASIL && (!idUjian || h.ID_UJIAN === idUjian); })
      .sort(function(a, b) {
        return teks_(a.KELAS).localeCompare(teks_(b.KELAS)) || teks_(a.NAMA_SISWA).localeCompare(teks_(b.NAMA_SISWA));
      });

    const lembar = [{
      nama: 'Nilai',
      baris: [['No', 'NISN', 'Nama Siswa', 'Kelas', 'Ujian', 'Mata Pelajaran', 'Tanggal', 'Nilai', 'Benar', 'Salah',
        'Kosong', 'Durasi (menit)', 'Status', 'Keterangan']].concat(hasil.map(function(h, i) {
        return [i + 1, h.NISN, h.NAMA_SISWA, h.KELAS, h.NAMA_UJIAN, h.MATA_PELAJARAN, formatTanggal_(h.TANGGAL_UJIAN),
          h.NILAI, h.JUMLAH_BENAR, h.JUMLAH_SALAH, h.JUMLAH_KOSONG, Math.round((Number(h.DURASI_DETIK) || 0) / 6) / 10,
          h.STATUS_UJIAN, kkm > 0 ? (Number(h.NILAI) >= kkm ? 'Tuntas' : 'Belum tuntas') : ''];
      }))
    }];

    if (ujian) {
      const a = analisisUjian_(idUjian);
      lembar.push({
        nama: 'Analisis Butir',
        baris: [['ID Soal', 'Pertanyaan', 'Kunci', 'Peserta', 'Benar', 'Kosong', '% Benar', 'Kategori', 'Pilih A', 'Pilih B', 'Pilih C', 'Pilih D']]
          .concat(a.butir.map(function(b) {
            return [b.id, b.pertanyaan, b.kunci, b.peserta, b.benar, b.kosong, b.p, b.kategori,
              b.sebaran.A, b.sebaran.B, b.sebaran.C, b.sebaran.D];
          }))
      });
      lembar.push({
        nama: 'Ringkasan',
        baris: [['Keterangan', 'Nilai'], ['Ujian', ujian.nama], ['Mata pelajaran', ujian.mataPelajaran],
          ['Jumlah peserta', a.jumlahPeserta], ['Rata-rata', a.rataRata], ['Tertinggi', a.tertinggi],
          ['Terendah', a.terendah], ['KKM', a.kkm], ['Tuntas', a.tuntas === null ? '-' : a.tuntas]]
      });
    }

    const judul = 'Hasil ' + (ujian ? ujian.nama : 'Semua Ujian') + ' ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
    const r = eksporKeSpreadsheet_(judul, lembar);
    catatLog_(sesi, 'EKSPOR_HASIL', judul);
    return sukses_(r);
  });
}

// -------------------------------------------------------------------
// Monitoring peserta yang sedang ujian
// -------------------------------------------------------------------

function adminMonitor(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    selesaikanSesiKadaluarsa_();
    const sekarang = Date.now();
    const petaUjian = {};
    semuaUjian_().forEach(function(u) { petaUjian[u.id] = u; });

    const sesi = bacaSemua_('SESI_UJIAN').map(sesiDariBaris_)
      .filter(function(s) { return s.status === 'BERLANGSUNG'; })
      .map(function(s) {
        return {
          id: s.id,
          nama: s.namaSiswa,
          kelas: s.kelas,
          username: s.username,
          namaUjian: petaUjian[s.idUjian] ? petaUjian[s.idUjian].nama : s.idUjian,
          jumlahSoal: s.urutan.length,
          terjawab: Object.keys(s.jawaban).length,
          ragu: s.ragu.length,
          waktuMulai: s.waktuMulai,
          sisaDetik: s.batasWaktu ? Math.max(0, Math.floor((s.batasWaktu - sekarang) / 1000)) : null,
          terakhirAktif: s.terakhirAktif
        };
      })
      .sort(function(a, b) { return a.namaUjian.localeCompare(b.namaUjian) || teks_(a.nama).localeCompare(teks_(b.nama)); });
    return sukses_({ sesi: sesi, sekarang: sekarang });
  });
}

/** aksi: KIRIM (paksa selesai), RESET (hapus sesi, siswa mulai ulang), TAMBAH_WAKTU (menit). */
function adminAksiSesi(token, idSesi, aksi, menit) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const baris = cariSatu_('SESI_UJIAN', 'ID_SESI', idSesi);
    if (!baris || teks_(baris.STATUS).toUpperCase() !== 'BERLANGSUNG') return gagal_('Sesi tidak ditemukan atau sudah selesai.');
    const su = sesiDariBaris_(baris);

    if (aksi === 'KIRIM') {
      const r = finalisasiSesi_(su.id, null, 'DIHENTIKAN');
      catatLog_(sesi, 'PAKSA_KIRIM', su.username + ' ' + su.idUjian);
      return sukses_({ pesan: 'Ujian ' + su.namaSiswa + ' dikirim. Nilai: ' + r.nilai.nilai });
    }
    if (aksi === 'RESET') {
      hapus_('SESI_UJIAN', 'ID_SESI', [su.id]);
      catatLog_(sesi, 'RESET_SESI', su.username + ' ' + su.idUjian);
      return sukses_({ pesan: 'Sesi ' + su.namaSiswa + ' direset. Siswa dapat memulai ulang.' });
    }
    if (aksi === 'TAMBAH_WAKTU') {
      if (!su.batasWaktu) return gagal_('Ujian ini tidak memiliki batas waktu.');
      const m = Math.max(1, Math.round(angka_(menit, 10)));
      const dasar = Math.max(su.batasWaktu, Date.now());
      ubah_('SESI_UJIAN', 'ID_SESI', su.id, { BATAS_WAKTU: dasar + m * 60000 });
      catatLog_(sesi, 'TAMBAH_WAKTU', su.username + ' +' + m + ' menit');
      return sukses_({ pesan: 'Waktu ' + su.namaSiswa + ' ditambah ' + m + ' menit.' });
    }
    return gagal_('Aksi tidak dikenal.');
  });
}
