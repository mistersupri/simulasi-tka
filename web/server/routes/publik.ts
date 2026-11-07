import { Router } from 'express';
import { prisma } from '../db.ts';
import { kirimBerkas } from '../lib/berkas.ts';
import { galat } from '../lib/galat.ts';
import { ambilPengaturan } from '../lib/pengaturan.ts';
import { VERSI_SERVER } from '../lib/versi.ts';
import { siswaDariRequest, stafDariRequest } from '../lib/sesi.ts';

export const rutPublik = Router();

rutPublik.get('/info', async (_req, res) => {
  const p = await ambilPengaturan();
  res.json({ namaInstansi: p.NAMA_SEKOLAH, namaAplikasi: p.NAMA_APLIKASI, tahunAjaran: p.TAHUN_AJARAN, pengumuman: p.PENGUMUMAN, adaLogo: !!p.LOGO, versi: VERSI_SERVER });
});

/** Daftar sekolah aktif untuk form login siswa (hanya nama). */
rutPublik.get('/sekolah', async (_req, res) => {
  res.json(await prisma.sekolah.findMany({ where: { aktif: true }, orderBy: { nama: 'asc' }, select: { id: true, nama: true } }));
});

rutPublik.get('/logo', async (_req, res) => {
  const p = await ambilPengaturan();
  if (!p.LOGO) throw galat(404, 'Logo belum diatur.');
  kirimBerkas(res, 'gambar', p.LOGO, '1h');
});

/** Gambar soal: hanya untuk pengguna yang sedang login. */
rutPublik.get('/berkas/gambar/:nama', async (req, res) => {
  if (!(await siswaDariRequest(req)) && !(await stafDariRequest(req))) throw galat(401, 'Belum login.');
  kirimBerkas(res, 'gambar', String(req.params.nama), '1d');
});
