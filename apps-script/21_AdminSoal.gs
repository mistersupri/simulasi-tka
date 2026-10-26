/**
 * API admin: bank soal (tambah, ubah, hapus, impor, gambar di Google Drive).
 */

const KODE_MAPEL_ = {
  'MATEMATIKA': 'MTK',
  'BAHASA INDONESIA': 'BIN',
  'BAHASA INGGRIS': 'BIG',
  'IPA': 'IPA',
  'IPS': 'IPS',
  'IPAS': 'IPAS',
  'PENDIDIKAN PANCASILA': 'PPKN'
};

function kodeMapel_(mapel) {
  const m = teks_(mapel).toUpperCase();
  if (KODE_MAPEL_[m]) return KODE_MAPEL_[m];
  const kata = m.replace(/[^A-Z ]/g, '').split(/\s+/).filter(function(k) { return k; });
  if (kata.length > 1) return kata.map(function(k) { return k.charAt(0); }).join('').slice(0, 4);
  return (kata[0] || 'SOAL').slice(0, 3);
}

/** ID berikutnya, mis. MTK004 bila sudah ada MTK001–MTK003. */
function idSoalBerikutnya_(mapel, sudahDipakai) {
  const kode = kodeMapel_(mapel);
  let maks = 0;
  bacaSemua_('BANK_SOAL').map(function(b) { return b.ID_SOAL; }).concat(Object.keys(sudahDipakai || {}))
    .forEach(function(id) {
      const m = teks_(id).toUpperCase().match(new RegExp('^' + kode + '(\\d+)$'));
      if (m) maks = Math.max(maks, Number(m[1]));
    });
  return kode + ('00' + (maks + 1)).slice(-Math.max(3, String(maks + 1).length));
}

function soalKeKlien_(s) {
  return {
    id: s.id,
    mataPelajaran: s.mataPelajaran,
    kelas: s.kelas,
    pertanyaan: s.pertanyaan,
    opsi: s.opsi,
    kunci: s.kunci,
    skor: s.skor,
    tipe: s.tipe,
    gambarId: s.gambarId,
    pembahasan: s.pembahasan,
    status: s.aktif ? 'AKTIF' : 'NONAKTIF',
    dibuat: s.dibuat
  };
}

function adminDaftarSoal(token) {
  return jalankanAman_(function() {
    butuhAdmin_(token);
    return sukses_({ soal: semuaSoal_().map(soalKeKlien_) });
  });
}

/** Memeriksa data soal dari browser dan mengubahnya menjadi baris BANK_SOAL. */
function barisSoal_(data) {
  const tipe = tipeSoal_(data.tipe);
  const mapel = teks_(data.mataPelajaran);
  const kelas = normalisasiKelas_(data.kelas);
  const pertanyaan = String(data.pertanyaan || '').trim();
  const opsi = (data.opsi || []).map(teks_);
  const kunci = normalisasiKunci_(data.kunci, tipe);
  const skor = angka_(data.skor, 1);

  if (!mapel) throw galat_('Mata pelajaran wajib diisi.');
  if (!kelas) throw galat_('Kelas wajib diisi.');
  if (!pertanyaan) throw galat_('Pertanyaan wajib diisi.');
  if (HURUF_OPSI.some(function(h, i) { return !opsi[i]; })) throw galat_('Opsi A sampai D wajib diisi semua.');
  if (!kunci) throw galat_('Kunci jawaban wajib diisi (A/B/C/D).');
  if (tipe === TIPE_SOAL.PGK && kunci.split(',').length < 2) {
    throw galat_('Soal pilihan ganda kompleks harus memiliki minimal 2 kunci (mis. A,C).');
  }
  if (!(skor > 0)) throw galat_('Skor harus lebih dari 0.');

  return {
    MATA_PELAJARAN: mapel,
    KELAS: kelas,
    PERTANYAAN: pertanyaan,
    OPSI_A: opsi[0], OPSI_B: opsi[1], OPSI_C: opsi[2], OPSI_D: opsi[3],
    KUNCI_JAWABAN: kunci,
    SKOR: String(skor),
    TIPE_SOAL: tipe,
    PEMBAHASAN: String(data.pembahasan || '').trim(),
    STATUS: teks_(data.status).toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF'
  };
}

/** Membuang gambar dari Drive bila tidak dipakai soal lain. */
function buangGambarTakTerpakai_(daftarId) {
  const dipakai = {};
  bacaSemua_('BANK_SOAL').forEach(function(b) { if (b.GAMBAR_ID) dipakai[b.GAMBAR_ID] = true; });
  daftarId.forEach(function(id) { if (id && !dipakai[id]) hapusFileDrive_(id); });
}

/**
 * data = { id, mataPelajaran, kelas, pertanyaan, opsi[4], kunci, skor, tipe,
 *          pembahasan, status, gambarBaru: {nama,mime,base64}?, hapusGambar? }
 */
function adminSimpanSoal(token, data, idLama) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const baris = barisSoal_(data || {});
    const lama = idLama ? cariSatu_('BANK_SOAL', 'ID_SOAL', idLama) : null;
    if (idLama && !lama) return gagal_('Soal tidak ditemukan.');

    const gambarLama = lama ? lama.GAMBAR_ID : '';
    if (data.gambarBaru) {
      baris.GAMBAR_ID = simpanGambar_(data.gambarBaru, 'soal');
    } else if (data.hapusGambar) {
      baris.GAMBAR_ID = '';
    }

    if (lama) {
      ubah_('BANK_SOAL', 'ID_SOAL', idLama, baris);
      if (baris.GAMBAR_ID !== undefined && gambarLama && baris.GAMBAR_ID !== gambarLama) {
        buangGambarTakTerpakai_([gambarLama]);
      }
      catatLog_(sesi, 'UBAH_SOAL', idLama);
      return sukses_({ pesan: 'Soal ' + idLama + ' diperbarui.', id: idLama });
    }

    const id = teks_(data.id).toUpperCase() || idSoalBerikutnya_(baris.MATA_PELAJARAN);
    if (!/^[A-Z0-9_-]{2,30}$/.test(id)) return gagal_('ID soal hanya boleh huruf, angka, _ atau -.');
    if (cariSatu_('BANK_SOAL', 'ID_SOAL', id)) return gagal_('ID soal ' + id + ' sudah dipakai.');
    baris.ID_SOAL = id;
    baris.DIBUAT = Date.now();
    tambah_('BANK_SOAL', baris);
    catatLog_(sesi, 'TAMBAH_SOAL', id);
    return sukses_({ pesan: 'Soal ' + id + ' ditambahkan.', id: id });
  });
}

function adminHapusSoal(token, daftarId) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const target = {};
    daftarId.forEach(function(id) { target[teks_(id).toLowerCase()] = true; });
    const gambar = bacaSemua_('BANK_SOAL')
      .filter(function(b) { return target[teks_(b.ID_SOAL).toLowerCase()] && b.GAMBAR_ID; })
      .map(function(b) { return b.GAMBAR_ID; });

    const n = hapus_('BANK_SOAL', 'ID_SOAL', daftarId);
    buangGambarTakTerpakai_(gambar);
    catatLog_(sesi, 'HAPUS_SOAL', daftarId.join(', '));
    return sukses_({ pesan: n + ' soal dihapus.' });
  });
}

function adminStatusSoal(token, daftarId, status) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    const s = teks_(status).toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';
    daftarId.forEach(function(id) { ubah_('BANK_SOAL', 'ID_SOAL', id, { STATUS: s }); });
    catatLog_(sesi, 'STATUS_SOAL_' + s, daftarId.join(', '));
    return sukses_({ pesan: daftarId.length + ' soal diubah menjadi ' + s + '.' });
  });
}

/**
 * Impor soal dari tabel yang ditempel.
 * baris = [{ nomor, id?, mataPelajaran, kelas, pertanyaan, opsiA..opsiD, kunci, skor?, tipe?, pembahasan? }]
 */
function adminImporSoal(token, baris) {
  return jalankanAman_(function() {
    const sesi = butuhAdmin_(token);
    if (baris.length > 500) return gagal_('Maksimal 500 soal per proses.');

    const baru = [];
    const ditolak = [];
    const dipakai = {};
    bacaSemua_('BANK_SOAL').forEach(function(b) { dipakai[teks_(b.ID_SOAL).toUpperCase()] = true; });
    const idBaru = {};

    baris.forEach(function(b) {
      try {
        const row = barisSoal_({
          mataPelajaran: b.mataPelajaran, kelas: b.kelas, pertanyaan: b.pertanyaan,
          opsi: [b.opsiA, b.opsiB, b.opsiC, b.opsiD], kunci: b.kunci, skor: b.skor,
          tipe: b.tipe, pembahasan: b.pembahasan, status: 'AKTIF'
        });
        let id = teks_(b.id).toUpperCase();
        if (id && dipakai[id]) throw galat_('ID ' + id + ' sudah dipakai.');
        if (!id) id = idSoalBerikutnya_(row.MATA_PELAJARAN, idBaru);
        row.ID_SOAL = id;
        row.DIBUAT = Date.now();
        dipakai[id] = true;
        idBaru[id] = true;
        baru.push(row);
      } catch (e) {
        ditolak.push({ nomor: b.nomor, alasan: e.message });
      }
    });

    tambah_('BANK_SOAL', baru);
    if (baru.length) catatLog_(sesi, 'IMPOR_SOAL', baru.length + ' soal');
    return sukses_({ jumlah: baru.length, ditolak: ditolak });
  });
}
