import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.ts';
import { dariAplikasi } from '../lib/aplikasi.ts';
import { galat } from '../lib/galat.ts';
import { catatLog } from '../lib/log.ts';
import { cocokPassword } from '../lib/password.ts';
import { catatGagalLogin, cekKunciLogin, hapusGagalLogin } from '../lib/sesi.ts';

export const rutAplikasi = Router();

/**
 * Pengawas (akun guru/admin) mengizinkan aplikasi ujian ditutup saat ujian berjalan.
 * Dipanggil dari jendela kata sandi milik aplikasi Windows.
 */
rutAplikasi.post('/izin-keluar', async (req, res) => {
  const { username, password } = z.object({
    username: z.string().trim().toLowerCase().min(1, 'Username pengawas wajib diisi.'),
    password: z.string().min(1, 'Kata sandi wajib diisi.'),
  }).parse(req.body);
  const kunci = `keluar:${username}`;
  cekKunciLogin(kunci);
  const p = await prisma.pengguna.findFirst({ where: { username: { equals: username, mode: 'insensitive' }, aktif: true } });
  if (!p || !(await cocokPassword(password, p.passwordHash)).cocok) {
    catatGagalLogin(kunci);
    throw galat(401, 'Username atau kata sandi pengawas salah.');
  }
  hapusGagalLogin(kunci);
  await catatLog(p, 'IZIN_KELUAR_APLIKASI', dariAplikasi(req) ? 'dari aplikasi ujian' : 'dari luar aplikasi');
  res.json({ ok: true });
});
