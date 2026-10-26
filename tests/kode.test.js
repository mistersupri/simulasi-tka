// Jalankan: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { muatKode, databaseContoh } = require('./mock-apps-script');

const USER = 'uji_tka';
const PASS = 'LatihanTKA2026!';

test('login dengan akun uji dari database', () => {
  const { gs } = muatKode(databaseContoh());
  const hasil = gs.loginSiswa(USER, PASS);
  assert.strictEqual(hasil.berhasil, true, hasil.pesan);
  assert.strictEqual(hasil.namaSiswa, 'Siswa Uji');
  assert.strictEqual(hasil.kelas, '6');
  assert.deepStrictEqual(Array.from(hasil.daftarMapel), ['Matematika']);
  assert.ok(hasil.token);
});

test('login gagal untuk password salah, akun nonaktif, dan input kosong', () => {
  const db = databaseContoh();
  const { gs } = muatKode(db);
  assert.strictEqual(gs.loginSiswa(USER, 'salah').berhasil, false);
  assert.strictEqual(gs.loginSiswa('', '').berhasil, false);
  assert.strictEqual(gs.loginSiswa('tidak_ada', PASS).berhasil, false);
  db.DATA_SISWA[1][5] = 'NONAKTIF';
  assert.strictEqual(gs.loginSiswa(USER, PASS).berhasil, false);
});

test('soal dikirim tanpa kunci jawaban, opsi pecahan terbaca benar', () => {
  const { gs } = muatKode(databaseContoh());
  const { token } = gs.loginSiswa(USER, PASS);
  const ujian = gs.mulaiUjian(token, 'matematika');
  assert.strictEqual(ujian.berhasil, true, ujian.pesan);
  assert.strictEqual(ujian.soal.length, 3);
  ujian.soal.forEach((s) => {
    assert.strictEqual(s.kunci, undefined);
    assert.strictEqual(s.skor, undefined);
  });
  const mtk002 = ujian.soal.find((s) => s.id === 'MTK002');
  assert.deepStrictEqual(Array.from(mtk002.opsi), ['4/6', '1/4', '5/4', '3/8']);
});

test('mulai ujian ditolak tanpa sesi yang valid', () => {
  const { gs } = muatKode(databaseContoh());
  const hasil = gs.mulaiUjian('token-palsu', 'Matematika');
  assert.strictEqual(hasil.berhasil, false);
  assert.strictEqual(hasil.sesiBerakhir, true);
});

test('nilai dihitung dan disimpan ke HASIL_UJIAN satu kali', () => {
  const { gs, sheets } = muatKode(databaseContoh());
  const { token } = gs.loginSiswa(USER, PASS);
  gs.mulaiUjian(token, 'Matematika');

  const hasil = gs.simpanHasilUjian(token, { MTK001: 'B', MTK002: 'A' });
  assert.strictEqual(hasil.berhasil, true, hasil.pesan);
  assert.strictEqual(hasil.nilai, 33);
  assert.strictEqual(hasil.jumlahBenar, 1);
  assert.strictEqual(hasil.jumlahSalah, 2);
  assert.strictEqual(hasil.jumlahKosong, 1);

  const baris = sheets.HASIL_UJIAN.data;
  assert.strictEqual(baris.length, 2);
  const [, nisn, nama, tanggal, nilai, benar, salah, durasi, status] = baris[1];
  assert.deepStrictEqual([nisn, nama, nilai, benar, salah, status], ['UJI001', 'Siswa Uji', 33, 1, 2, 'SELESAI']);
  assert.ok(tanggal instanceof Date || Object.prototype.toString.call(tanggal) === '[object Date]');
  assert.ok(durasi >= 0);

  // Kirim ulang ditolak.
  assert.strictEqual(gs.simpanHasilUjian(token, { MTK001: 'B' }).berhasil, false);
  assert.strictEqual(sheets.HASIL_UJIAN.data.length, 2);
});

test('kolom opsional MATA_PELAJARAN di HASIL_UJIAN ikut terisi', () => {
  const db = databaseContoh();
  db.HASIL_UJIAN[0].push('MATA_PELAJARAN');
  const { gs, sheets } = muatKode(db);
  const { token } = gs.loginSiswa(USER, PASS);
  gs.mulaiUjian(token, 'Matematika');
  gs.simpanHasilUjian(token, { MTK001: 'B', MTK002: 'C', MTK003: 'C' });
  const baris = sheets.HASIL_UJIAN.data[1];
  assert.strictEqual(baris[4], 100);
  assert.strictEqual(baris[9], 'Matematika');
});

test('urutan kolom boleh berbeda selama nama header sama', () => {
  const db = databaseContoh();
  db.BANK_SOAL = db.BANK_SOAL.map((r) => [r[9], r[8], ...r.slice(0, 8)]);
  const { gs } = muatKode(db);
  const { token } = gs.loginSiswa(USER, PASS);
  gs.mulaiUjian(token, 'Matematika');
  assert.strictEqual(gs.simpanHasilUjian(token, { MTK001: 'B', MTK002: 'C', MTK003: 'C' }).nilai, 100);
});

test('alat admin: tambah akun, hash password massal, ganti password', () => {
  const db = databaseContoh();
  const { gs } = muatKode(db);
  gs.tambahAkunSiswa('123', 'Budi', '6', 'budi', 'rahasia');
  assert.strictEqual(gs.loginSiswa('budi', 'rahasia').berhasil, true);
  assert.throws(() => gs.tambahAkunSiswa('124', 'Budi 2', '6', 'budi', 'x'));

  db.DATA_SISWA.push(['125', 'Ani', '6', 'ani', 'ani123', '', '']);
  gs.hashPasswordBaru();
  assert.notStrictEqual(db.DATA_SISWA.at(-1)[4], 'ani123');
  assert.strictEqual(gs.loginSiswa('ani', 'ani123').berhasil, true);

  gs.gantiPasswordSiswa('ani', 'baru');
  assert.strictEqual(gs.loginSiswa('ani', 'ani123').berhasil, false);
  assert.strictEqual(gs.loginSiswa('ani', 'baru').berhasil, true);
});

test('periksaDatabase berjalan tanpa error', () => {
  const { gs, log } = muatKode(databaseContoh());
  gs.periksaDatabase();
  assert.ok(log.some((l) => l.includes('Matematika / kelas 6: 3 soal')), log.join('\n'));
});
