import { Router } from 'express';
import { kirimBerkas } from '../lib/berkas.ts';
import { galat } from '../lib/galat.ts';
import { ambilPengaturan } from '../lib/pengaturan.ts';
import { siswaDariRequest, stafDariRequest } from '../lib/sesi.ts';

export const rutPublik = Router();

rutPublik.get('/info', async (_req, res) => {
  const p = await ambilPengaturan();
  res.json({ namaSekolah: p.NAMA_SEKOLAH, tahunAjaran: p.TAHUN_AJARAN, pengumuman: p.PENGUMUMAN, adaLogo: !!p.LOGO });
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
