import request from 'supertest';
import ExcelJS from 'exceljs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../server/db.ts';
import { tandaAplikasi } from '../server/lib/aplikasi.ts';
import { app, jawabanBenar, kosongkanDb, siapkan } from './bantu.ts';

// PNG 1x1 piksel yang sah.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

afterAll(async () => {
  await prisma.$disconnect();
});

describe('impor Excel lama & login', () => {
  beforeEach(kosongkanDb);

  it('mengimpor siswa (hash lama), soal pecahan sebagai teks, dan ujian latihan', async () => {
    const { siswa } = await siapkan();
    const s = await prisma.siswa.findUniqueOrThrow({ where: { username: 'uji_tka' } });
    // Hash lama diganti scrypt setelah login pertama berhasil.
    expect(s.passwordHash.startsWith('scrypt$')).toBe(true);
    const mtk2 = await prisma.soal.findUniqueOrThrow({ where: { id: 'MTK002' } });
    expect(mtk2.opsi).toEqual(['4/6', '1/4', '5/4', '3/8']);
    expect((await prisma.ujian.findFirstOrThrow()).nama).toBe('Latihan Matematika Kelas 6');
    const saya = await siswa.get('/api/auth/saya?jenis=siswa').expect(200);
    expect(saya.body.profil.kelas).toBe('6');
  });

  it('menolak kata sandi salah dan mengunci setelah 5 kali gagal', async () => {
    await siapkan();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'salah' }).expect(401);
    }
    const r = await request(app).post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'LatihanTKA2026!' }).expect(429);
    expect(r.body.pesan).toMatch(/Terlalu banyak/);
  });

  it('menolak akses tanpa login dan akses admin dengan cookie siswa', async () => {
    const { siswa } = await siapkan();
    await request(app).get('/api/siswa/beranda').expect(401);
    await siswa.get('/api/admin/dashboard').expect(401);
  });
});

describe('alur ujian siswa', () => {
  beforeEach(kosongkanDb);

  it('beranda, mulai, simpan otomatis, lanjutkan, kirim, tidak bisa kirim dua kali', async () => {
    const { siswa, ujianId } = await siapkan();
    const beranda = await siswa.get('/api/siswa/beranda').expect(200);
    expect(beranda.body.ujian[0]).toMatchObject({ status: 'TERSEDIA', jumlahSoal: 3 });

    const paket = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({}).expect(200)).body;
    expect(paket.soal).toHaveLength(3);
    expect(paket.soal[0].kunci).toBeUndefined();
    expect(paket.sisaDetik).toBeGreaterThan(3500);

    await siswa.put(`/api/siswa/sesi/${paket.sesiId}/jawaban`).send({ jawaban: { MTK001: 'B' }, ragu: ['MTK001'] }).expect(200);
    const lanjut = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({}).expect(200)).body;
    expect(lanjut.sesiId).toBe(paket.sesiId);
    expect(lanjut.jawaban).toEqual({ MTK001: 'B' });
    expect(lanjut.ragu).toEqual(['MTK001']);

    const hasil = (await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { MTK001: 'B', MTK002: 'A' } }).expect(200)).body;
    expect(hasil).toMatchObject({ nilai: 33, benar: 1, salah: 1, kosong: 1, status: 'SELESAI' });

    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: {} }).expect(409);
    const b2 = await siswa.get('/api/siswa/beranda').expect(200);
    expect(b2.body.ujian[0].status).toBe('SELESAI');
    expect(b2.body.riwayat[0].nilai).toBe(33);
  });

  it('opsi diacak + token + pembahasan: nilai tetap benar', async () => {
    const { admin, siswa } = await siapkan();
    const { id } = (await admin.post('/api/admin/ujian').send({
      nama: 'TO 1', mataPelajaran: 'Matematika', kelas: '6', acakOpsi: true, token: 'abc123', tampilkanPembahasan: true, maksPercobaan: 0,
    }).expect(200)).body;
    await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({ token: 'SALAH' }).expect(400);
    const paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({ token: 'ABC123' }).expect(200)).body;
    const hasil = (await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: await jawabanBenar(paket) }).expect(200)).body;
    expect(hasil.nilai).toBe(100);
    for (const p of hasil.pembahasan) expect(p.jawaban).toBe(p.kunci);
  });

  it('jadwal: belum dibuka & ditutup; kirim terlambat memakai jawaban tersimpan', async () => {
    const { admin, siswa } = await siapkan();
    await admin.post('/api/admin/ujian').send({ nama: 'Besok', mataPelajaran: 'Matematika', kelas: '6', waktuMulai: new Date(Date.now() + 86400000) }).expect(200);
    await admin.post('/api/admin/ujian').send({ nama: 'Lalu', mataPelajaran: 'Matematika', kelas: '6', waktuSelesai: new Date(Date.now() - 1000) }).expect(200);
    const status = Object.fromEntries((await siswa.get('/api/siswa/beranda')).body.ujian.map((u: { nama: string; status: string }) => [u.nama, u.status]));
    expect(status).toMatchObject({ Besok: 'BELUM_DIBUKA', Lalu: 'DITUTUP' });

    const { id } = (await admin.post('/api/admin/ujian').send({ nama: 'Singkat', mataPelajaran: 'Matematika', kelas: '6', durasiMenit: 1 })).body;
    const paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({})).body;
    await siswa.put(`/api/siswa/sesi/${paket.sesiId}/jawaban`).send({ jawaban: { MTK001: 'B' } }).expect(200);
    await prisma.sesiUjian.update({ where: { id: paket.sesiId }, data: { batasWaktu: new Date(Date.now() - 10 * 60000) } });
    const hasil = (await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { MTK001: 'B', MTK002: 'C', MTK003: 'C' } }).expect(200)).body;
    expect(hasil).toMatchObject({ benar: 1, status: 'WAKTU_HABIS' });
  });

  it('pelanggaran tercatat dengan foto, dan ujian terkirim otomatis saat batas tercapai', async () => {
    const { admin, siswa } = await siapkan();
    const { id } = (await admin.post('/api/admin/ujian').send({ nama: 'Diawasi', mataPelajaran: 'Matematika', kelas: '6', maksPelanggaran: 2, wajibKamera: true })).body;
    const paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({})).body;

    const p1 = await siswa.post(`/api/siswa/sesi/${paket.sesiId}/pelanggaran`)
      .field('jenis', 'WAJAH_TIDAK_TERLIHAT').attach('foto', PNG, 'foto.png').expect(200);
    expect(p1.body).toMatchObject({ jumlah: 1, maks: 2, dihentikan: false });

    const mon = (await admin.get('/api/admin/monitor').expect(200)).body.sesi[0];
    expect(mon).toMatchObject({ jumlahPelanggaran: 1, maksPelanggaran: 2 });
    expect(mon.pelanggaranTerakhir.foto).toMatch(/\.png$/);
    await admin.get(`/api/admin/berkas/pelanggaran/${mon.pelanggaranTerakhir.foto}`).expect(200);
    await siswa.get(`/api/admin/berkas/pelanggaran/${mon.pelanggaranTerakhir.foto}`).expect(401);

    const p2 = await siswa.post(`/api/siswa/sesi/${paket.sesiId}/pelanggaran`)
      .field('jenis', 'PINDAH_TAB').field('jawaban', JSON.stringify({ MTK001: 'B' })).expect(200);
    expect(p2.body.dihentikan).toBe(true);
    expect(p2.body.hasil).toMatchObject({ status: 'PELANGGARAN', benar: 1, jumlahPelanggaran: 2 });

    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/pelanggaran`).field('jenis', 'PINDAH_TAB').expect(409);
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/pelanggaran`).field('jenis', 'TIDAK_ADA').expect(409);
  });

  it('menolak jenis pelanggaran yang tidak dikenal', async () => {
    const { siswa, ujianId } = await siapkan();
    const paket = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({})).body;
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/pelanggaran`).field('jenis', 'TIDAK_ADA').expect(400);
  });
});

describe('admin', () => {
  beforeEach(kosongkanDb);

  it('siswa: tambah otomatis, impor, reset sandi, nonaktif, hapus', async () => {
    const { admin } = await siapkan();
    const tambah = (await admin.post('/api/admin/siswa').send({ nama: 'Budi Santoso', kelas: 'Kelas 6' }).expect(200)).body;
    expect(tambah.akun[0].username).toMatch(/^budi\d{3}$/);
    await request(app).post('/api/auth/siswa/login').send({ username: tambah.akun[0].username, password: tambah.akun[0].password }).expect(200);

    const impor = (await admin.post('/api/admin/siswa/impor').send({ baris: [
      { nomor: 2, nisn: '1', nama: 'Ani', kelas: '6', username: 'ani', password: 'aniani' },
      { nomor: 3, nama: 'Cici', kelas: '5' },
      { nomor: 4, nama: '', kelas: '6' },
      { nomor: 5, nama: 'Dobel', kelas: '6', username: 'ani' },
    ] }).expect(200)).body;
    expect(impor.akun).toHaveLength(2);
    expect(impor.ditolak.map((d: { nomor: number }) => d.nomor)).toEqual([4, 5]);

    const ani = await prisma.siswa.findUniqueOrThrow({ where: { username: 'ani' } });
    const reset = (await admin.post('/api/admin/siswa/reset-password').send({ ids: [ani.id] }).expect(200)).body;
    await request(app).post('/api/auth/siswa/login').send({ username: 'ani', password: 'aniani' }).expect(401);
    await request(app).post('/api/auth/siswa/login').send({ username: 'ani', password: reset.akun[0].password }).expect(200);

    await admin.post('/api/admin/siswa/status').send({ ids: [ani.id], aktif: false }).expect(200);
    await request(app).post('/api/auth/siswa/login').send({ username: 'ani', password: reset.akun[0].password }).expect(403);
    await admin.post('/api/admin/siswa/hapus').send({ ids: [ani.id] }).expect(200);
    expect(await prisma.siswa.count({ where: { username: 'ani' } })).toBe(0);
  });

  it('soal: gambar, PGK dinilai tanpa parsial, impor tempel, hapus membuang gambar', async () => {
    const { admin, siswa } = await siapkan();
    const { nama } = (await admin.post('/api/admin/soal/gambar').attach('gambar', PNG, 'a.png').expect(200)).body;
    await admin.post('/api/admin/soal/gambar').attach('gambar', Buffer.from('bukan gambar'), 'a.png').expect(400);

    const r = (await admin.post('/api/admin/soal').send({
      mataPelajaran: 'Matematika', kelas: '6', pertanyaan: 'Pilih bilangan prima', opsi: ['2', '4', '7', '9'],
      kunci: 'C, A', tipe: 'PGK', skor: 2, gambar: nama,
    }).expect(200)).body;
    expect(r.id).toBe('MTK004');
    expect((await prisma.soal.findUniqueOrThrow({ where: { id: 'MTK004' } })).kunci).toBe('A,C');
    await siswa.get(`/api/berkas/gambar/${nama}`).expect(200);
    await request(app).get(`/api/berkas/gambar/${nama}`).expect(401);
    await siswa.get('/api/berkas/gambar/..%2F..%2Fpackage.json').expect(404);

    const { id } = (await admin.post('/api/admin/ujian').send({ nama: 'PGK', mataPelajaran: 'Matematika', kelas: '6', maksPercobaan: 0, acakSoal: false })).body;
    let paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({})).body;
    expect((await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { MTK004: ['A', 'C'] } })).body.benar).toBe(1);
    paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({})).body;
    expect((await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { MTK004: ['A'] } })).body.benar).toBe(0);

    const impor = (await admin.post('/api/admin/soal/impor').send({ baris: [
      { nomor: 2, mataPelajaran: 'Bahasa Indonesia', kelas: '6', pertanyaan: 'Sinonim besar?', opsiA: 'kecil', opsiB: 'agung', opsiC: 'pendek', opsiD: 'tipis', kunci: 'b' },
      { nomor: 3, mataPelajaran: 'Bahasa Indonesia', kelas: '6', pertanyaan: 'Tanpa kunci', opsiA: '1', opsiB: '2', opsiC: '3', opsiD: '4', kunci: '' },
    ] }).expect(200)).body;
    expect(impor).toMatchObject({ jumlah: 1, ditolak: [{ nomor: 3 }] });
    expect((await prisma.soal.findUniqueOrThrow({ where: { id: 'BIN001' } })).kunci).toBe('B');

    await admin.post('/api/admin/soal/hapus').send({ ids: ['MTK004'] }).expect(200);
    await admin.get(`/api/berkas/gambar/${nama}`).expect(404);
  });

  it('hasil: detail, analisis butir, ekspor xlsx, hapus agar bisa mengulang', async () => {
    const { admin, siswa, ujianId } = await siapkan();
    const paket = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({})).body;
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { MTK001: 'B', MTK002: 'D' } });

    const daftar = (await admin.get('/api/admin/hasil').expect(200)).body;
    expect(daftar.hasil).toHaveLength(1);
    expect(daftar.hasil[0].jawaban).toBeUndefined();
    const detail = (await admin.get(`/api/admin/hasil/${daftar.hasil[0].id}`).expect(200)).body;
    expect(detail.soal.find((s: { id: string }) => s.id === 'MTK002').jawaban).toBe('D');

    const a = (await admin.get(`/api/admin/analisis/${ujianId}`).expect(200)).body.analisis;
    expect(a.jumlahPeserta).toBe(1);
    expect(a.butir.find((b: { id: string }) => b.id === 'MTK001').p).toBe(100);
    expect(a.butir.find((b: { id: string }) => b.id === 'MTK002').sebaran.D).toBe(1);

    const xlsx = await admin.get(`/api/admin/ekspor.xlsx?ujianId=${ujianId}`).buffer(true)
      .parse((res, cb) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Nilai', 'Analisis Butir']);
    expect(wb.getWorksheet('Nilai')!.getRow(2).getCell(3).value).toBe('Siswa Uji');

    await admin.post('/api/admin/hasil/hapus').send({ ids: [daftar.hasil[0].id] }).expect(200);
    expect((await siswa.get('/api/siswa/beranda')).body.ujian[0].status).toBe('TERSEDIA');
  });

  it('monitor: tambah waktu, reset, kirim paksa', async () => {
    const { admin, siswa, ujianId } = await siapkan();
    const paket = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({})).body;
    await siswa.put(`/api/siswa/sesi/${paket.sesiId}/jawaban`).send({ jawaban: { MTK001: 'B' } });
    const sisa = (await admin.get('/api/admin/monitor')).body.sesi[0].sisaDetik;
    await admin.post(`/api/admin/sesi/${paket.sesiId}/aksi`).send({ aksi: 'TAMBAH_WAKTU', menit: 10 }).expect(200);
    expect((await admin.get('/api/admin/monitor')).body.sesi[0].sisaDetik).toBeGreaterThanOrEqual(sisa + 590);

    await admin.post(`/api/admin/sesi/${paket.sesiId}/aksi`).send({ aksi: 'RESET' }).expect(200);
    expect((await admin.get('/api/admin/monitor')).body.sesi).toHaveLength(0);

    const p2 = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({})).body;
    await admin.post(`/api/admin/sesi/${p2.sesiId}/aksi`).send({ aksi: 'KIRIM' }).expect(200);
    expect((await admin.get('/api/admin/hasil')).body.hasil[0].status).toBe('DIHENTIKAN');
  });

  it('peran guru dibatasi; admin terakhir tidak bisa dihapus/diturunkan', async () => {
    const { admin } = await siapkan();
    await admin.post('/api/admin/pengguna').send({ nama: 'Bu Guru', username: 'guru1', peran: 'GURU', password: 'guru123' }).expect(200);
    const guru = request.agent(app);
    await guru.post('/api/auth/staf/login').send({ username: 'guru1', password: 'guru123' }).expect(200);
    await guru.get('/api/admin/dashboard').expect(200);
    await guru.get('/api/admin/soal').expect(200);
    await guru.get('/api/admin/siswa').expect(403);
    await guru.put('/api/admin/pengaturan').send({}).expect(403);

    const adminId = (await prisma.pengguna.findUniqueOrThrow({ where: { username: 'admin' } })).id;
    await admin.delete(`/api/admin/pengguna/${adminId}`).expect(400);
    await admin.put(`/api/admin/pengguna/${adminId}`).send({ nama: 'A', peran: 'GURU' }).expect(400);
  });

  it('pengaturan, logo, ganti sandi, backup, log', async () => {
    const { admin, siswa } = await siapkan();
    await admin.put('/api/admin/pengaturan').send({ NAMA_SEKOLAH: 'SD Uji', TAHUN_AJARAN: '2026/2027', PENGUMUMAN: 'Halo', KKM: 75, SISWA_BOLEH_GANTI_PASSWORD: false }).expect(200);
    expect((await request(app).get('/api/info')).body).toMatchObject({ namaSekolah: 'SD Uji', pengumuman: 'Halo' });
    await admin.put('/api/admin/pengaturan').send({ NAMA_SEKOLAH: 'SD Uji', TAHUN_AJARAN: '', PENGUMUMAN: '', KKM: 200, SISWA_BOLEH_GANTI_PASSWORD: true }).expect(400);

    await admin.post('/api/admin/logo').attach('logo', PNG, 'logo.png').expect(200);
    await request(app).get('/api/logo').expect(200);

    await siswa.post('/api/auth/ganti-password').send({ jenis: 'siswa', lama: 'LatihanTKA2026!', baru: 'baru1234' }).expect(403);
    await admin.post('/api/auth/ganti-password').send({ jenis: 'staf', lama: 'salah', baru: 'baru1234' }).expect(400);
    await admin.post('/api/auth/ganti-password').send({ jenis: 'staf', lama: 'admin123', baru: 'baru1234' }).expect(200);
    await request(app).post('/api/auth/staf/login').send({ username: 'admin', password: 'baru1234' }).expect(200);

    const backup = (await admin.get('/api/admin/backup.json').expect(200)).body;
    expect(backup.siswa).toHaveLength(1);
    expect((await admin.get('/api/admin/log')).body.some((l: { aksi: string }) => l.aksi === 'BACKUP')).toBe(true);
  });
});

describe('status login', () => {
  beforeEach(kosongkanDb);
  it('tanpa login: profil null dengan status 200', async () => {
    const r = await request(app).get('/api/auth/saya?jenis=staf').expect(200);
    expect(r.body.profil).toBeNull();
  });
});

describe('aplikasi ujian Windows', () => {
  beforeEach(kosongkanDb);
  const menit = () => Math.floor(Date.now() / 60000);

  it('ujian wajib aplikasi ditolak dari browser, diterima dengan tanda aplikasi yang sah', async () => {
    const { admin, siswa } = await siapkan();
    const daftar = (await admin.get('/api/admin/ujian').expect(200)).body;
    expect(daftar.aplikasiTersedia).toBe(true);
    const { id } = (await admin.post('/api/admin/ujian').send({ nama: 'Lab', mataPelajaran: 'Matematika', kelas: '6', wajibAplikasi: true }).expect(200)).body;

    const beranda = (await siswa.get('/api/siswa/beranda').expect(200)).body;
    expect(beranda.diAplikasi).toBe(false);
    expect(beranda.ujian.find((u: { id: string }) => u.id === id).wajibAplikasi).toBe(true);

    const tolak = await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({}).expect(403);
    expect(tolak.body.pesan).toMatch(/aplikasi ujian/);
    await siswa.post(`/api/siswa/ujian/${id}/mulai`).set('X-TKA-Aplikasi', tandaAplikasi('kunci-salah', menit())).send({}).expect(403);
    await siswa.post(`/api/siswa/ujian/${id}/mulai`).set('X-TKA-Aplikasi', tandaAplikasi('kunci-rahasia-tes', menit() - 30)).send({}).expect(403);

    const sah = tandaAplikasi('kunci-rahasia-tes', menit());
    expect((await siswa.get('/api/siswa/beranda').set('X-TKA-Aplikasi', sah)).body.diAplikasi).toBe(true);
    const paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).set('X-TKA-Aplikasi', sah).send({}).expect(200)).body;
    // Melanjutkan dari browser biasa juga ditolak.
    await siswa.get(`/api/siswa/sesi/${paket.sesiId}`).expect(403);
    await siswa.get(`/api/siswa/sesi/${paket.sesiId}`).set('X-TKA-Aplikasi', sah).expect(200);
  });

  it('izin keluar hanya dengan akun pengawas yang benar', async () => {
    await siapkan();
    await request(app).post('/api/aplikasi/izin-keluar').send({ username: 'admin', password: 'salah' }).expect(401);
    await request(app).post('/api/aplikasi/izin-keluar').send({ username: 'uji_tka', password: 'LatihanTKA2026!' }).expect(401);
    await request(app).post('/api/aplikasi/izin-keluar').send({ username: 'admin', password: 'admin123' }).expect(200);
    expect(await prisma.logAktivitas.count({ where: { aksi: 'IZIN_KELUAR_APLIKASI' } })).toBe(1);
  });
});

describe('rekam layar', () => {
  beforeEach(kosongkanDb);

  it('unggah dibatasi, terlihat di monitor & detail hasil, hanya untuk staf, ikut terhapus saat reset', async () => {
    const { admin, siswa } = await siapkan();
    await admin.post('/api/admin/ujian').send({ nama: 'Rekam', mataPelajaran: 'Matematika', kelas: '6', intervalRekamLayar: 5 }).expect(400);
    const { id } = (await admin.post('/api/admin/ujian').send({ nama: 'Rekam', mataPelajaran: 'Matematika', kelas: '6', intervalRekamLayar: 30 }).expect(200)).body;
    expect((await siswa.get('/api/siswa/beranda')).body.ujian.find((u: { id: string }) => u.id === id).rekamLayar).toBe(true);

    const paket = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({}).expect(200)).body;
    expect(paket.ujian.intervalRekamLayar).toBe(30);
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/layar`).attach('layar', PNG, 'l.png').expect(200);
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/layar`).attach('layar', PNG, 'l.png').expect(429);
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/layar`).field('pemicu', 'PELANGGARAN').field('keterangan', 'Pindah tab').attach('layar', PNG, 'l.png').expect(200);
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/layar`).attach('layar', Buffer.from('bukan gambar'), 'l.png').expect(429);

    const mon = (await admin.get('/api/admin/monitor').expect(200)).body.sesi[0];
    expect(mon.tangkapanTerakhir.pemicu).toBe('PELANGGARAN');
    const daftar = (await admin.get(`/api/admin/sesi/${paket.sesiId}/layar`).expect(200)).body;
    expect(daftar).toHaveLength(2);
    await admin.get(`/api/admin/berkas/layar/${daftar[0].berkas}`).expect(200);
    await siswa.get(`/api/admin/berkas/layar/${daftar[0].berkas}`).expect(401);

    await admin.post(`/api/admin/sesi/${paket.sesiId}/aksi`).send({ aksi: 'RESET' }).expect(200);
    expect(await prisma.tangkapanLayar.count()).toBe(0);
    await admin.get(`/api/admin/berkas/layar/${daftar[0].berkas}`).expect(404);

    const p2 = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({})).body;
    await siswa.post(`/api/siswa/sesi/${p2.sesiId}/layar`).attach('layar', PNG, 'l.png').expect(200);
    const hasil = (await siswa.post(`/api/siswa/sesi/${p2.sesiId}/kirim`).send({ jawaban: {} })).body;
    await siswa.post(`/api/siswa/sesi/${p2.sesiId}/layar`).attach('layar', PNG, 'l.png').expect(409);
    const detail = (await admin.get(`/api/admin/hasil/${hasil.id}`).expect(200)).body;
    expect(detail.tangkapanLayar).toHaveLength(1);
  });

  it('ujian tanpa rekam layar menolak unggahan; tangkapan lama dibersihkan sesuai pengaturan', async () => {
    const { admin, siswa, ujianId } = await siapkan();
    const paket = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({})).body;
    await siswa.post(`/api/siswa/sesi/${paket.sesiId}/layar`).attach('layar', PNG, 'l.png').expect(400);

    const { id } = (await admin.post('/api/admin/ujian').send({ nama: 'Rekam', mataPelajaran: 'Matematika', kelas: '6', intervalRekamLayar: 60, maksPercobaan: 0 })).body;
    const p2 = (await siswa.post(`/api/siswa/ujian/${id}/mulai`).send({})).body;
    await siswa.post(`/api/siswa/sesi/${p2.sesiId}/layar`).attach('layar', PNG, 'l.png').expect(200);
    await prisma.tangkapanLayar.updateMany({ data: { waktu: new Date(Date.now() - 40 * 86400_000) } });
    const { bersihkanTangkapanLama } = await import('../server/lib/layar.ts');
    expect(await bersihkanTangkapanLama()).toBe(1);
    expect(await prisma.tangkapanLayar.count()).toBe(0);
  });
});
