// Jalankan: npm test
const test = require('node:test');
const assert = require('node:assert');
const { muatKode, databaseContoh, siapkan } = require('./mock-apps-script');

const USER = 'uji_tka';
const PASS = 'LatihanTKA2026!';
const KUNCI = { MTK001: 'B', MTK002: 'C', MTK003: 'C' };

function header(sheet) { return sheet.data[0]; }
function kolom(sheet, nama) { return header(sheet).indexOf(nama); }
function json(x) { return JSON.parse(JSON.stringify(x)); }

/** Menjawab memakai huruf tampil, memperhitungkan opsi yang diacak. */
function jawabBenar(paket, gs) {
  const jawaban = {};
  paket.soal.forEach((s) => {
    const asliIndex = ['A', 'B', 'C', 'D'].indexOf(KUNCI[s.id]);
    const teksBenar = databaseContoh().BANK_SOAL.find((r) => r[0] === s.id)[4 + asliIndex];
    jawaban[s.id] = ['A', 'B', 'C', 'D'][s.opsi.findIndex((o) => o === String(teksBenar))];
  });
  return jawaban;
}

test('setup: membuat lembar, kolom baru, folder Drive, admin, dan ujian latihan', () => {
  const { gs, sheets, passwordAdmin } = siapkan();
  ['UJIAN', 'SESI_UJIAN', 'PENGGUNA', 'PENGATURAN', 'LOG_AKTIVITAS'].forEach((n) => assert.ok(sheets[n], n));
  assert.ok(header(sheets.BANK_SOAL).includes('GAMBAR_ID'));
  assert.ok(header(sheets.HASIL_UJIAN).includes('JAWABAN'));
  // Kolom lama tetap di posisi semula
  assert.deepStrictEqual(header(sheets.DATA_SISWA).slice(0, 7),
    ['NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'PASSWORD_HASH', 'STATUS', 'PASSWORD_SALT']);
  assert.ok(passwordAdmin.length >= 6);
  const ujian = json(gs.adminDaftarUjian(gs.loginAdmin('admin', passwordAdmin).token));
  assert.strictEqual(ujian.ujian.length, 1);
  assert.strictEqual(ujian.ujian[0].nama, 'Latihan Matematika Kelas 6');
  assert.deepStrictEqual(ujian.ujian[0].soalPerKelas, { 6: 3 });
  // setup aman dijalankan ulang
  gs.setupAplikasi();
  assert.strictEqual(sheets.PENGGUNA.data.length, 2);
  assert.strictEqual(sheets.UJIAN.data.length, 2);
});

test('siswa: login akun lama, beranda, mulai, simpan otomatis, kirim', () => {
  const { gs, sheets } = siapkan();
  const login = gs.loginSiswa(USER, PASS);
  assert.strictEqual(login.berhasil, true, login.pesan);
  assert.strictEqual(login.profil.kelas, '6');

  const beranda = json(gs.siswaBeranda(login.token));
  assert.strictEqual(beranda.ujian.length, 1);
  assert.strictEqual(beranda.ujian[0].status, 'TERSEDIA');
  assert.strictEqual(beranda.ujian[0].jumlahSoal, 3);

  const mulai = json(gs.siswaMulaiUjian(login.token, beranda.ujian[0].id, ''));
  assert.strictEqual(mulai.berhasil, true, mulai.pesan);
  const paket = mulai.paket;
  assert.strictEqual(paket.soal.length, 3);
  assert.ok(paket.sisaDetik > 3500);
  paket.soal.forEach((s) => assert.strictEqual(s.kunci, undefined));
  assert.deepStrictEqual(paket.soal.find((s) => s.id === 'MTK002').opsi, ['4/6', '1/4', '5/4', '3/8']);

  // simpan otomatis lalu lanjutkan (mis. setelah koneksi putus)
  assert.strictEqual(gs.siswaSimpanJawaban(login.token, paket.idSesi, { MTK001: 'B' }, ['MTK001']).berhasil, true);
  const lanjut = json(gs.siswaMulaiUjian(login.token, beranda.ujian[0].id, ''));
  assert.strictEqual(lanjut.paket.idSesi, paket.idSesi);
  assert.deepStrictEqual(lanjut.paket.jawaban, { MTK001: 'B' });
  assert.deepStrictEqual(lanjut.paket.ragu, ['MTK001']);

  const kirim = json(gs.siswaKirimUjian(login.token, paket.idSesi, { MTK001: 'B', MTK002: 'A' }, []));
  assert.strictEqual(kirim.berhasil, true, kirim.pesan);
  assert.strictEqual(kirim.hasil.nilai, 33);
  assert.strictEqual(kirim.hasil.jumlahBenar, 1);
  assert.strictEqual(kirim.hasil.jumlahSalah, 1);
  assert.strictEqual(kirim.hasil.jumlahKosong, 1);
  assert.strictEqual(kirim.hasil.pembahasan, null);

  const h = sheets.HASIL_UJIAN.data[1];
  assert.strictEqual(h[kolom(sheets.HASIL_UJIAN, 'NISN')], 'UJI001');
  assert.strictEqual(h[kolom(sheets.HASIL_UJIAN, 'NILAI')], 33);
  assert.strictEqual(h[kolom(sheets.HASIL_UJIAN, 'MATA_PELAJARAN')], 'Matematika');

  // Tidak bisa kirim dua kali, dan percobaan habis
  assert.strictEqual(gs.siswaKirimUjian(login.token, paket.idSesi, {}, []).berhasil, false);
  const b2 = json(gs.siswaBeranda(login.token));
  assert.strictEqual(b2.ujian[0].status, 'SELESAI');
  assert.strictEqual(b2.riwayat[0].nilai, 33);
  assert.strictEqual(gs.siswaMulaiUjian(login.token, beranda.ujian[0].id, '').berhasil, false);
});

test('opsi diacak: penilaian tetap benar, pembahasan memakai huruf tampil', () => {
  const env = siapkan();
  const { gs, tokenAdmin } = env;
  const u = gs.adminSimpanUjian(tokenAdmin, {
    nama: 'TO 1', mataPelajaran: 'Matematika', kelas: '6', durasiMenit: 30, acakSoal: true, acakOpsi: true,
    tampilkanNilai: true, tampilkanPembahasan: true, maksPercobaan: 0, token: 'abc123'
  });
  assert.strictEqual(u.berhasil, true, u.pesan);
  const t = gs.loginSiswa(USER, PASS).token;
  assert.strictEqual(gs.siswaMulaiUjian(t, u.id, 'SALAH').berhasil, false);
  const paket = json(gs.siswaMulaiUjian(t, u.id, 'ABC123')).paket;
  const jawaban = jawabBenar(paket);
  const kirim = json(gs.siswaKirimUjian(t, paket.idSesi, jawaban, []));
  assert.strictEqual(kirim.hasil.nilai, 100);
  kirim.hasil.pembahasan.forEach((p) => {
    assert.strictEqual(p.benar, true);
    assert.strictEqual(p.jawaban, p.kunci);
  });
  // maksPercobaan 0 = tanpa batas
  assert.strictEqual(gs.siswaMulaiUjian(t, u.id, 'ABC123').berhasil, true);
});

test('jadwal & batas waktu: belum dibuka, ditutup, kirim terlambat memakai jawaban tersimpan', () => {
  const { gs, tokenAdmin, sheets } = siapkan();
  const besok = Date.now() + 86400000;
  const u1 = gs.adminSimpanUjian(tokenAdmin, { nama: 'Besok', mataPelajaran: 'Matematika', kelas: '6', waktuMulai: besok });
  const u2 = gs.adminSimpanUjian(tokenAdmin, { nama: 'Lalu', mataPelajaran: 'Matematika', kelas: '6', waktuSelesai: Date.now() - 1000 });
  const t = gs.loginSiswa(USER, PASS).token;
  const status = Object.fromEntries(json(gs.siswaBeranda(t)).ujian.map((u) => [u.nama, u.status]));
  assert.strictEqual(status.Besok, 'BELUM_DIBUKA');
  assert.strictEqual(status.Lalu, 'DITUTUP');
  assert.strictEqual(gs.siswaMulaiUjian(t, u1.id).berhasil, false);
  assert.strictEqual(gs.siswaMulaiUjian(t, u2.id).berhasil, false);

  const u3 = gs.adminSimpanUjian(tokenAdmin, { nama: 'Singkat', mataPelajaran: 'Matematika', kelas: '6', durasiMenit: 1 });
  const paket = json(gs.siswaMulaiUjian(t, u3.id)).paket;
  gs.siswaSimpanJawaban(t, paket.idSesi, { MTK001: 'B' }, []);
  // majukan waktu: BATAS_WAKTU dibuat sudah lewat jauh
  const s = sheets.SESI_UJIAN;
  const baris = s.data.find((r) => r[0] === paket.idSesi);
  baris[kolom(s, 'BATAS_WAKTU')] = new Date(Date.now() - 10 * 60000);
  const kirim = json(gs.siswaKirimUjian(t, paket.idSesi, KUNCI, []));
  assert.strictEqual(kirim.hasil.jumlahBenar, 1, 'hanya jawaban tersimpan yang dinilai');
  assert.strictEqual(kirim.hasil.statusUjian, 'WAKTU_HABIS');
});

test('admin: CRUD siswa, impor, reset password, status', () => {
  const { gs, tokenAdmin } = siapkan();
  const tambah = json(gs.adminSimpanSiswa(tokenAdmin, { nama: 'Budi Santoso', kelas: 'Kelas 6', nisn: '111' }));
  assert.strictEqual(tambah.berhasil, true, tambah.pesan);
  const akun = tambah.akun[0];
  assert.match(akun.username, /^budi\d{3}$/);
  assert.strictEqual(gs.loginSiswa(akun.username, akun.password).berhasil, true);

  const impor = json(gs.adminImporSiswa(tokenAdmin, [
    { nomor: 1, nisn: '1', nama: 'Ani', kelas: '6', username: 'ani', password: 'aniani' },
    { nomor: 2, nisn: '2', nama: 'Cici', kelas: '5' },
    { nomor: 3, nama: '', kelas: '6' },
    { nomor: 4, nama: 'Dobel', kelas: '6', username: 'ani' }
  ]));
  assert.strictEqual(impor.akun.length, 2);
  assert.deepStrictEqual(impor.ditolak.map((d) => d.nomor), [3, 4]);
  assert.strictEqual(gs.loginSiswa('ani', 'aniani').berhasil, true);

  const reset = json(gs.adminResetPasswordSiswa(tokenAdmin, ['ani']));
  assert.strictEqual(gs.loginSiswa('ani', 'aniani').berhasil, false);
  assert.strictEqual(gs.loginSiswa('ani', reset.akun[0].password).berhasil, true);

  gs.adminStatusSiswa(tokenAdmin, ['ani'], 'NONAKTIF');
  assert.strictEqual(gs.loginSiswa('ani', reset.akun[0].password).berhasil, false);

  gs.adminSimpanSiswa(tokenAdmin, { nama: 'Ani Lestari', kelas: '6', status: 'AKTIF', password: 'baru123' }, 'ani');
  const daftar = json(gs.adminDaftarSiswa(tokenAdmin)).siswa;
  assert.strictEqual(daftar.find((s) => s.username === 'ani').nama, 'Ani Lestari');
  assert.ok(daftar.every((s) => s.PASSWORD_HASH === undefined));

  assert.strictEqual(gs.adminHapusSiswa(tokenAdmin, ['ani']).berhasil, true);
  assert.strictEqual(json(gs.adminDaftarSiswa(tokenAdmin)).siswa.length, daftar.length - 1);
});

test('admin: bank soal dengan gambar di Drive, PGK, impor, hapus', () => {
  const { gs, tokenAdmin, drive, sheets } = siapkan();
  const gambar = { nama: 'a.png', mime: 'image/png', base64: Buffer.from('gambar').toString('base64') };
  const r = gs.adminSimpanSoal(tokenAdmin, {
    mataPelajaran: 'Matematika', kelas: '6', pertanyaan: 'Pilih bilangan genap', opsi: ['2', '3', '4', '5'],
    kunci: 'C, A', tipe: 'PGK', skor: 2, gambarBaru: gambar
  });
  assert.strictEqual(r.berhasil, true, r.pesan);
  assert.strictEqual(r.id, 'MTK004');
  const soal = json(gs.adminDaftarSoal(tokenAdmin)).soal.find((s) => s.id === 'MTK004');
  assert.strictEqual(soal.kunci, 'A,C');
  assert.ok(drive.files[soal.gambarId]);

  // Siswa melihat gambar lewat ambilGambar, bukan file lain di Drive
  const t = gs.loginSiswa(USER, PASS).token;
  assert.ok(gs.ambilGambar(t, soal.gambarId).dataUrl.startsWith('data:image/png;base64,'));

  // Opsi "3/4" tersimpan sebagai teks
  const r2 = gs.adminSimpanSoal(tokenAdmin, {
    mataPelajaran: 'Matematika', kelas: '6', pertanyaan: '1/2 + 1/4 = ...', opsi: ['3/4', '2/6', '1/8', '2/4'], kunci: 'A'
  });
  assert.strictEqual(r2.id, 'MTK005');
  const baris = sheets.BANK_SOAL.data.find((x) => x[0] === 'MTK005');
  assert.strictEqual(baris[kolom(sheets.BANK_SOAL, 'OPSI_A')], '3/4');

  // PGK dinilai benar hanya bila semua pilihan tepat
  const u = gs.adminSimpanUjian(tokenAdmin, { nama: 'PGK', mataPelajaran: 'Matematika', kelas: '6', maksPercobaan: 0 });
  let paket = json(gs.siswaMulaiUjian(t, u.id)).paket;
  let k = json(gs.siswaKirimUjian(t, paket.idSesi, { MTK004: ['A', 'C'] }, []));
  assert.strictEqual(k.hasil.jumlahBenar, 1);
  paket = json(gs.siswaMulaiUjian(t, u.id)).paket;
  k = json(gs.siswaKirimUjian(t, paket.idSesi, { MTK004: ['A'] }, []));
  assert.strictEqual(k.hasil.jumlahBenar, 0);

  const impor = json(gs.adminImporSoal(tokenAdmin, [
    { nomor: 1, mataPelajaran: 'Bahasa Indonesia', kelas: '6', pertanyaan: 'Sinonim besar?', opsiA: 'kecil', opsiB: 'agung', opsiC: 'pendek', opsiD: 'tipis', kunci: 'b' },
    { nomor: 2, mataPelajaran: 'Bahasa Indonesia', kelas: '6', pertanyaan: 'Tanpa kunci', opsiA: '1', opsiB: '2', opsiC: '3', opsiD: '4', kunci: '' }
  ]));
  assert.strictEqual(impor.jumlah, 1);
  assert.strictEqual(impor.ditolak[0].nomor, 2);
  assert.ok(json(gs.adminDaftarSoal(tokenAdmin)).soal.some((s) => s.id === 'BIN001' && s.kunci === 'B'));

  gs.adminHapusSoal(tokenAdmin, ['MTK004']);
  assert.strictEqual(drive.files[soal.gambarId].trashed, true);
});

test('admin: hasil, detail, analisis butir, ekspor, hapus hasil', () => {
  const { gs, tokenAdmin, dibuat } = siapkan();
  const idUjian = json(gs.adminDaftarUjian(tokenAdmin)).ujian[0].id;
  const t = gs.loginSiswa(USER, PASS).token;
  const paket = json(gs.siswaMulaiUjian(t, idUjian)).paket;
  gs.siswaKirimUjian(t, paket.idSesi, { MTK001: 'B', MTK002: 'D' }, []);

  const hasil = json(gs.adminDaftarHasil(tokenAdmin));
  assert.strictEqual(hasil.hasil.length, 1);
  assert.strictEqual(hasil.hasil[0].tuntas, false);

  const detail = json(gs.adminDetailHasil(tokenAdmin, hasil.hasil[0].id));
  assert.strictEqual(detail.soal.length, 3);
  assert.strictEqual(detail.soal.find((s) => s.id === 'MTK002').jawaban, 'D');

  const a = json(gs.adminAnalisisUjian(tokenAdmin, idUjian)).analisis;
  assert.strictEqual(a.jumlahPeserta, 1);
  assert.strictEqual(a.butir.find((b) => b.id === 'MTK001').p, 100);
  assert.strictEqual(a.butir.find((b) => b.id === 'MTK002').sebaran.D, 1);

  const e = gs.adminEksporHasil(tokenAdmin, idUjian);
  assert.strictEqual(e.berhasil, true, e.pesan);
  assert.strictEqual(dibuat[0].getSheets().length, 3);

  gs.adminHapusHasil(tokenAdmin, [hasil.hasil[0].id]);
  assert.strictEqual(json(gs.siswaBeranda(t)).ujian[0].status, 'TERSEDIA');
});

test('admin: monitoring, tambah waktu, paksa kirim, reset sesi', () => {
  const { gs, tokenAdmin } = siapkan();
  const idUjian = json(gs.adminDaftarUjian(tokenAdmin)).ujian[0].id;
  const t = gs.loginSiswa(USER, PASS).token;
  const paket = json(gs.siswaMulaiUjian(t, idUjian)).paket;
  gs.siswaSimpanJawaban(t, paket.idSesi, { MTK001: 'B' }, []);

  let mon = json(gs.adminMonitor(tokenAdmin)).sesi;
  assert.strictEqual(mon.length, 1);
  assert.strictEqual(mon[0].terjawab, 1);
  const sisa = mon[0].sisaDetik;
  gs.adminAksiSesi(tokenAdmin, paket.idSesi, 'TAMBAH_WAKTU', 10);
  assert.ok(json(gs.adminMonitor(tokenAdmin)).sesi[0].sisaDetik >= sisa + 590);

  gs.adminAksiSesi(tokenAdmin, paket.idSesi, 'RESET');
  assert.strictEqual(json(gs.adminMonitor(tokenAdmin)).sesi.length, 0);

  const p2 = json(gs.siswaMulaiUjian(t, idUjian)).paket;
  assert.notStrictEqual(p2.idSesi, paket.idSesi);
  const r = json(gs.adminAksiSesi(tokenAdmin, p2.idSesi, 'KIRIM'));
  assert.strictEqual(r.berhasil, true, r.pesan);
  assert.strictEqual(json(gs.adminDaftarHasil(tokenAdmin)).hasil[0].status, 'DIHENTIKAN');
});

test('peran & sesi: guru dibatasi, token palsu ditolak, admin terakhir dilindungi', () => {
  const { gs, tokenAdmin } = siapkan();
  assert.strictEqual(gs.adminDashboard('palsu').sesiBerakhir, true);
  const t = gs.loginSiswa(USER, PASS).token;
  assert.strictEqual(gs.adminDashboard(t).sesiBerakhir, true, 'token siswa tidak boleh akses admin');

  const g = json(gs.adminSimpanPengguna(tokenAdmin, { nama: 'Bu Guru', username: 'guru1', peran: 'GURU', password: 'guru123' }));
  assert.strictEqual(g.berhasil, true, g.pesan);
  const tg = gs.loginAdmin('guru1', 'guru123').token;
  assert.strictEqual(gs.adminDashboard(tg).berhasil, true);
  assert.strictEqual(gs.adminDaftarSoal(tg).berhasil, true);
  assert.strictEqual(gs.adminDaftarSiswa(tg).berhasil, false);
  assert.strictEqual(gs.adminSimpanPengaturan(tg, { KKM: 80 }).berhasil, false);

  const admin = json(gs.adminDaftarPengguna(tokenAdmin)).pengguna.find((p) => p.username === 'admin');
  assert.strictEqual(gs.adminHapusPengguna(tokenAdmin, [admin.id]).berhasil, false);
  assert.strictEqual(gs.adminSimpanPengguna(tokenAdmin, { nama: 'A', peran: 'GURU' }, admin.id).berhasil, false);
});

test('keamanan login: akun terkunci setelah 5 kali salah', () => {
  const { gs } = siapkan();
  for (let i = 0; i < 5; i++) gs.loginSiswa(USER, 'salah');
  const r = gs.loginSiswa(USER, PASS);
  assert.strictEqual(r.berhasil, false);
  assert.match(r.pesan, /Terlalu banyak/);
});

test('pengaturan, logo, ganti password sendiri, backup, log', () => {
  const { gs, tokenAdmin, passwordAdmin, pemicu } = siapkan();
  assert.strictEqual(gs.adminSimpanPengaturan(tokenAdmin, { NAMA_SEKOLAH: 'SD Uji', KKM: '75', FOLDER_ID: 'x' }).berhasil, true);
  assert.strictEqual(gs.infoAplikasi().namaSekolah, 'SD Uji');
  assert.strictEqual(gs.adminSimpanPengaturan(tokenAdmin, { KKM: '200' }).berhasil, false);
  assert.notStrictEqual(json(gs.adminAmbilPengaturan(tokenAdmin)).pengaturan.FOLDER_ID, 'x');

  const logo = gs.adminUnggahLogo(tokenAdmin, { nama: 'logo.png', mime: 'image/png', base64: 'aGFsbw==' });
  assert.strictEqual(logo.berhasil, true, logo.pesan);
  assert.strictEqual(gs.ambilLogo().berhasil, true);
  assert.strictEqual(gs.adminUnggahLogo(tokenAdmin, { nama: 'x.exe', mime: 'application/x-msdownload', base64: 'aA==' }).berhasil, false);

  assert.strictEqual(gs.gantiPasswordSendiri(tokenAdmin, 'salah', 'barubaru').berhasil, false);
  assert.strictEqual(gs.gantiPasswordSendiri(tokenAdmin, passwordAdmin, 'barubaru').berhasil, true);
  assert.strictEqual(gs.loginAdmin('admin', 'barubaru').berhasil, true);

  const ts = gs.loginSiswa(USER, PASS).token;
  assert.strictEqual(gs.gantiPasswordSendiri(ts, PASS, 'siswa123').berhasil, true);
  gs.adminSimpanPengaturan(tokenAdmin, { SISWA_BOLEH_GANTI_PASSWORD: 'TIDAK' });
  assert.strictEqual(gs.gantiPasswordSendiri(ts, 'siswa123', 'lagi1234').berhasil, false);

  assert.strictEqual(gs.adminBackupSekarang(tokenAdmin).berhasil, true);
  gs.adminAturBackupHarian(tokenAdmin, true);
  assert.strictEqual(pemicu.length, 1);
  gs.adminAturBackupHarian(tokenAdmin, false);
  assert.strictEqual(pemicu.length, 0);

  const log = json(gs.adminDaftarLog(tokenAdmin)).log;
  assert.ok(log.some((l) => l.aksi === 'BACKUP'));
});

test('database tanpa setup memberi pesan yang jelas', () => {
  const { gs } = muatKode(databaseContoh());
  const r = gs.loginAdmin('admin', 'x');
  assert.strictEqual(r.berhasil, false);
  assert.match(r.pesan, /setupAplikasi/);
});
