import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Peran } from '../../db.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { hashPassword } from '../../lib/password.ts';
import { butuhStaf, filterSekolah, type Staf } from '../../lib/sesi.ts';
import { buatPasswordAcak } from '../../lib/util.ts';

/**
 * Akun staf.
 * - Admin instansi: semua akun (admin, operator, guru) di semua sekolah.
 * - Operator sekolah: hanya akun guru di sekolahnya sendiri.
 */
export const rutAdminPengguna = Router();
rutAdminPengguna.use(butuhStaf('ADMIN', 'OPERATOR'));

rutAdminPengguna.get('/', async (req, res) => {
  const staf = req.staf!;
  const daftar = await prisma.pengguna.findMany({
    where: staf.peran === 'ADMIN' ? filterSekolah(staf, req.query.sekolahId) : { sekolahId: staf.sekolahId, peran: 'GURU' },
    include: { sekolah: { select: { nama: true } } },
    orderBy: [{ peran: 'asc' }, { nama: 'asc' }],
  });
  res.json(daftar.map(({ passwordHash: _hash, sekolah, ...p }) => ({ ...p, namaSekolah: sekolah?.nama ?? null })));
});

const skema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi.'),
  username: z.string().trim().toLowerCase().default(''),
  peran: z.enum(['ADMIN', 'OPERATOR', 'GURU']),
  sekolahId: z.string().nullish(),
  aktif: z.boolean().default(true),
  password: z.string().default(''),
});

/** Menentukan peran & sekolah yang sah sesuai siapa yang menyimpan. */
async function peranDanSekolah(staf: Staf, d: z.infer<typeof skema>): Promise<{ peran: Peran; sekolahId: string | null }> {
  if (staf.peran === 'OPERATOR') {
    if (d.peran !== 'GURU') throw galat(403, 'Operator sekolah hanya bisa mengelola akun guru.');
    return { peran: 'GURU', sekolahId: staf.sekolahId };
  }
  if (d.peran === 'ADMIN') return { peran: 'ADMIN', sekolahId: null };
  if (!d.sekolahId) throw galat(400, 'Pilih sekolah untuk akun operator atau guru.');
  if (!(await prisma.sekolah.findUnique({ where: { id: d.sekolahId }, select: { id: true } }))) throw galat(400, 'Sekolah tidak ditemukan.');
  return { peran: d.peran, sekolahId: d.sekolahId };
}

/** Akun yang boleh diubah/dihapus oleh staf ini. */
async function akunTerjangkau(staf: Staf, id: string) {
  const p = await prisma.pengguna.findUnique({ where: { id } });
  if (!p) throw galat(404, 'Pengguna tidak ditemukan.');
  if (staf.peran === 'OPERATOR' && (p.peran !== 'GURU' || p.sekolahId !== staf.sekolahId)) throw galat(404, 'Pengguna tidak ditemukan.');
  return p;
}

/** Username petugas unik di seluruh instansi (login petugas tanpa memilih sekolah). */
export const usernameStafDipakai = async (username: string) =>
  !!(await prisma.pengguna.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { id: true } }));

const jumlahAdminAktifSelain = (id: string) =>
  prisma.pengguna.count({ where: { peran: 'ADMIN', aktif: true, id: { not: id } } });

rutAdminPengguna.post('/', async (req, res) => {
  const d = skema.parse(req.body);
  if (!/^[a-z0-9._-]{3,30}$/.test(d.username)) throw galat(400, 'Username harus 3 sampai 30 huruf kecil, angka, titik, garis bawah, atau strip.');
  if (await usernameStafDipakai(d.username)) throw galat(400, `Username ${d.username} sudah dipakai.`);
  const { peran, sekolahId } = await peranDanSekolah(req.staf!, d);
  const password = d.password || buatPasswordAcak();
  await prisma.pengguna.create({
    data: { nama: d.nama, username: d.username, peran, sekolahId, aktif: d.aktif, passwordHash: await hashPassword(password) },
  });
  await catatLog(req.staf!, 'TAMBAH_PENGGUNA', `${d.username} (${peran})`);
  res.json({ pesan: 'Pengguna ditambahkan.', akun: [{ nama: d.nama, kelas: peran, username: d.username, password }] });
});

rutAdminPengguna.put('/:id', async (req, res) => {
  const d = skema.parse(req.body);
  const id = String(req.params.id);
  const lama = await akunTerjangkau(req.staf!, id);
  const { peran, sekolahId } = await peranDanSekolah(req.staf!, d);
  if (lama.peran === 'ADMIN' && (peran !== 'ADMIN' || !d.aktif) && (await jumlahAdminAktifSelain(id)) === 0) {
    throw galat(400, 'Harus ada minimal satu admin instansi aktif.');
  }
  await prisma.pengguna.update({
    where: { id },
    data: { nama: d.nama, peran, sekolahId, aktif: d.aktif, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) },
  });
  // Peran, sekolah, atau status berubah: paksa login ulang agar hak akses ikut berubah.
  if (!d.aktif || peran !== lama.peran || sekolahId !== lama.sekolahId || d.password) {
    await prisma.sesiLogin.deleteMany({ where: { penggunaId: id, ...(id === req.staf!.id ? { NOT: { token: req.cookies?.tka_staf ?? '' } } : {}) } });
  }
  await catatLog(req.staf!, 'UBAH_PENGGUNA', lama.username);
  res.json({ pesan: 'Pengguna diperbarui.' });
});

rutAdminPengguna.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (id === req.staf!.id) throw galat(400, 'Tidak bisa menghapus akun sendiri.');
  const p = await akunTerjangkau(req.staf!, id);
  if (p.peran === 'ADMIN' && (await jumlahAdminAktifSelain(id)) === 0) throw galat(400, 'Harus ada minimal satu admin instansi aktif.');
  await prisma.pengguna.delete({ where: { id } });
  await catatLog(req.staf!, 'HAPUS_PENGGUNA', p.username);
  res.json({ pesan: 'Pengguna dihapus.' });
});
