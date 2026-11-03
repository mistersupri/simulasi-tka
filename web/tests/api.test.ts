import request from 'supertest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.ts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    const s = await prisma.siswa.findFirstOrThrow({ where: { username: 'uji_tka' } });
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
    const { admin, sekolahId } = await siapkan();
    // Admin instansi wajib memilih sekolah.
    await admin.post('/api/admin/siswa').send({ nama: 'Budi Santoso', kelas: 'Kelas 6' }).expect(400);
    const tambah = (await admin.post('/api/admin/siswa').send({ nama: 'Budi Santoso', kelas: 'Kelas 6', sekolahId }).expect(200)).body;
    expect(tambah.akun[0].username).toMatch(/^budi\d{3}$/);
    await request(app).post('/api/auth/siswa/login').send({ username: tambah.akun[0].username, password: tambah.akun[0].password }).expect(200);

    const impor = (await admin.post('/api/admin/siswa/impor').send({ sekolahId, baris: [
      { nomor: 2, nisn: '1', nama: 'Ani', kelas: '6', username: 'ani', password: 'aniani' },
      { nomor: 3, nama: 'Cici', kelas: '5' },
      { nomor: 4, nama: '', kelas: '6' },
      { nomor: 5, nama: 'Dobel', kelas: '6', username: 'ani' },
    ] }).expect(200)).body;
    expect(impor.akun).toHaveLength(2);
    expect(impor.ditolak.map((d: { nomor: number }) => d.nomor)).toEqual([4, 5]);

    const ani = await prisma.siswa.findFirstOrThrow({ where: { username: 'ani' } });
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
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Nilai', 'Analisis Butir', 'Per Sekolah', 'Per Kelas']);
    expect(wb.getWorksheet('Nilai')!.getRow(2).getCell(2).value).toBe('SDN Johar Baru 01 Pagi');
    expect(wb.getWorksheet('Nilai')!.getRow(2).getCell(4).value).toBe('Siswa Uji');

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
    const { admin, sekolahId } = await siapkan();
    // Guru & operator wajib punya sekolah.
    await admin.post('/api/admin/pengguna').send({ nama: 'Bu Guru', username: 'guru1', peran: 'GURU', password: 'guru123' }).expect(400);
    await admin.post('/api/admin/pengguna').send({ nama: 'Bu Guru', username: 'guru1', peran: 'GURU', sekolahId, password: 'guru123' }).expect(200);
    const guru = request.agent(app);
    await guru.post('/api/auth/staf/login').send({ username: 'guru1', password: 'guru123' }).expect(200);
    await guru.get('/api/admin/dashboard').expect(200);
    await guru.get('/api/admin/hasil').expect(200);
    await guru.get('/api/admin/soal').expect(403);
    await guru.get('/api/admin/ujian').expect(403);
    await guru.get('/api/admin/monitor').expect(403);
    await guru.get('/api/admin/siswa').expect(403);
    await guru.get('/api/admin/pengguna').expect(403);
    await guru.put('/api/admin/pengaturan').send({}).expect(403);

    const adminId = (await prisma.pengguna.findUniqueOrThrow({ where: { username: 'admin' } })).id;
    await admin.delete(`/api/admin/pengguna/${adminId}`).expect(400);
    await admin.put(`/api/admin/pengguna/${adminId}`).send({ nama: 'A', peran: 'GURU' }).expect(400);
  });

  it('pengaturan, logo, ganti sandi, backup, log', async () => {
    const { admin, siswa } = await siapkan();
    await admin.put('/api/admin/pengaturan').send({ NAMA_SEKOLAH: 'SD Uji', TAHUN_AJARAN: '2026/2027', PENGUMUMAN: 'Halo', KKM: 75, SISWA_BOLEH_GANTI_PASSWORD: false }).expect(200);
    expect((await request(app).get('/api/info')).body).toMatchObject({ namaInstansi: 'SD Uji', pengumuman: 'Halo' });
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

describe('manajemen sekolah', () => {
  beforeEach(kosongkanDb);

  /** Sekolah A (dari siapkan) + sekolah B, masing-masing dengan operator, guru, dan satu siswa. */
  async function duaSekolah() {
    const dasar = await siapkan();
    const { admin, sekolahId: sekolahA } = dasar;
    await admin.post('/api/admin/sekolah').send({ nama: 'SDN Uji B', npsn: '123' }).expect(400);
    const sekolahB = (await admin.post('/api/admin/sekolah').send({ nama: 'SDN Uji B', npsn: '20100002' }).expect(200)).body.id;
    await admin.post('/api/admin/sekolah').send({ nama: 'Kembar', npsn: '20100002' }).expect(400);

    const masuk = async (username: string, password: string) => {
      const a = request.agent(app);
      await a.post('/api/auth/staf/login').send({ username, password }).expect(200);
      return a;
    };
    await admin.post('/api/admin/pengguna').send({ nama: 'Op A', username: 'opa', peran: 'OPERATOR', sekolahId: sekolahA, password: 'rahasia1' }).expect(200);
    await admin.post('/api/admin/pengguna').send({ nama: 'Op B', username: 'opb', peran: 'OPERATOR', sekolahId: sekolahB, password: 'rahasia1' }).expect(200);
    const opA = await masuk('opa', 'rahasia1');
    const opB = await masuk('opb', 'rahasia1');

    // Operator membuat siswa; sekolah selalu sekolahnya sendiri walau mengirim sekolah lain.
    const siswaB = (await opB.post('/api/admin/siswa').send({ nama: 'Bambang', kelas: '6', username: 'bambang', password: 'bambang1', sekolahId: sekolahA }).expect(200)).body;
    expect(siswaB.akun[0].username).toBe('bambang');
    expect((await prisma.siswa.findFirstOrThrow({ where: { username: 'bambang' } })).sekolahId).toBe(sekolahB);

    // Operator hanya bisa membuat akun guru untuk sekolahnya.
    await opA.post('/api/admin/pengguna').send({ nama: 'X', username: 'opx', peran: 'OPERATOR', password: 'rahasia1' }).expect(403);
    await opA.post('/api/admin/pengguna').send({ nama: 'Guru A', username: 'gurua', peran: 'GURU', sekolahId: sekolahB, password: 'rahasia1' }).expect(200);
    expect((await prisma.pengguna.findUniqueOrThrow({ where: { username: 'gurua' } })).sekolahId).toBe(sekolahA);
    const guruA = await masuk('gurua', 'rahasia1');
    const siswaBAgen = request.agent(app);
    await siswaBAgen.post('/api/auth/siswa/login').send({ username: 'bambang', password: 'bambang1' }).expect(200);
    return { ...dasar, sekolahA, sekolahB, opA, opB, guruA, siswaBAgen };
  }

  it('operator hanya melihat & mengubah siswa dan guru sekolahnya', async () => {
    const { admin, opA, opB } = await duaSekolah();
    const daftarA = (await opA.get('/api/admin/siswa').expect(200)).body;
    expect(daftarA.map((s: { username: string }) => s.username)).toEqual(['uji_tka']);
    expect((await admin.get('/api/admin/siswa').expect(200)).body).toHaveLength(2);

    const bambang = await prisma.siswa.findFirstOrThrow({ where: { username: 'bambang' } });
    await opA.put(`/api/admin/siswa/${bambang.id}`).send({ nama: 'Diubah', kelas: '6' }).expect(404);
    await opA.post('/api/admin/siswa/hapus').send({ ids: [bambang.id] }).expect(200);
    expect(await prisma.siswa.count({ where: { id: bambang.id } })).toBe(1);
    const reset = (await opA.post('/api/admin/siswa/reset-password').send({ ids: [bambang.id] }).expect(200)).body;
    expect(reset.akun).toHaveLength(0);

    const guruA = await prisma.pengguna.findUniqueOrThrow({ where: { username: 'gurua' } });
    expect((await opB.get('/api/admin/pengguna').expect(200)).body).toHaveLength(0);
    await opB.delete(`/api/admin/pengguna/${guruA.id}`).expect(404);
    expect((await opA.get('/api/admin/pengguna').expect(200)).body.map((p: { username: string }) => p.username)).toEqual(['gurua']);

    // Operator tidak bisa melihat bank soal instansi, sekolah lain, atau pengaturan.
    expect((await opA.get('/api/admin/soal').expect(200)).body).toHaveLength(0);
    await opA.post('/api/admin/sekolah/impor').send({ baris: [] }).expect(403);
    await opA.get('/api/admin/sekolah').expect(403);
    await opA.put('/api/admin/pengaturan').send({}).expect(403);
    expect((await opA.get('/api/admin/sekolah/pilihan').expect(200)).body).toHaveLength(1);
  });

  it('ujian bisa dibatasi per sekolah; hasil, monitor, dan analisis terpisah per sekolah', async () => {
    const { admin, siswa, siswaBAgen, sekolahB, opA, opB, guruA } = await duaSekolah();
    const ujianB = (await admin.post('/api/admin/ujian').send({ nama: 'Khusus B', mataPelajaran: 'Matematika', kelas: '6', sekolah: [sekolahB] }).expect(200)).body.id;
    await admin.post('/api/admin/ujian').send({ nama: 'Salah', mataPelajaran: 'Matematika', sekolah: ['tidak-ada'] }).expect(400);

    const namaA = (await siswa.get('/api/siswa/beranda')).body.ujian.map((u: { nama: string }) => u.nama);
    expect(namaA).not.toContain('Khusus B');
    await siswa.post(`/api/siswa/ujian/${ujianB}/mulai`).send({}).expect(404);
    expect((await opA.get('/api/admin/ujian').expect(200)).body.ujian.map((u: { nama: string }) => u.nama)).not.toContain('Khusus B');
    expect((await opB.get('/api/admin/ujian').expect(200)).body.ujian.map((u: { nama: string }) => u.nama)).toContain('Khusus B');

    const paketB = (await siswaBAgen.post(`/api/siswa/ujian/${ujianB}/mulai`).send({}).expect(200)).body;
    expect((await opA.get('/api/admin/monitor')).body.sesi).toHaveLength(0);
    expect((await opB.get('/api/admin/monitor')).body.sesi[0].namaSekolah).toBe('SDN Uji B');
    await opA.post(`/api/admin/sesi/${paketB.sesiId}/aksi`).send({ aksi: 'KIRIM' }).expect(404);
    await guruA.post(`/api/admin/sesi/${paketB.sesiId}/aksi`).send({ aksi: 'KIRIM' }).expect(403);
    await opB.post(`/api/admin/sesi/${paketB.sesiId}/aksi`).send({ aksi: 'KIRIM' }).expect(200);

    const hasilB = await prisma.hasil.findFirstOrThrow({ where: { ujianId: ujianB } });
    expect(hasilB).toMatchObject({ sekolahId: sekolahB, namaSekolah: 'SDN Uji B' });
    expect((await guruA.get('/api/admin/hasil').expect(200)).body.hasil).toHaveLength(0);
    await guruA.get(`/api/admin/hasil/${hasilB.id}`).expect(404);
    await guruA.post('/api/admin/hasil/hapus').send({ ids: [hasilB.id] }).expect(403);
    expect((await guruA.get(`/api/admin/analisis/${ujianB}`).expect(200)).body.analisis.jumlahPeserta).toBe(0);
    // Guru tidak bisa memilih sekolah lain lewat parameter.
    expect((await guruA.get(`/api/admin/analisis/${ujianB}?sekolahId=${sekolahB}`).expect(200)).body.analisis.jumlahPeserta).toBe(0);

    const semua = (await admin.get(`/api/admin/analisis/${ujianB}`).expect(200)).body.analisis;
    expect(semua.perSekolah).toEqual([expect.objectContaining({ label: 'SDN Uji B', jumlahPeserta: 1 })]);
    expect(semua.butir[0]).toHaveProperty('dayaBeda', null);
    expect((await admin.get(`/api/admin/hasil?sekolahId=${sekolahB}`)).body.hasil).toHaveLength(1);
    expect((await opA.get('/api/admin/dashboard')).body).toMatchObject({ jumlahSiswa: 1, jumlahHasil: 0 });
  });

  it('sekolah nonaktif tidak bisa login; sekolah berisi data tidak bisa dihapus', async () => {
    const { admin, sekolahB, opB, siswaBAgen } = await duaSekolah();
    await admin.put(`/api/admin/sekolah/${sekolahB}`).send({ nama: 'SDN Uji B', npsn: '20100002', aktif: false }).expect(200);
    await opB.get('/api/admin/dashboard').expect(401);
    await siswaBAgen.get('/api/siswa/beranda').expect(401);
    await request(app).post('/api/auth/staf/login').send({ username: 'opb', password: 'rahasia1' }).expect(403);
    await request(app).post('/api/auth/siswa/login').send({ username: 'bambang', password: 'bambang1' }).expect(403);

    await admin.delete(`/api/admin/sekolah/${sekolahB}`).expect(400);
    const kosong = (await admin.post('/api/admin/sekolah').send({ nama: 'Kosong' }).expect(200)).body.id;
    const u = (await admin.post('/api/admin/ujian').send({ nama: 'Hanya kosong', mataPelajaran: 'Matematika', sekolah: [kosong] }).expect(200)).body.id;
    await admin.delete(`/api/admin/sekolah/${kosong}`).expect(200);
    // Ujian yang hanya untuk sekolah itu dinonaktifkan, bukan berubah menjadi "semua sekolah".
    expect(await prisma.ujian.findUniqueOrThrow({ where: { id: u } })).toMatchObject({ sekolah: [], aktif: false });
    const daftar = (await admin.get('/api/admin/sekolah').expect(200)).body;
    expect(daftar.find((s: { nama: string }) => s.nama === 'SDN Uji B')).toMatchObject({ jumlahSiswa: 1, jumlahOperator: 1, aktif: false });
  });
});

describe('soal & ujian sekolah, username per sekolah, impor sekolah, kunci login', () => {
  beforeEach(kosongkanDb);

  async function sekolahDenganOperator(admin: ReturnType<typeof request.agent>, npsn: string, nama: string, username: string) {
    const id = (await admin.post('/api/admin/sekolah').send({ nama, npsn }).expect(200)).body.id;
    await admin.post('/api/admin/pengguna').send({ nama: `Op ${nama}`, username, peran: 'OPERATOR', sekolahId: id, password: 'rahasia1' }).expect(200);
    const op = request.agent(app);
    await op.post('/api/auth/staf/login').send({ username, password: 'rahasia1' }).expect(200);
    return { id, op };
  }

  it('admin mematikan izin bank soal sekolah: operator tidak bisa menulis tetapi tetap bisa melihat; menu mengikuti profil', async () => {
    const { admin, sekolahId } = await siapkan();
    const op = request.agent(app);
    await admin.post('/api/admin/pengguna').send({ nama: 'Op', username: 'opa', peran: 'OPERATOR', sekolahId, password: 'rahasia1' }).expect(200);
    const masuk = await op.post('/api/auth/staf/login').send({ username: 'opa', password: 'rahasia1' }).expect(200);
    expect(masuk.body.profil.bolehBuatSoal).toBe(true);
    const soal = { mataPelajaran: 'Matematika', kelas: '6', pertanyaan: '1+1?', opsi: ['1', '2', '3', '4'], kunci: 'B' };
    const id = (await op.post('/api/admin/soal').send(soal).expect(200)).body.id;

    const sek = (await admin.get('/api/admin/sekolah').expect(200)).body.find((x: { id: string }) => x.id === sekolahId);
    await admin.put(`/api/admin/sekolah/${sekolahId}`).send({ nama: sek.nama, npsn: sek.npsn ?? '', alamat: sek.alamat, aktif: true, bolehBuatSoal: false }).expect(200);

    expect((await op.get('/api/auth/saya?jenis=staf').expect(200)).body.profil.bolehBuatSoal).toBe(false);
    expect((await op.get('/api/admin/soal').expect(200)).body).toHaveLength(1);
    await op.post('/api/admin/soal').send(soal).expect(403);
    await op.put(`/api/admin/soal/${id}`).send(soal).expect(403);
    await op.post('/api/admin/soal/hapus').send({ ids: [id] }).expect(403);
    await op.post('/api/admin/soal/impor').send({ baris: [] }).expect(403);
    // Admin tetap bisa mengelola soal sekolah itu.
    await admin.post('/api/admin/soal').send({ ...soal, sekolahId }).expect(200);

    await admin.put(`/api/admin/sekolah/${sekolahId}`).send({ nama: sek.nama, npsn: sek.npsn ?? '', alamat: sek.alamat, aktif: true, bolehBuatSoal: true }).expect(200);
    await op.post('/api/admin/soal').send(soal).expect(200);
  });

  it('operator membuat soal & ujian sekolah; soal instansi tidak terlihat; ujian instansi tidak bisa diubah', async () => {
    const { admin, siswa, ujianId, sekolahId } = await siapkan();
    const op = request.agent(app);
    await admin.post('/api/admin/pengguna').send({ nama: 'Op', username: 'opa', peran: 'OPERATOR', sekolahId, password: 'rahasia1' }).expect(200);
    await op.post('/api/auth/staf/login').send({ username: 'opa', password: 'rahasia1' }).expect(200);
    const { id: sekolahB, op: opB } = await sekolahDenganOperator(admin, '20100002', 'SDN B', 'opb');

    // Soal instansi (MTK001..003) tidak terlihat oleh operator.
    expect((await op.get('/api/admin/soal').expect(200)).body).toHaveLength(0);
    const soalSekolah = { mataPelajaran: 'Matematika', kelas: '6', pertanyaan: '1+1?', opsi: ['1', '2', '3', '4'], kunci: 'B' };
    const s1 = (await op.post('/api/admin/soal').send(soalSekolah).expect(200)).body.id;
    expect(s1).toBe('20100001-MTK001');
    await op.post('/api/admin/soal').send({ ...soalSekolah, id: 'MTK001' }).expect(400); // jadi 20100001-MTK001: sudah dipakai
    await op.post('/api/admin/soal/impor').send({ baris: [{ nomor: 2, ...soalSekolah, opsiA: '1', opsiB: '2', opsiC: '3', opsiD: '4' }] }).expect(200);
    expect((await op.get('/api/admin/soal').expect(200)).body.map((x: { id: string }) => x.id)).toEqual(['20100001-MTK001', '20100001-MTK002']);
    expect((await admin.get('/api/admin/soal').expect(200)).body).toHaveLength(3);
    expect((await admin.get(`/api/admin/soal?sekolahId=${sekolahId}`).expect(200)).body).toHaveLength(2);
    await opB.put(`/api/admin/soal/${s1}`).send(soalSekolah).expect(404);
    await opB.post('/api/admin/soal/hapus').send({ ids: [s1, 'MTK001'] }).expect(200);
    expect(await prisma.soal.count()).toBe(5);

    // Ujian instansi tidak bisa diubah/dihapus/diganti tokennya oleh operator.
    await op.put(`/api/admin/ujian/${ujianId}`).send({ nama: 'X', mataPelajaran: 'Matematika' }).expect(404);
    await op.delete(`/api/admin/ujian/${ujianId}`).expect(404);
    await op.post(`/api/admin/ujian/${ujianId}/token`).expect(404);

    // Ujian sekolah: hanya untuk sekolahnya, memakai soal sekolahnya (walau operator mengirim sekolah lain).
    const uS = (await op.post('/api/admin/ujian').send({ nama: 'Ulangan Kelas 6', mataPelajaran: 'Matematika', kelas: '6', sekolah: [sekolahB] }).expect(200)).body.id;
    expect(await prisma.ujian.findUniqueOrThrow({ where: { id: uS } })).toMatchObject({ pemilikId: sekolahId, sekolah: [sekolahId] });
    const daftar = (await op.get('/api/admin/ujian').expect(200)).body.ujian;
    expect(daftar.find((u: { id: string }) => u.id === uS)).toMatchObject({ bolehUbah: true, soalPerKelas: { 6: 2 } });
    expect(daftar.find((u: { id: string }) => u.id === ujianId)).toMatchObject({ bolehUbah: false, soalPerKelas: {} });
    expect((await opB.get('/api/admin/ujian').expect(200)).body.ujian.map((u: { id: string }) => u.id)).not.toContain(uS);
    await opB.put(`/api/admin/ujian/${uS}`).send({ nama: 'X', mataPelajaran: 'Matematika' }).expect(404);

    const paket = (await siswa.post(`/api/siswa/ujian/${uS}/mulai`).send({}).expect(200)).body;
    expect(paket.soal.map((x: { id: string }) => x.id).sort()).toEqual(['20100001-MTK001', '20100001-MTK002']);
    const paketInstansi = (await siswa.post(`/api/siswa/ujian/${ujianId}/mulai`).send({}).expect(200)).body;
    expect(paketInstansi.soal.every((x: { id: string }) => !x.id.includes('-'))).toBe(true);
    await op.put(`/api/admin/ujian/${uS}`).send({ nama: 'Ulangan Diubah', mataPelajaran: 'Matematika', kelas: '6' }).expect(200);
    expect((await op.get('/api/admin/dashboard')).body.jumlahSoal).toBe(2);
  });

  it('username siswa boleh sama di sekolah berbeda; login memakai pilihan sekolah', async () => {
    const { admin, sekolahId } = await siapkan();
    const { id: sekolahB, op: opB } = await sekolahDenganOperator(admin, '20100002', 'SDN B', 'opb');
    await opB.post('/api/admin/siswa').send({ nama: 'Kembar', kelas: '6', username: 'uji_tka', password: 'kembarB1' }).expect(200);
    await opB.post('/api/admin/siswa').send({ nama: 'Kembar 2', kelas: '6', username: 'uji_tka' }).expect(400);
    expect((await request(app).get('/api/sekolah').expect(200)).body.map((x: { nama: string }) => x.nama)).toEqual(['SDN B', 'SDN Johar Baru 01 Pagi']);

    await request(app).post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'kembarB1' }).expect(400);
    const b = await request(app).post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'kembarB1', sekolahId: sekolahB }).expect(200);
    expect(b.body.profil).toMatchObject({ nama: 'Kembar', namaSekolah: 'SDN B' });
    await request(app).post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'kembarB1', sekolahId }).expect(401);
    await request(app).post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'LatihanTKA2026!', sekolahId }).expect(200);

    // Admin tidak bisa memindahkan siswa ke sekolah yang sudah punya username sama.
    const a = await prisma.siswa.findFirstOrThrow({ where: { sekolahId } });
    await admin.put(`/api/admin/siswa/${a.id}`).send({ nama: a.nama, kelas: '6', sekolahId: sekolahB }).expect(400);
  });

  it('impor sekolah & operator: buat, perbarui lewat NPSN, operator otomatis, tolak NPSN salah', async () => {
    const { admin } = await siapkan();
    const r1 = (await admin.post('/api/admin/sekolah/impor').send({ baris: [
      { nomor: 2, npsn: '20100001', nama: 'SDN Johar Baru 01 Pagi (baru)', alamat: 'Jl. Johar' },
      { nomor: 3, npsn: '20100009', nama: 'SDN Sembilan' },
      { nomor: 4, npsn: '', nama: 'SDN Tanpa NPSN', namaOperator: 'Bu Ani', usernameOperator: 'opani', passwordOperator: 'aniani12' },
      { nomor: 5, npsn: '123', nama: 'Salah' },
      { nomor: 6, npsn: '20100010', nama: 'SDN Sepuluh', usernameOperator: 'admin' },
    ] }).expect(200)).body;
    expect(r1).toMatchObject({ dibuat: 3, diperbarui: 1 });
    expect(r1.akun.map((a: { username: string }) => a.username)).toEqual(['op20100001', 'op20100009', 'opani']);
    expect(r1.ditolak.map((d: { nomor: number }) => d.nomor)).toEqual([5, 6]);
    expect((await prisma.sekolah.findUniqueOrThrow({ where: { npsn: '20100001' } })).nama).toBe('SDN Johar Baru 01 Pagi (baru)');
    await request(app).post('/api/auth/staf/login').send({ username: 'opani', password: 'aniani12' }).expect(200);
    await request(app).post('/api/auth/staf/login').send({ username: 'op20100009', password: r1.akun[1].password }).expect(200);

    // Impor ulang: sekolah yang sudah punya operator tidak dibuatkan lagi.
    const r2 = (await admin.post('/api/admin/sekolah/impor').send({ baris: [{ nomor: 2, npsn: '20100009', nama: '' }] }).expect(200)).body;
    expect(r2).toMatchObject({ dibuat: 0, diperbarui: 1, akun: [] });
    expect((await prisma.sekolah.findUniqueOrThrow({ where: { npsn: '20100009' } })).nama).toBe('SDN Sembilan');
  });

  it('kunci login tersimpan di database dan dihapus setelah login berhasil', async () => {
    await siapkan();
    for (let i = 0; i < 3; i++) await request(app).post('/api/auth/staf/login').send({ username: 'admin', password: 'salah' }).expect(401);
    expect((await prisma.gagalLogin.findFirstOrThrow()).jumlah).toBe(3);
    // Masa kunci lewat: hitungan mulai dari 1 lagi.
    await prisma.gagalLogin.updateMany({ data: { sampai: new Date(Date.now() - 1000) } });
    await request(app).post('/api/auth/staf/login').send({ username: 'admin', password: 'salah' }).expect(401);
    expect((await prisma.gagalLogin.findFirstOrThrow()).jumlah).toBe(1);
    await request(app).post('/api/auth/staf/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    expect(await prisma.gagalLogin.count()).toBe(0);
  });
});

describe('soal isian, gambar pilihan, bahasa asing, impor berkas', () => {
  beforeEach(kosongkanDb);

  const adaBerkas = (nama: string) => fs.existsSync(path.join(config.uploadDir, 'gambar', nama));
  const jumlahBerkas = () => (fs.existsSync(path.join(config.uploadDir, 'gambar')) ? fs.readdirSync(path.join(config.uploadDir, 'gambar')).length : 0);
  const dasar = { mataPelajaran: 'Informatika', kelas: '6', pertanyaan: 'Tulis keluaran: print(2 + 3 * 4)' };
  const buatUjian = async (admin: { post: (u: string) => { send: (b: object) => Promise<{ body: { id: string } }> } }, mapel: string) =>
    (await admin.post('/api/admin/ujian').send({ nama: `Ujian ${mapel}`, mataPelajaran: mapel, kelas: '6', maksPercobaan: 0, acakSoal: false, acakOpsi: true })).body.id;

  it('soal isian: kunci tidak bocor, penilaian dinormalkan, peka huruf, dan beberapa jawaban diterima', async () => {
    const { admin, siswa } = await siapkan();
    await admin.post('/api/admin/soal').send({ ...dasar, tipe: 'ISIAN', kunci: '', opsi: [] }).expect(400);
    const a = (await admin.post('/api/admin/soal').send({ ...dasar, tipe: 'ISIAN', kunci: '14\nempat belas', kode: true, pekaHuruf: true }).expect(200)).body.id;
    const b = (await admin.post('/api/admin/soal').send({
      mataPelajaran: 'Informatika', kelas: '6', pertanyaan: 'Kata "terima kasih" dalam bahasa Rusia', tipe: 'ISIAN', bahasa: 'ru', kunci: 'спасибо',
    }).expect(200)).body.id;
    const c = (await admin.post('/api/admin/soal').send({
      mataPelajaran: 'Informatika', kelas: '6', pertanyaan: 'Tulis "buku" dalam bahasa Arab', tipe: 'ISIAN', bahasa: 'ar', kunci: 'كتاب',
    }).expect(200)).body.id;
    expect(await prisma.soal.findUniqueOrThrow({ where: { id: a } })).toMatchObject({ kunci: '14\nempat belas', opsi: [], pekaHuruf: true, kode: true, tipe: 'ISIAN' });

    const ujian = await buatUjian(admin, 'Informatika');
    const paket = (await siswa.post(`/api/siswa/ujian/${ujian}/mulai`).send({}).expect(200)).body;
    expect(JSON.stringify(paket)).not.toContain('empat belas');
    expect(JSON.stringify(paket)).not.toContain('спасибо');
    const soal = Object.fromEntries(paket.soal.map((x: { id: string }) => [x.id, x]));
    expect(soal[a]).toMatchObject({ tipe: 'ISIAN', opsi: [], kode: true });
    expect(soal[b].bahasa).toBe('ru');

    // Jawaban disimpan apa adanya (bukan dipetakan sebagai huruf pilihan), lalu bisa dimuat ulang.
    await siswa.put(`/api/siswa/sesi/${paket.sesiId}/jawaban`).send({ jawaban: { [a]: '  empat   belas ', [b]: 'САСПИБО' } }).expect(200);
    expect((await siswa.post(`/api/siswa/ujian/${ujian}/mulai`).send({})).body.jawaban[a]).toBe('empat   belas');

    // a: peka huruf & spasi dinormalkan => "empat belas" benar; "EMPAT BELAS" salah. b: salah. c: harakat dibuang => benar.
    const hasil = (await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { [a]: 'EMPAT BELAS', [b]: 'Спасибо', [c]: 'كِتَاب' } }).expect(200)).body;
    expect(hasil).toMatchObject({ benar: 2, salah: 1 });
    const detail = (await admin.get(`/api/admin/hasil/${(await prisma.hasil.findFirstOrThrow()).id}`).expect(200)).body.soal;
    expect(detail.find((x: { id: string }) => x.id === a)).toMatchObject({ benar: false, jawaban: 'EMPAT BELAS', kunci: '14\nempat belas' });
    expect(detail.find((x: { id: string }) => x.id === b)).toMatchObject({ benar: true, jawaban: 'Спасибо' });
    expect(detail.find((x: { id: string }) => x.id === c)).toMatchObject({ benar: true });

    // Analisis tidak memasukkan jawaban isian ke sebaran A-D.
    const analisis = (await admin.get(`/api/admin/analisis/${ujian}`).expect(200)).body.analisis;
    expect(analisis.butir.find((x: { id: string }) => x.id === a)).toMatchObject({ tipe: 'ISIAN', sebaran: { A: 0, B: 0, C: 0, D: 0 }, benar: 0 });
  });

  it('gambar pada pilihan: boleh tanpa teks, ikut teracak, tidak bocor, dan dibersihkan saat diubah/dihapus', async () => {
    const { admin, siswa } = await siapkan();
    const gambar = async () => (await admin.post('/api/admin/soal/gambar').attach('gambar', PNG, 'a.png').expect(200)).body.nama as string;
    const [g1, g2, g3, g4] = [await gambar(), await gambar(), await gambar(), await gambar()];
    const soal = { mataPelajaran: 'Bahasa Mandarin', kelas: '6', pertanyaan: 'Manakah huruf "山"?', bahasa: 'zh', kunci: 'B' };

    await admin.post('/api/admin/soal').send({ ...soal, opsi: ['', '', '', ''], opsiGambar: [g1, g2, '', g4] }).expect(400); // pilihan C kosong
    await admin.post('/api/admin/soal').send({ ...soal, opsi: ['', '', '', ''], opsiGambar: ['../x.png', g2, g3, g4] }).expect(400); // nama berkas tidak sah
    const id = (await admin.post('/api/admin/soal').send({ ...soal, opsi: ['', '', 'teks C', ''], opsiGambar: [g1, g2, '', g4] }).expect(200)).body.id;
    expect(await prisma.soal.findUniqueOrThrow({ where: { id } })).toMatchObject({ opsiGambar: [g1, g2, '', g4], bahasa: 'zh' });
    await admin.post('/api/admin/soal').send({ ...soal, bahasa: 'klingon', opsi: ['a', 'b', 'c', 'd'] }).expect(400);

    const ujian = await buatUjian(admin, 'Bahasa Mandarin');
    const paket = (await siswa.post(`/api/siswa/ujian/${ujian}/mulai`).send({}).expect(200)).body;
    // Gambar ikut urutan teracak: pilihan B (kunci) bergambar g2.
    const s = paket.soal[0];
    const posisiB = s.opsiGambar.indexOf(g2);
    await siswa.get(`/api/berkas/gambar/${g2}`).expect(200);
    const hasil = (await siswa.post(`/api/siswa/sesi/${paket.sesiId}/kirim`).send({ jawaban: { [id]: 'ABCD'[posisiB] } }).expect(200)).body;
    expect(hasil.benar).toBe(1);

    // Mengganti gambar pilihan membuang berkas lama; gambar yang masih dipakai soal lain tetap ada.
    const lain = (await admin.post('/api/admin/soal').send({ ...soal, opsi: ['a', 'b', 'c', 'd'], gambar: g1 }).expect(200)).body.id;
    await admin.put(`/api/admin/soal/${id}`).send({ ...soal, opsi: ['a', 'b', 'c', 'd'], opsiGambar: [g1, '', '', ''] }).expect(200);
    expect(adaBerkas(g2)).toBe(false);
    expect(adaBerkas(g4)).toBe(false);
    expect(adaBerkas(g1)).toBe(true);
    await admin.post('/api/admin/soal/hapus').send({ ids: [id] }).expect(200);
    expect(adaBerkas(g1)).toBe(true); // masih dipakai soal lain
    await admin.post('/api/admin/soal/hapus').send({ ids: [lain] }).expect(200);
    expect(adaBerkas(g1)).toBe(false);
  });

  async function xlsxContoh(denganGambar: boolean) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('SOAL');
    ws.addRow(['MATA_PELAJARAN', 'KELAS', 'TIPE_SOAL', 'BAHASA', 'PERTANYAAN', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'KUNCI_JAWABAN', 'GAMBAR', 'GAMBAR_B']);
    ws.addRow(['Matematika', '6', 'PG', 'id', 'Hasil $\\frac{3}{4}+\\frac{1}{2}$ adalah ....', '$1\\frac{1}{4}$', '$\\frac{4}{6}$', '$\\frac{5}{8}$', '$1$', 'A', '', '']);
    ws.addRow(['Bahasa Arab', '6', 'PG', 'ar', 'ما معنى «كِتَاب»؟', 'Buku', 'Pensil', 'Meja', 'Kursi', 'A', '', '']);
    ws.addRow(['Informatika', '6', 'ISIAN', 'id', 'Keluaran?\n```python\nprint(2+3*4)\n```', '', '', '', '', '14|empat belas', '', '']);
    ws.addRow(['Bahasa Mandarin', '6', 'PG', 'zh', 'Pilih gambar "山"', 'A', '', 'C', 'D', 'B', 'soal.png', 'pilihan-b.png']);
    ws.addRow(['Bahasa Rusia', '6', 'PG', 'tlh', 'Bahasa salah', 'a', 'b', 'c', 'd', 'A', '', '']);
    if (denganGambar) {
      const id = wb.addImage({ buffer: PNG as never, extension: 'png' });
      ws.addImage(id, { tl: { col: 4, row: 1 }, ext: { width: 24, height: 24 } }); // di kolom PERTANYAAN baris 2: gambar soal
      ws.addImage(id, { tl: { col: 6, row: 1 }, ext: { width: 24, height: 24 } }); // di kolom OPSI_B baris 2: gambar pilihan B
      ws.addImage(id, { tl: { col: 20, row: 1 }, ext: { width: 24, height: 24 } }); // kolom tak dikenal: diabaikan
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('impor .xlsx: rumus LaTeX, Arab, isian, kode, dan gambar yang ditempel di sel; baris salah dilaporkan', async () => {
    const { admin } = await siapkan();
    const sebelum = jumlahBerkas();
    const r = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', await xlsxContoh(true), 'soal.xlsx').expect(200)).body;
    // Baris 5 merujuk berkas gambar tanpa ZIP, baris 6 berbahasa tak dikenal.
    expect(r.jumlah).toBe(3);
    expect(r.ditolak.map((d: { nomor: number }) => d.nomor)).toEqual([5, 6]);
    expect(r.ditolak[0].alasan).toMatch(/ZIP/);
    expect(r.ditolak[1].alasan).toMatch(/tidak dikenal/);
    expect(r.peringatan.join(' ')).toMatch(/diabaikan/);

    const mtk = await prisma.soal.findFirstOrThrow({ where: { mataPelajaran: 'Matematika', id: { startsWith: 'MTK' } }, orderBy: { id: 'desc' } });
    expect(mtk.pertanyaan).toBe('Hasil $\\frac{3}{4}+\\frac{1}{2}$ adalah ....');
    expect(mtk.opsi[0]).toBe('$1\\frac{1}{4}$');
    expect(mtk.gambar).toMatch(/\.png$/);
    expect(mtk.opsiGambar[1]).toMatch(/\.png$/);
    expect(adaBerkas(mtk.gambar!)).toBe(true);
    const arab = await prisma.soal.findFirstOrThrow({ where: { mataPelajaran: 'Bahasa Arab' } });
    expect(arab).toMatchObject({ bahasa: 'ar', id: 'BAR001' });
    expect(arab.pertanyaan).toBe('ما معنى «كِتَاب»؟');
    const kode = await prisma.soal.findFirstOrThrow({ where: { mataPelajaran: 'Informatika' } });
    expect(kode).toMatchObject({ tipe: 'ISIAN', kunci: '14\nempat belas', id: 'INF001' });
    expect(kode.pertanyaan).toContain('```python');
    // Soal yang ditolak tidak meninggalkan berkas gambar yatim.
    expect(jumlahBerkas() - sebelum).toBe(2);
  });

  it('impor .zip: gambar dirujuk lewat nama berkas, dipakai ulang, dan galat ZIP ditangani', async () => {
    const { admin } = await siapkan();
    const zip = new JSZip();
    zip.file('petunjuk/soal.xlsx', await xlsxContoh(false));
    zip.file('gambar/SOAL.PNG', PNG);
    zip.file('gambar/pilihan-b.png', PNG);
    zip.file('gambar/catatan.txt', 'bukan gambar');
    const r = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', await zip.generateAsync({ type: 'nodebuffer' }), 'paket.zip').expect(200)).body;
    expect(r.jumlah).toBe(4);
    expect(r.ditolak.map((d: { nomor: number }) => d.nomor)).toEqual([6]);
    const mandarin = await prisma.soal.findFirstOrThrow({ where: { mataPelajaran: 'Bahasa Mandarin' } });
    expect(mandarin).toMatchObject({ bahasa: 'zh', kunci: 'B' });
    expect(mandarin.gambar).toMatch(/\.png$/);
    expect(mandarin.opsiGambar).toEqual(['', expect.stringMatching(/\.png$/), '', '']);
    expect(mandarin.opsi).toEqual(['A', '', 'C', 'D']);

    const tanpaGambar = new JSZip();
    tanpaGambar.file('soal.xlsx', await xlsxContoh(false));
    const r2 = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', await tanpaGambar.generateAsync({ type: 'nodebuffer' }), 'p.zip').expect(200)).body;
    expect(r2.ditolak.find((d: { nomor: number }) => d.nomor === 5).alasan).toMatch(/tidak ditemukan di dalam ZIP/);

    // Baris yang gagal di tengah jalan (gambar soal ada, gambar pilihan hilang) menggulung balik berkas yang sudah tersimpan.
    const separuh = new JSZip();
    separuh.file('soal.xlsx', await xlsxContoh(false));
    separuh.file('soal.png', PNG);
    const sebelum = jumlahBerkas();
    const r3 = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', await separuh.generateAsync({ type: 'nodebuffer' }), 'p.zip').expect(200)).body;
    expect(r3.ditolak.find((d: { nomor: number }) => d.nomor === 5).alasan).toMatch(/pilihan-b\.png/);
    expect(jumlahBerkas()).toBe(sebelum);

    const kosong = new JSZip();
    kosong.file('a.png', PNG);
    await admin.post('/api/admin/soal/impor-berkas').attach('berkas', await kosong.generateAsync({ type: 'nodebuffer' }), 'k.zip').expect(400);
    await admin.post('/api/admin/soal/impor-berkas').attach('berkas', Buffer.from('bukan zip'), 'k.zip').expect(400);
    await admin.post('/api/admin/soal/impor-berkas').expect(400);
  });

  it('template Excel dapat diunduh dan langsung bisa diimpor (semua contoh sah); operator mengimpor ke bank sekolahnya', async () => {
    const { admin, sekolahId } = await siapkan();
    const unduh = await admin.get('/api/admin/soal/template.xlsx').buffer(true)
      .parse((res, cb) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); }).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(unduh.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['SOAL', 'PETUNJUK']);

    const r = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', unduh.body, 'template.xlsx').expect(200)).body;
    expect(r.ditolak).toEqual([]);
    expect(r.jumlah).toBe(10);
    expect(await prisma.soal.count({ where: { bahasa: { in: ['ar', 'zh', 'ru'] } } })).toBe(4);

    await admin.post('/api/admin/pengguna').send({ nama: 'Op', username: 'opa', peran: 'OPERATOR', sekolahId, password: 'rahasia1' }).expect(200);
    const op = request.agent(app);
    await op.post('/api/auth/staf/login').send({ username: 'opa', password: 'rahasia1' }).expect(200);
    const r2 = (await op.post('/api/admin/soal/impor-berkas').attach('berkas', unduh.body, 'template.xlsx').expect(200)).body;
    expect(r2.jumlah).toBe(10);
    expect(await prisma.soal.count({ where: { sekolahId } })).toBe(10);
    expect((await prisma.soal.findFirstOrThrow({ where: { sekolahId, mataPelajaran: 'Bahasa Arab' } })).id).toBe('20100001-BAR001');
  });
});

describe('penyimpanan unggahan bermasalah', () => {
  beforeEach(kosongkanDb);

  it('izin folder ditolak (EACCES): pesan jelas untuk admin, bukan galat umum', async () => {
    const { admin } = await siapkan();
    const spy = vi.spyOn(fs.promises, 'mkdir').mockRejectedValueOnce(Object.assign(new Error("EACCES: permission denied, mkdir '/data/uploads/gambar'"), { code: 'EACCES', syscall: 'mkdir', errno: -13 }));
    const r = await admin.post('/api/admin/logo').attach('logo', PNG, 'logo.png').expect(500);
    expect(r.body.pesan).toMatch(/tidak dapat ditulis.*administrator server/);
    spy.mockRestore();
    await admin.post('/api/admin/logo').attach('logo', PNG, 'logo.png').expect(200);
  });

  it('pemeriksaan folder unggahan saat server mulai', async () => {
    const { periksaFolderUnggah } = await import('../server/lib/berkas.ts');
    expect(await periksaFolderUnggah()).toBeNull();
    const spy = vi.spyOn(fs.promises, 'mkdir').mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    expect(await periksaFolderUnggah()).toMatch(/tidak bisa ditulis \(EACCES\)/);
    spy.mockRestore();
  });
});

describe('template ZIP dengan gambar', () => {
  beforeEach(kosongkanDb);

  it('berisi soal.xlsx, gambar PNG yang sah, dan petunjuk; langsung bisa diimpor dengan semua gambarnya', async () => {
    const { admin } = await siapkan();
    const unduh = await admin.get('/api/admin/soal/template.zip').buffer(true)
      .parse((res, cb) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); }).expect(200);
    expect(unduh.headers['content-type']).toMatch(/zip/);
    const zip = await JSZip.loadAsync(unduh.body);
    expect(Object.keys(zip.files).sort()).toEqual(['BACA-SAYA.txt', 'gambar/', 'gambar/garis.png', 'gambar/lingkaran.png', 'gambar/persegi.png', 'gambar/segitiga.png', 'soal.xlsx']);
    // Gambar contoh adalah PNG sungguhan dengan ukuran 160x120 dan memuat piksel berwarna (bukan kosong).
    const png = await zip.file('gambar/segitiga.png')!.async('nodebuffer');
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([160, 120]);
    expect(await zip.file('BACA-SAYA.txt')!.async('string')).toMatch(/Klik|klik "Impor berkas"/);

    const sebelum = fs.existsSync(path.join(config.uploadDir, 'gambar')) ? fs.readdirSync(path.join(config.uploadDir, 'gambar')).length : 0;
    const r = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', unduh.body, 'template.zip').expect(200)).body;
    expect(r.ditolak).toEqual([]);
    expect(r.jumlah).toBe(13);
    // Pilihan bergambar: lingkaran, persegi, segitiga, garis; kunci C.
    const bergambar = await prisma.soal.findFirstOrThrow({ where: { pertanyaan: 'Manakah bangun datar yang memiliki tiga sisi?' } });
    expect(bergambar.opsi).toEqual(['', '', '', '']);
    expect(bergambar.opsiGambar.every((g) => /\.png$/.test(g))).toBe(true);
    expect(bergambar.kunci).toBe('C');
    // Soal yang seluruhnya gambar.
    const hanyaGambar = await prisma.soal.findFirstOrThrow({ where: { pertanyaan: '', kunci: 'B', mataPelajaran: 'Matematika', gambar: { not: null } } });
    expect(hanyaGambar.gambar).toMatch(/\.png$/);
    // Gambar yang sama dipakai ulang antarsoal: 4 gambar pilihan + segitiga (dipakai bersama di pilihan C) + persegi (dipakai bersama) = 4 berkas.
    const sesudah = fs.readdirSync(path.join(config.uploadDir, 'gambar')).length;
    expect(sesudah - sebelum).toBe(4);
  });

  it('template Excel biasa tidak merujuk gambar (aman diimpor tanpa ZIP)', async () => {
    const { admin } = await siapkan();
    const unduh = await admin.get('/api/admin/soal/template.xlsx').buffer(true)
      .parse((res, cb) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); }).expect(200);
    const r = (await admin.post('/api/admin/soal/impor-berkas').attach('berkas', unduh.body, 'template.xlsx').expect(200)).body;
    expect(r).toMatchObject({ jumlah: 10, ditolak: [] });
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
