/**
 * API halaman siswa (dipanggil lewat google.script.run).
 */

function infoAplikasi() {
  return jalankanAman_(function() {
    const p = ambilPengaturan_();
    return sukses_({
      namaSekolah: p.NAMA_SEKOLAH,
      tahunAjaran: p.TAHUN_AJARAN,
      pengumuman: p.PENGUMUMAN,
      logoId: p.LOGO_ID
    });
  });
}

/** Status ujian untuk satu siswa. */
function statusUjianSiswa_(ujian, jumlahSelesai, sesiBerjalan, sekarang) {
  if (sesiBerjalan) return 'BERLANGSUNG';
  if (ujian.maksPercobaan > 0 && jumlahSelesai >= ujian.maksPercobaan) return 'SELESAI';
  if (ujian.waktuMulai && sekarang < ujian.waktuMulai) return 'BELUM_DIBUKA';
  if (ujian.waktuSelesai && sekarang > ujian.waktuSelesai) return 'DITUTUP';
  return 'TERSEDIA';
}

function siswaBeranda(token) {
  return jalankanAman_(function() {
    const sesi = butuhSiswa_(token);
    selesaikanSesiKadaluarsa_(function(s) { return s.username === sesi.username; });

    const sekarang = Date.now();
    const hasilSaya = bacaSemua_('HASIL_UJIAN').filter(function(h) {
      return teks_(h.USERNAME).toLowerCase() === sesi.username.toLowerCase() ||
        (!h.USERNAME && h.NISN && h.NISN === sesi.nisn);
    });
    const sesiSaya = bacaSemua_('SESI_UJIAN').map(sesiDariBaris_).filter(function(s) {
      return s.username === sesi.username && s.status === 'BERLANGSUNG';
    });
    const semua = semuaUjian_();
    const petaUjian = {};
    semua.forEach(function(u) { petaUjian[u.id] = u; });

    const daftarUjian = semua
      .filter(function(u) { return u.aktif && kelasCocok_(u.kelas, sesi.kelas); })
      .map(function(u) {
        const selesai = hasilSaya.filter(function(h) { return h.ID_UJIAN === u.id; }).length;
        const berjalan = sesiSaya.filter(function(s) { return s.idUjian === u.id; })[0];
        const tersedia = soalUntuk_(u.mataPelajaran, sesi.kelas).length;
        return {
          id: u.id,
          nama: u.nama,
          mataPelajaran: u.mataPelajaran,
          durasiMenit: u.durasiMenit,
          jumlahSoal: u.jumlahSoal > 0 ? Math.min(u.jumlahSoal, tersedia) : tersedia,
          waktuMulai: u.waktuMulai,
          waktuSelesai: u.waktuSelesai,
          perluToken: !!u.token,
          maksPercobaan: u.maksPercobaan,
          jumlahSelesai: selesai,
          status: statusUjianSiswa_(u, selesai, berjalan, sekarang)
        };
      })
      .filter(function(u) { return u.jumlahSoal > 0 || u.status === 'BERLANGSUNG'; })
      .sort(function(a, b) { return (a.waktuMulai || 0) - (b.waktuMulai || 0) || a.nama.localeCompare(b.nama); });

    const kkm = angka_(ambilPengaturan_().KKM, 0);
    const riwayat = hasilSaya
      .sort(function(a, b) { return (b.TANGGAL_UJIAN || 0) - (a.TANGGAL_UJIAN || 0); })
      .map(function(h) {
        const u = petaUjian[h.ID_UJIAN];
        const boleh = !u || u.tampilkanNilai;
        return {
          id: h.ID_HASIL,
          namaUjian: h.NAMA_UJIAN || (u && u.nama) || h.MATA_PELAJARAN || 'Ujian',
          mataPelajaran: h.MATA_PELAJARAN,
          tanggal: h.TANGGAL_UJIAN,
          nilai: boleh ? h.NILAI : null,
          tuntas: boleh && kkm > 0 ? h.NILAI >= kkm : null,
          adaPembahasan: !!(u && u.tampilkanPembahasan && h.JAWABAN && h.ID_SESI)
        };
      });

    return sukses_({ profil: profilSiswa_(sesi), pengumuman: ambilPengaturan_().PENGUMUMAN, ujian: daftarUjian, riwayat: riwayat });
  });
}

/** Paket yang dikirim ke browser: soal tanpa kunci, dengan huruf tampil. */
function paketUjian_(sesiUjian, ujian) {
  const peta = petaSoal_();
  const soal = sesiUjian.urutan.map(function(item) {
    const s = peta[item.i];
    if (!s) return null;
    return {
      id: s.id,
      tipe: s.tipe,
      pertanyaan: s.pertanyaan,
      gambarId: s.gambarId,
      opsi: (item.o || [0, 1, 2, 3]).map(function(k) { return s.opsi[k]; })
    };
  }).filter(function(x) { return x; });

  const jawaban = {};
  sesiUjian.urutan.forEach(function(item) {
    if (sesiUjian.jawaban[item.i]) jawaban[item.i] = keHurufTampil_(item, sesiUjian.jawaban[item.i]);
  });

  return {
    idSesi: sesiUjian.id,
    idUjian: ujian.id,
    namaUjian: ujian.nama,
    mataPelajaran: ujian.mataPelajaran,
    soal: soal,
    jawaban: jawaban,
    ragu: sesiUjian.ragu,
    sisaDetik: sesiUjian.batasWaktu ? Math.max(0, Math.floor((sesiUjian.batasWaktu - Date.now()) / 1000)) : null
  };
}

function siswaMulaiUjian(token, idUjian, tokenUjian) {
  return jalankanAman_(function() {
    const sesi = butuhSiswa_(token);
    selesaikanSesiKadaluarsa_(function(s) { return s.username === sesi.username; });

    const ujian = cariUjian_(idUjian);
    if (!ujian || !ujian.aktif || !kelasCocok_(ujian.kelas, sesi.kelas)) {
      return gagal_('Ujian tidak ditemukan.');
    }

    // Lanjutkan ujian yang belum selesai (mis. setelah koneksi putus).
    const berjalan = bacaSemua_('SESI_UJIAN').map(sesiDariBaris_).filter(function(s) {
      return s.username === sesi.username && s.idUjian === ujian.id && s.status === 'BERLANGSUNG';
    })[0];
    if (berjalan) return sukses_({ paket: paketUjian_(berjalan, ujian) });

    const sekarang = Date.now();
    const selesai = bacaSemua_('HASIL_UJIAN').filter(function(h) {
      return h.ID_UJIAN === ujian.id && teks_(h.USERNAME).toLowerCase() === sesi.username.toLowerCase();
    }).length;
    const status = statusUjianSiswa_(ujian, selesai, null, sekarang);
    if (status === 'SELESAI') return gagal_('Kamu sudah menyelesaikan ujian ini.');
    if (status === 'BELUM_DIBUKA') return gagal_('Ujian belum dibuka. Dibuka pada ' + formatTanggal_(ujian.waktuMulai) + '.');
    if (status === 'DITUTUP') return gagal_('Waktu ujian sudah berakhir.');

    if (ujian.token && teks_(tokenUjian).toUpperCase() !== ujian.token) {
      return gagal_('Token ujian salah. Tanyakan token kepada pengawas.');
    }

    let soal = soalUntuk_(ujian.mataPelajaran, sesi.kelas);
    if (!soal.length) return gagal_('Belum ada soal untuk ujian ini.');
    if (ujian.acakSoal) soal = acak_(soal);
    if (ujian.jumlahSoal > 0) soal = soal.slice(0, ujian.jumlahSoal);

    const urutan = soal.map(function(s) {
      return { i: s.id, o: ujian.acakOpsi ? acak_([0, 1, 2, 3]) : [0, 1, 2, 3] };
    });

    let batas = ujian.durasiMenit > 0 ? sekarang + ujian.durasiMenit * 60000 : null;
    if (ujian.waktuSelesai) batas = batas ? Math.min(batas, ujian.waktuSelesai) : ujian.waktuSelesai;

    const baru = {
      ID_SESI: Utilities.getUuid(),
      ID_UJIAN: ujian.id,
      USERNAME: sesi.username,
      NISN: sesi.nisn,
      NAMA_SISWA: sesi.nama,
      KELAS: sesi.kelas,
      WAKTU_MULAI: sekarang,
      BATAS_WAKTU: batas,
      URUTAN: JSON.stringify(urutan),
      JAWABAN: '{}',
      RAGU: '[]',
      STATUS: 'BERLANGSUNG',
      TERAKHIR_AKTIF: sekarang
    };
    tambah_('SESI_UJIAN', baru);
    return sukses_({ paket: paketUjian_(sesiDariBaris_(baru), ujian) });
  });
}

function sesiUjianMilik_(sesi, idSesi) {
  const baris = cariSatu_('SESI_UJIAN', 'ID_SESI', idSesi);
  if (!baris || baris.USERNAME !== sesi.username) throw galat_('Sesi ujian tidak ditemukan.');
  return sesiDariBaris_(baris);
}

/** Simpan otomatis (dipanggil berkala dari browser). */
function siswaSimpanJawaban(token, idSesi, jawaban, ragu) {
  return jalankanAman_(function() {
    const sesi = butuhSiswa_(token);
    const su = sesiUjianMilik_(sesi, idSesi);
    if (su.status !== 'BERLANGSUNG') return gagal_('Ujian sudah selesai.');
    if (sesiKadaluarsa_(su, Date.now())) return gagal_('Waktu ujian sudah habis.');

    ubah_('SESI_UJIAN', 'ID_SESI', su.id, {
      JAWABAN: JSON.stringify(jawabanKeAsli_(su.urutan, jawaban)),
      RAGU: JSON.stringify(raguValid_(su.urutan, ragu)),
      TERAKHIR_AKTIF: Date.now()
    });
    return sukses_({
      sisaDetik: su.batasWaktu ? Math.max(0, Math.floor((su.batasWaktu - Date.now()) / 1000)) : null
    });
  });
}

function hasilUntukSiswa_(ujian, nilai, hasil, urutan, jawaban) {
  const peta = petaSoal_();
  const kkm = angka_(ambilPengaturan_().KKM, 0);
  const boleh = !!ujian.tampilkanNilai;
  return {
    namaUjian: ujian.nama,
    mataPelajaran: ujian.mataPelajaran,
    tampilkanNilai: boleh,
    nilai: boleh ? nilai.nilai : null,
    jumlahSoal: nilai.jumlahSoal,
    jumlahBenar: boleh ? nilai.jumlahBenar : null,
    jumlahSalah: boleh ? nilai.jumlahSalah - nilai.jumlahKosong : null,
    jumlahKosong: nilai.jumlahKosong,
    durasiDetik: hasil.DURASI_DETIK,
    statusUjian: hasil.STATUS_UJIAN,
    kkm: kkm,
    tuntas: boleh && kkm > 0 ? nilai.nilai >= kkm : null,
    pembahasan: ujian.tampilkanPembahasan ? susunPembahasan_(urutan, jawaban, peta, true) : null
  };
}

function siswaKirimUjian(token, idSesi, jawaban, ragu) {
  return jalankanAman_(function() {
    const sesi = butuhSiswa_(token);
    const su = sesiUjianMilik_(sesi, idSesi);
    if (su.status !== 'BERLANGSUNG') return gagal_('Ujian ini sudah dikirim sebelumnya.');

    // Lewat batas waktu + toleransi: pakai jawaban terakhir yang tersimpan.
    const terlambat = sesiKadaluarsa_(su, Date.now());
    const jawabanAsli = terlambat ? null : jawabanKeAsli_(su.urutan, jawaban);
    const habis = su.batasWaktu && Date.now() >= su.batasWaktu;
    const r = finalisasiSesi_(su.id, jawabanAsli, habis ? 'WAKTU_HABIS' : 'SELESAI');

    return sukses_({ hasil: hasilUntukSiswa_(r.ujian, r.nilai, r.hasil, su.urutan, r.jawaban) });
  });
}

/** Melihat ulang hasil & pembahasan dari riwayat. */
function siswaLihatHasil(token, idHasil) {
  return jalankanAman_(function() {
    const sesi = butuhSiswa_(token);
    const h = cariSatu_('HASIL_UJIAN', 'ID_HASIL', idHasil);
    if (!h || teks_(h.USERNAME).toLowerCase() !== sesi.username.toLowerCase()) return gagal_('Hasil tidak ditemukan.');

    const ujian = cariUjian_(h.ID_UJIAN);
    if (!ujian) return gagal_('Data ujian sudah dihapus.');
    const su = cariSatu_('SESI_UJIAN', 'ID_SESI', h.ID_SESI);
    const urutan = su ? sesiDariBaris_(su).urutan : [];
    const jawaban = parseJson_(h.JAWABAN, {});
    const nilai = {
      nilai: h.NILAI, jumlahSoal: h.JUMLAH_BENAR + h.JUMLAH_SALAH,
      jumlahBenar: h.JUMLAH_BENAR, jumlahSalah: h.JUMLAH_SALAH, jumlahKosong: angka_(h.JUMLAH_KOSONG, 0)
    };
    return sukses_({ hasil: hasilUntukSiswa_(ujian, nilai, h, urutan, jawaban) });
  });
}
