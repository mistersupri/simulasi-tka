import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.ts';
import { dariAplikasi } from '../lib/aplikasi.ts';
import { galat } from '../lib/galat.ts';
import { catatLog } from '../lib/log.ts';
import { cocokPassword } from '../lib/password.ts';
import { berkasPembaruan, latestYml } from '../lib/pembaruan.ts';
import { config } from '../config.ts';
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

/**
 * Pembaruan otomatis aplikasi Windows (electron-updater, provider generic).
 * Hanya untuk aplikasi ujian: installer membawa kunci aplikasi, jadi tidak dibagikan ke sembarang peramban.
 */
function pastikanAplikasi(req: Parameters<typeof dariAplikasi>[0]) {
  if (config.kunciAplikasi && !dariAplikasi(req)) throw galat(403, 'Pembaruan hanya untuk aplikasi ujian.');
}

rutAplikasi.get('/pembaruan/latest.yml', async (req, res) => {
  pastikanAplikasi(req);
  const b = await berkasPembaruan();
  if (!b) throw galat(404, 'Belum ada installer aplikasi di server.');
  res.type('text/yaml').set('Cache-Control', 'no-store').send(latestYml(b));
});

rutAplikasi.get('/pembaruan/:berkas', async (req, res) => {
  pastikanAplikasi(req);
  const b = await berkasPembaruan();
  if (!b || req.params.berkas !== b.nama) throw galat(404, 'Installer tidak ditemukan.');
  // Nama berkas sudah dicocokkan persis dengan installer terbaru; folder boleh berawalan titik.
  res.set('Cache-Control', 'no-store').sendFile(b.jalur, { dotfiles: 'allow' });
});
