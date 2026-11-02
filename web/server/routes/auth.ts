import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.ts';
import { galat } from '../lib/galat.ts';
import { catatLog } from '../lib/log.ts';
import { cocokPassword, hashPassword } from '../lib/password.ts';
import { ambilPengaturan } from '../lib/pengaturan.ts';
import {
  akhiriSesi, catatGagalLogin, cekKunciLogin, hapusGagalLogin, mulaiSesi, siswaDariRequest, stafDariRequest,
} from '../lib/sesi.ts';

export const rutAuth = Router();

const skemaLogin = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Username wajib diisi.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});
const jenisDari = (v: unknown) => (v === 'staf' ? 'STAF' : 'SISWA') as 'SISWA' | 'STAF';

async function profilSiswa(s: { nama: string; kelas: string; username: string; nisn: string; namaSekolah: string }) {
  const p = await ambilPengaturan();
  return {
    jenis: 'siswa' as const, nama: s.nama, kelas: s.kelas, username: s.username, nisn: s.nisn, namaSekolah: s.namaSekolah,
    bolehGantiPassword: p.SISWA_BOLEH_GANTI_PASSWORD === 'YA',
  };
}

const PESAN_SEKOLAH_NONAKTIF = 'Sekolah Anda sedang dinonaktifkan. Silakan hubungi Suku Dinas Pendidikan.';

/**
 * Username siswa unik per sekolah. Bila sekolah tidak dikirim dan username hanya
 * ada di satu sekolah, login tetap berhasil; bila ada di beberapa sekolah, siswa diminta memilih.
 */
rutAuth.post('/siswa/login', async (req, res) => {
  const { username, password, sekolahId } = skemaLogin.extend({ sekolahId: z.string().nullish() }).parse(req.body);
  const cocok = await prisma.siswa.findMany({
    where: { username: { equals: username, mode: 'insensitive' }, ...(sekolahId ? { sekolahId } : {}) },
    include: { sekolah: true },
    take: 2,
  });
  if (cocok.length > 1) throw galat(400, 'Pilih sekolah Anda terlebih dahulu.');
  const siswa = cocok[0];
  // Kunci per akun, sehingga mengganti pilihan sekolah tidak menambah jatah percobaan.
  const kunci = siswa ? `siswa:${siswa.id}` : `siswa:?:${sekolahId ?? ''}:${username}`;
  await cekKunciLogin(kunci);

  const cek = siswa ? await cocokPassword(password, siswa.passwordHash) : { cocok: false, perluUpgrade: false };
  if (!siswa || !cek.cocok) {
    await catatGagalLogin(kunci);
    throw galat(401, 'Username atau kata sandi salah.');
  }
  if (!siswa.aktif) throw galat(403, 'Akun belum aktif. Silakan hubungi operator sekolah.');
  if (!siswa.sekolah.aktif) throw galat(403, PESAN_SEKOLAH_NONAKTIF);

  await hapusGagalLogin(kunci);
  await prisma.siswa.update({
    where: { id: siswa.id },
    data: { loginTerakhir: new Date(), ...(cek.perluUpgrade ? { passwordHash: await hashPassword(password) } : {}) },
  });
  await mulaiSesi(res, 'SISWA', siswa.id);
  res.json({ profil: await profilSiswa({ ...siswa, namaSekolah: siswa.sekolah.nama }) });
});

rutAuth.post('/staf/login', async (req, res) => {
  const { username, password } = skemaLogin.parse(req.body);
  const kunci = `staf:${username}`;
  await cekKunciLogin(kunci);

  const p = await prisma.pengguna.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, include: { sekolah: true } });
  const cek = p ? await cocokPassword(password, p.passwordHash) : { cocok: false, perluUpgrade: false };
  if (!p || !cek.cocok) {
    await catatGagalLogin(kunci);
    throw galat(401, 'Username atau kata sandi salah.');
  }
  if (!p.aktif) throw galat(403, 'Akun tidak aktif.');
  if (p.peran !== 'ADMIN' && !p.sekolah?.aktif) throw galat(403, PESAN_SEKOLAH_NONAKTIF);

  await hapusGagalLogin(kunci);
  await prisma.pengguna.update({ where: { id: p.id }, data: { loginTerakhir: new Date() } });
  await mulaiSesi(res, 'STAF', p.id);
  await catatLog(p, 'LOGIN');
  const admin = p.peran === 'ADMIN';
  res.json({
    profil: {
      jenis: 'staf', id: p.id, nama: p.nama, username: p.username, peran: p.peran,
      sekolahId: admin ? null : p.sekolahId, namaSekolah: admin ? null : (p.sekolah?.nama ?? null),
    },
  });
});

/** profil: null berarti belum login (bukan galat, agar konsol browser bersih). */
rutAuth.get('/saya', async (req, res) => {
  if (jenisDari(req.query.jenis) === 'SISWA') {
    const s = await siswaDariRequest(req);
    res.json({ profil: s ? await profilSiswa(s) : null });
  } else {
    const s = await stafDariRequest(req);
    res.json({ profil: s ? { jenis: 'staf', ...s } : null });
  }
});

rutAuth.post('/keluar', async (req, res) => {
  await akhiriSesi(req, res, jenisDari(req.body?.jenis));
  res.json({ ok: true });
});

rutAuth.post('/ganti-password', async (req, res) => {
  const { jenis, lama, baru } = z.object({ jenis: z.enum(['siswa', 'staf']), lama: z.string(), baru: z.string() }).parse(req.body);
  if (jenis === 'siswa') {
    const s = await siswaDariRequest(req);
    if (!s) throw galat(401, 'Sesi login berakhir.');
    if ((await ambilPengaturan()).SISWA_BOLEH_GANTI_PASSWORD !== 'YA') throw galat(403, 'Penggantian kata sandi oleh siswa sedang dinonaktifkan.');
    const data = await prisma.siswa.findUniqueOrThrow({ where: { id: s.id } });
    if (!(await cocokPassword(lama, data.passwordHash)).cocok) throw galat(400, 'Kata sandi lama salah.');
    await prisma.siswa.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(baru) } });
  } else {
    const s = await stafDariRequest(req);
    if (!s) throw galat(401, 'Sesi login berakhir.');
    const data = await prisma.pengguna.findUniqueOrThrow({ where: { id: s.id } });
    if (!(await cocokPassword(lama, data.passwordHash)).cocok) throw galat(400, 'Kata sandi lama salah.');
    await prisma.pengguna.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(baru) } });
    await catatLog(s, 'GANTI_PASSWORD');
  }
  res.json({ pesan: 'Kata sandi berhasil diganti.' });
});
