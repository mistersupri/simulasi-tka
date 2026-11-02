import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { butuhStaf } from '../../lib/sesi.ts';

/** Daftar sekolah binaan instansi. Hanya admin instansi yang boleh mengubah. */
export const rutAdminSekolah = Router();

/** Daftar ringkas untuk pilihan (filter, form). Operator & guru hanya melihat sekolahnya. */
rutAdminSekolah.get('/pilihan', butuhStaf(), async (req, res) => {
  const staf = req.staf!;
  const daftar = await prisma.sekolah.findMany({
    where: staf.peran === 'ADMIN' ? {} : { id: staf.sekolahId ?? '' },
    orderBy: { nama: 'asc' },
    select: { id: true, nama: true, npsn: true, aktif: true },
  });
  res.json(daftar);
});

rutAdminSekolah.use(butuhStaf('ADMIN'));

rutAdminSekolah.get('/', async (_req, res) => {
  const [sekolah, siswa, pengguna, hasil] = await Promise.all([
    prisma.sekolah.findMany({ orderBy: { nama: 'asc' } }),
    prisma.siswa.groupBy({ by: ['sekolahId'], _count: true }),
    prisma.pengguna.groupBy({ by: ['sekolahId', 'peran'], _count: true }),
    prisma.hasil.groupBy({ by: ['sekolahId'], _count: true, _avg: { nilai: true } }),
  ]);
  const jumlahSiswa = new Map(siswa.map((s) => [s.sekolahId, s._count]));
  const petaHasil = new Map(hasil.map((h) => [h.sekolahId, h]));
  res.json(sekolah.map((s) => ({
    ...s,
    jumlahSiswa: jumlahSiswa.get(s.id) ?? 0,
    jumlahOperator: pengguna.find((p) => p.sekolahId === s.id && p.peran === 'OPERATOR')?._count ?? 0,
    jumlahGuru: pengguna.find((p) => p.sekolahId === s.id && p.peran === 'GURU')?._count ?? 0,
    jumlahHasil: petaHasil.get(s.id)?._count ?? 0,
    rataRata: petaHasil.get(s.id)?._avg.nilai == null ? null : Math.round(petaHasil.get(s.id)!._avg.nilai!),
  })));
});

const skema = z.object({
  nama: z.string().trim().min(1, 'Nama sekolah wajib diisi.').max(150),
  npsn: z.string().trim().default('').refine((v) => !v || /^\d{8}$/.test(v), 'NPSN harus 8 angka.').transform((v) => v || null),
  alamat: z.string().trim().max(300).default(''),
  aktif: z.boolean().default(true),
});

async function npsnDipakai(npsn: string | null, kecuali?: string) {
  if (!npsn) return false;
  const ada = await prisma.sekolah.findUnique({ where: { npsn }, select: { id: true } });
  return !!ada && ada.id !== kecuali;
}

rutAdminSekolah.post('/', async (req, res) => {
  const d = skema.parse(req.body);
  if (await npsnDipakai(d.npsn)) throw galat(400, `NPSN ${d.npsn} sudah terdaftar.`);
  const s = await prisma.sekolah.create({ data: d });
  await catatLog(req.staf!, 'TAMBAH_SEKOLAH', s.nama);
  res.json({ pesan: 'Sekolah ditambahkan.', id: s.id });
});

rutAdminSekolah.put('/:id', async (req, res) => {
  const d = skema.parse(req.body);
  const id = String(req.params.id);
  if (await npsnDipakai(d.npsn, id)) throw galat(400, `NPSN ${d.npsn} sudah terdaftar.`);
  const s = await prisma.sekolah.update({ where: { id }, data: d }).catch(() => null);
  if (!s) throw galat(404, 'Sekolah tidak ditemukan.');
  if (!d.aktif) {
    // Keluarkan semua siswa, guru, dan operator sekolah itu.
    await prisma.sesiLogin.deleteMany({ where: { OR: [{ siswa: { sekolahId: id } }, { pengguna: { sekolahId: id } }] } });
  }
  await catatLog(req.staf!, 'UBAH_SEKOLAH', `${s.nama}${d.aktif ? '' : ' (nonaktif)'}`);
  res.json({ pesan: 'Data sekolah diperbarui.' });
});

/** Hanya sekolah tanpa siswa & akun yang bisa dihapus; selebihnya cukup dinonaktifkan. */
rutAdminSekolah.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const [siswa, pengguna] = await Promise.all([prisma.siswa.count({ where: { sekolahId: id } }), prisma.pengguna.count({ where: { sekolahId: id } })]);
  if (siswa || pengguna) {
    throw galat(400, `Sekolah masih punya ${siswa} siswa dan ${pengguna} akun guru/operator. Hapus atau pindahkan dulu, atau nonaktifkan sekolah.`);
  }
  const s = await prisma.sekolah.delete({ where: { id } }).catch(() => null);
  if (!s) throw galat(404, 'Sekolah tidak ditemukan.');
  // Hapus juga dari daftar peserta ujian. Daftar kosong berarti "semua sekolah",
  // jadi ujian yang tadinya hanya untuk sekolah ini dinonaktifkan.
  const ujian = await prisma.ujian.findMany({ where: { sekolah: { has: id } }, select: { id: true, sekolah: true } });
  for (const u of ujian) {
    const sisa = u.sekolah.filter((x) => x !== id);
    await prisma.ujian.update({ where: { id: u.id }, data: { sekolah: sisa, ...(sisa.length ? {} : { aktif: false }) } });
  }
  await catatLog(req.staf!, 'HAPUS_SEKOLAH', s.nama);
  res.json({ pesan: 'Sekolah dihapus. Hasil ujian lamanya tetap tersimpan.' });
});
