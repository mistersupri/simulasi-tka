import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { hapusBerkas, simpanGambar, unggah } from '../../lib/berkas.ts';
import { galat } from '../../lib/galat.ts';
import { imporExcel } from '../../lib/imporExcel.ts';
import { catatLog } from '../../lib/log.ts';
import { ambilPengaturan, PENGATURAN_DAPAT_DIUBAH, simpanPengaturan } from '../../lib/pengaturan.ts';
import { butuhStaf, sekolahStaf } from '../../lib/sesi.ts';

export const rutAdminSistem = Router();

/** Ringkasan. Operator & guru hanya melihat angka sekolahnya. */
rutAdminSistem.get('/dashboard', butuhStaf(), async (req, res) => {
  const sekarang = new Date();
  const sekolahId = sekolahStaf(req.staf!);
  const sk = sekolahId ? { sekolahId } : {};
  const [siswa, siswaAktif, perKelas, perMapel, jumlahSoal, ujian, hasilAgg, sedangUjian, terbaru, jumlahSekolah] = await Promise.all([
    prisma.siswa.count({ where: sk }),
    prisma.siswa.count({ where: { aktif: true, ...sk } }),
    prisma.siswa.groupBy({ by: ['kelas'], where: sk, _count: true, orderBy: { kelas: 'asc' } }),
    // Admin: bank soal instansi; operator & guru: bank soal sekolahnya.
    prisma.soal.groupBy({ by: ['mataPelajaran', 'kelas'], where: { sekolahId }, _count: true, orderBy: [{ mataPelajaran: 'asc' }, { kelas: 'asc' }] }),
    prisma.soal.count({ where: { sekolahId } }),
    prisma.ujian.findMany({
      where: sekolahId ? { OR: [{ sekolah: { isEmpty: true } }, { sekolah: { has: sekolahId } }] } : {},
      select: { aktif: true, waktuMulai: true, waktuSelesai: true },
    }),
    prisma.hasil.aggregate({ where: sk, _count: true, _avg: { nilai: true } }),
    prisma.sesiUjian.count({ where: { status: 'BERLANGSUNG', siswa: sk } }),
    prisma.hasil.findMany({
      where: sk, orderBy: { tanggal: 'desc' }, take: 8,
      select: { id: true, namaSiswa: true, kelas: true, namaSekolah: true, namaUjian: true, nilai: true, tanggal: true },
    }),
    sekolahId ? Promise.resolve(1) : prisma.sekolah.count({ where: { aktif: true } }),
  ]);
  res.json({
    jumlahSekolah,
    jumlahSiswa: siswa,
    siswaAktif,
    jumlahSoal,
    jumlahUjian: ujian.length,
    ujianDibuka: ujian.filter((u) => u.aktif && (!u.waktuMulai || u.waktuMulai <= sekarang) && (!u.waktuSelesai || u.waktuSelesai >= sekarang)).length,
    jumlahHasil: hasilAgg._count,
    rataRata: hasilAgg._avg.nilai === null ? null : Math.round(hasilAgg._avg.nilai),
    sedangUjian,
    perKelas: perKelas.map((k) => ({ label: `Kelas ${k.kelas}`, jumlah: k._count })),
    perMapel: perMapel.map((m) => ({ label: `${m.mataPelajaran} · kelas ${m.kelas}`, jumlah: m._count })),
    hasilTerbaru: terbaru,
  });
});

rutAdminSistem.get('/pengaturan', butuhStaf('ADMIN'), async (_req, res) => {
  const p = await ambilPengaturan();
  res.json({
    pengaturan: Object.fromEntries(PENGATURAN_DAPAT_DIUBAH.map((k) => [k, p[k]])),
    adaLogo: !!p.LOGO,
  });
});

rutAdminSistem.put('/pengaturan', butuhStaf('ADMIN'), async (req, res) => {
  const d = z.object({
    NAMA_SEKOLAH: z.string().trim().min(1, 'Nama instansi wajib diisi.'),
    TAHUN_AJARAN: z.string().trim(),
    PENGUMUMAN: z.string().trim().max(1000),
    KKM: z.coerce.number().int().min(0, 'KKM harus 0 sampai 100.').max(100, 'KKM harus 0 sampai 100.').transform(String),
    SISWA_BOLEH_GANTI_PASSWORD: z.boolean().transform((v) => (v ? 'YA' : 'TIDAK')),
    SIMPAN_TANGKAPAN_HARI: z.coerce.number().int().min(1, 'Lama simpan tangkapan layar 1 sampai 365 hari.').max(365, 'Lama simpan tangkapan layar 1 sampai 365 hari.').default(30).transform(String),
  }).parse(req.body);
  await simpanPengaturan(d);
  await catatLog(req.staf!, 'UBAH_PENGATURAN');
  res.json({ pesan: 'Pengaturan disimpan.' });
});

rutAdminSistem.post('/logo', butuhStaf('ADMIN'), unggah.single('logo'), async (req, res) => {
  const lama = (await ambilPengaturan()).LOGO;
  const nama = await simpanGambar(req.file?.buffer, 'gambar');
  await simpanPengaturan({ LOGO: nama });
  await hapusBerkas('gambar', lama);
  await catatLog(req.staf!, 'UBAH_LOGO');
  res.json({ pesan: 'Logo diperbarui.' });
});

rutAdminSistem.delete('/logo', butuhStaf('ADMIN'), async (req, res) => {
  const lama = (await ambilPengaturan()).LOGO;
  await simpanPengaturan({ LOGO: '' });
  await hapusBerkas('gambar', lama);
  await catatLog(req.staf!, 'HAPUS_LOGO');
  res.json({ pesan: 'Logo dihapus.' });
});

/** Admin: semua log. Operator: log akun di sekolahnya. */
rutAdminSistem.get('/log', butuhStaf('ADMIN', 'OPERATOR'), async (req, res) => {
  const sekolahId = sekolahStaf(req.staf!);
  res.json(await prisma.logAktivitas.findMany({ where: sekolahId ? { sekolahId } : {}, orderBy: { waktu: 'desc' }, take: 500 }));
});

/** Cadangan seluruh data (JSON). Kata sandi tetap dalam bentuk hash. */
rutAdminSistem.get('/backup.json', butuhStaf('ADMIN'), async (req, res) => {
  const [pengaturan, sekolah, pengguna, siswa, soal, ujian, hasil, logAktivitas] = await Promise.all([
    prisma.pengaturan.findMany(), prisma.sekolah.findMany(), prisma.pengguna.findMany(), prisma.siswa.findMany(), prisma.soal.findMany(),
    prisma.ujian.findMany(), prisma.hasil.findMany(), prisma.logAktivitas.findMany({ orderBy: { waktu: 'desc' }, take: 5000 }),
  ]);
  await catatLog(req.staf!, 'BACKUP');
  res.setHeader('Content-Disposition', `attachment; filename="backup-simulasi-tka-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ versi: 2, dibuat: new Date(), pengaturan, sekolah, pengguna, siswa, soal, ujian, hasil, logAktivitas });
});

rutAdminSistem.post('/impor-excel', butuhStaf('ADMIN'), unggah.single('berkas'), async (req, res) => {
  if (!req.file) throw galat(400, 'Pilih berkas .xlsx terlebih dahulu.');
  const sekolahId = typeof req.body?.sekolahId === 'string' ? req.body.sekolahId : '';
  if (sekolahId && !(await prisma.sekolah.findUnique({ where: { id: sekolahId }, select: { id: true } }))) throw galat(400, 'Sekolah tidak ditemukan.');
  let laporan;
  try {
    laporan = await imporExcel(req.file.buffer, sekolahId || null);
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    throw galat(400, 'Berkas tidak dapat dibaca. Pastikan formatnya .xlsx.');
  }
  await catatLog(req.staf!, 'IMPOR_EXCEL', `${laporan.siswa} siswa, ${laporan.soal} soal, ${laporan.ujian} ujian`);
  res.json(laporan);
});
