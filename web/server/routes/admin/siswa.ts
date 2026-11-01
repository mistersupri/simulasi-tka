import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { hashPassword } from '../../lib/password.ts';
import { butuhStaf } from '../../lib/sesi.ts';
import { buatPasswordAcak, normalisasiKelas, teks } from '../../lib/util.ts';

export const rutAdminSiswa = Router();
rutAdminSiswa.use(butuhStaf('ADMIN'));

const MAKS_PER_PROSES = 50;
const usernameSah = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Username harus 3 sampai 30 huruf kecil, angka, titik, garis bawah, atau strip.');

export async function usernameDipakai(username: string) {
  const [s, p] = await Promise.all([
    prisma.siswa.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { id: true } }),
    prisma.pengguna.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { id: true } }),
  ]);
  return !!(s || p);
}

/** "Budi Santoso" → "budi" + 3 angka acak yang belum dipakai. */
async function usernameOtomatis(nama: string, terpakai: Set<string>) {
  const dasar = (teks(nama).toLowerCase().split(/\s+/)[0] ?? '').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'siswa';
  for (let i = 0; i < 200; i++) {
    const calon = dasar + String(100 + Math.floor(Math.random() * 900));
    if (!terpakai.has(calon) && !(await usernameDipakai(calon))) return calon;
  }
  throw galat(500, `Gagal membuat username untuk ${nama}.`);
}

const tampil = (s: { id: string; nisn: string; nama: string; kelas: string; username: string; aktif: boolean; loginTerakhir: Date | null }) =>
  ({ id: s.id, nisn: s.nisn, nama: s.nama, kelas: s.kelas, username: s.username, aktif: s.aktif, loginTerakhir: s.loginTerakhir });

rutAdminSiswa.get('/', async (_req, res) => {
  const siswa = await prisma.siswa.findMany({ orderBy: [{ kelas: 'asc' }, { nama: 'asc' }] });
  res.json(siswa.map(tampil));
});

const skemaSiswa = z.object({
  nisn: z.string().trim().default(''),
  nama: z.string().trim().min(1, 'Nama siswa wajib diisi.'),
  kelas: z.string().trim().min(1, 'Kelas wajib diisi.').transform(normalisasiKelas),
  username: z.string().trim().default(''),
  password: z.string().default(''),
  aktif: z.boolean().default(true),
});

rutAdminSiswa.post('/', async (req, res) => {
  const d = skemaSiswa.parse(req.body);
  const username = d.username ? usernameSah.parse(d.username) : await usernameOtomatis(d.nama, new Set());
  if (await usernameDipakai(username)) throw galat(400, `Username ${username} sudah dipakai.`);
  const password = d.password || buatPasswordAcak();
  await prisma.siswa.create({
    data: { nisn: d.nisn, nama: d.nama, kelas: d.kelas, username, aktif: d.aktif, passwordHash: await hashPassword(password) },
  });
  await catatLog(req.staf!, 'TAMBAH_SISWA', username);
  res.json({ pesan: 'Siswa ditambahkan.', akun: [{ nama: d.nama, kelas: d.kelas, username, password }] });
});

rutAdminSiswa.put('/:id', async (req, res) => {
  const d = skemaSiswa.parse(req.body);
  const lama = await prisma.siswa.findUnique({ where: { id: String(req.params.id) } });
  if (!lama) throw galat(404, 'Siswa tidak ditemukan.');
  await prisma.siswa.update({
    where: { id: lama.id },
    data: {
      nisn: d.nisn, nama: d.nama, kelas: d.kelas, aktif: d.aktif,
      ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}),
    },
  });
  if (!d.aktif) await prisma.sesiLogin.deleteMany({ where: { siswaId: lama.id } });
  await catatLog(req.staf!, 'UBAH_SISWA', lama.username);
  res.json({ pesan: 'Data siswa diperbarui.' });
});

const skemaIds = z.object({ ids: z.array(z.string()).min(1, 'Pilih minimal satu siswa.') });

rutAdminSiswa.post('/hapus', async (req, res) => {
  const { ids } = skemaIds.parse(req.body);
  const r = await prisma.siswa.deleteMany({ where: { id: { in: ids } } });
  await catatLog(req.staf!, 'HAPUS_SISWA', `${r.count} siswa`);
  res.json({ pesan: `${r.count} siswa dihapus. Hasil ujian mereka tetap tersimpan.` });
});

rutAdminSiswa.post('/status', async (req, res) => {
  const { ids, aktif } = skemaIds.extend({ aktif: z.boolean() }).parse(req.body);
  await prisma.siswa.updateMany({ where: { id: { in: ids } }, data: { aktif } });
  if (!aktif) await prisma.sesiLogin.deleteMany({ where: { siswaId: { in: ids } } });
  await catatLog(req.staf!, aktif ? 'AKTIFKAN_SISWA' : 'NONAKTIFKAN_SISWA', `${ids.length} siswa`);
  res.json({ pesan: `${ids.length} siswa ${aktif ? 'diaktifkan' : 'dinonaktifkan'}.` });
});

rutAdminSiswa.post('/reset-password', async (req, res) => {
  const { ids } = skemaIds.parse(req.body);
  if (ids.length > MAKS_PER_PROSES) throw galat(400, `Maksimal ${MAKS_PER_PROSES} siswa per proses.`);
  const siswa = await prisma.siswa.findMany({ where: { id: { in: ids } }, orderBy: [{ kelas: 'asc' }, { nama: 'asc' }] });
  const akun = [];
  for (const s of siswa) {
    const password = buatPasswordAcak();
    await prisma.siswa.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(password) } });
    akun.push({ nama: s.nama, kelas: s.kelas, username: s.username, password });
  }
  await prisma.sesiLogin.deleteMany({ where: { siswaId: { in: ids } } });
  await catatLog(req.staf!, 'RESET_PASSWORD_SISWA', `${akun.length} siswa`);
  res.json({ akun });
});

rutAdminSiswa.post('/impor', async (req, res) => {
  const { baris } = z.object({
    baris: z.array(z.object({
      nomor: z.number(), nisn: z.string().default(''), nama: z.string().default(''),
      kelas: z.string().default(''), username: z.string().default(''), password: z.string().default(''),
    })).max(MAKS_PER_PROSES, `Maksimal ${MAKS_PER_PROSES} baris per proses.`),
  }).parse(req.body);

  const akun = [];
  const ditolak = [];
  const terpakai = new Set<string>();
  for (const b of baris) {
    try {
      const nama = teks(b.nama);
      const kelas = normalisasiKelas(b.kelas);
      if (!nama || !kelas) throw galat(400, 'Nama dan kelas wajib diisi.');
      const usernameMentah = teks(b.username);
      const username = usernameMentah ? usernameSah.parse(usernameMentah) : await usernameOtomatis(nama, terpakai);
      if (terpakai.has(username) || (await usernameDipakai(username))) throw galat(400, `Username ${username} sudah dipakai.`);
      const password = teks(b.password) || buatPasswordAcak();
      await prisma.siswa.create({ data: { nisn: teks(b.nisn), nama, kelas, username, passwordHash: await hashPassword(password) } });
      terpakai.add(username);
      akun.push({ nama, kelas, username, password });
    } catch (err) {
      const pesan = err instanceof z.ZodError ? err.issues[0]?.message : (err as Error).message;
      ditolak.push({ nomor: b.nomor, nama: b.nama, alasan: pesan });
    }
  }
  if (akun.length) await catatLog(req.staf!, 'IMPOR_SISWA', `${akun.length} siswa`);
  res.json({ akun, ditolak });
});
