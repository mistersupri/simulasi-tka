import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { hashPassword } from '../../lib/password.ts';
import { butuhStaf } from '../../lib/sesi.ts';
import { buatPasswordAcak } from '../../lib/util.ts';
import { usernameDipakai } from './siswa.ts';

export const rutAdminPengguna = Router();
rutAdminPengguna.use(butuhStaf('ADMIN'));

rutAdminPengguna.get('/', async (_req, res) => {
  const daftar = await prisma.pengguna.findMany({ orderBy: [{ peran: 'asc' }, { nama: 'asc' }] });
  res.json(daftar.map(({ passwordHash: _hash, ...p }) => p));
});

const skema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi.'),
  username: z.string().trim().toLowerCase().default(''),
  peran: z.enum(['ADMIN', 'GURU']),
  aktif: z.boolean().default(true),
  password: z.string().default(''),
});

const jumlahAdminAktifSelain = (id: string) =>
  prisma.pengguna.count({ where: { peran: 'ADMIN', aktif: true, id: { not: id } } });

rutAdminPengguna.post('/', async (req, res) => {
  const d = skema.parse(req.body);
  if (!/^[a-z0-9._-]{3,30}$/.test(d.username)) throw galat(400, 'Username harus 3 sampai 30 huruf kecil, angka, titik, garis bawah, atau strip.');
  if (await usernameDipakai(d.username)) throw galat(400, `Username ${d.username} sudah dipakai.`);
  const password = d.password || buatPasswordAcak();
  await prisma.pengguna.create({
    data: { nama: d.nama, username: d.username, peran: d.peran, aktif: d.aktif, passwordHash: await hashPassword(password) },
  });
  await catatLog(req.staf!, 'TAMBAH_PENGGUNA', `${d.username} (${d.peran})`);
  res.json({ pesan: 'Pengguna ditambahkan.', akun: [{ nama: d.nama, kelas: d.peran, username: d.username, password }] });
});

rutAdminPengguna.put('/:id', async (req, res) => {
  const d = skema.parse(req.body);
  const id = String(req.params.id);
  const lama = await prisma.pengguna.findUnique({ where: { id } });
  if (!lama) throw galat(404, 'Pengguna tidak ditemukan.');
  if ((d.peran !== 'ADMIN' || !d.aktif) && (await jumlahAdminAktifSelain(id)) === 0) {
    throw galat(400, 'Harus ada minimal satu admin aktif.');
  }
  await prisma.pengguna.update({
    where: { id },
    data: { nama: d.nama, peran: d.peran, aktif: d.aktif, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) },
  });
  if (!d.aktif) await prisma.sesiLogin.deleteMany({ where: { penggunaId: id } });
  await catatLog(req.staf!, 'UBAH_PENGGUNA', lama.username);
  res.json({ pesan: 'Pengguna diperbarui.' });
});

rutAdminPengguna.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (id === req.staf!.id) throw galat(400, 'Tidak bisa menghapus akun sendiri.');
  if ((await jumlahAdminAktifSelain(id)) === 0) throw galat(400, 'Harus ada minimal satu admin aktif.');
  const p = await prisma.pengguna.delete({ where: { id } }).catch(() => null);
  if (!p) throw galat(404, 'Pengguna tidak ditemukan.');
  await catatLog(req.staf!, 'HAPUS_PENGGUNA', p.username);
  res.json({ pesan: 'Pengguna dihapus.' });
});
