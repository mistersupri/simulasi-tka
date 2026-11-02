import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';
import { prisma, type Peran } from '../db.ts';
import { galat } from './galat.ts';

export const COOKIE = { SISWA: 'tka_siswa', STAF: 'tka_staf' } as const;

export type SiswaSesi = { id: string; nisn: string; nama: string; kelas: string; username: string; sekolahId: string; namaSekolah: string };
/** sekolahId null hanya untuk ADMIN (instansi). */
export type Staf = { id: string; nama: string; username: string; peran: Peran; sekolahId: string | null; namaSekolah: string | null };

declare global {
  namespace Express {
    interface Request {
      siswa?: SiswaSesi;
      staf?: Staf;
    }
  }
}

const opsiCookie = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.cookieSecure,
  path: '/',
  maxAge: config.lamaSesiJam * 3600 * 1000,
});

export async function mulaiSesi(res: Response, jenis: 'SISWA' | 'STAF', id: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.sesiLogin.create({
    data: {
      token,
      jenis,
      siswaId: jenis === 'SISWA' ? id : null,
      penggunaId: jenis === 'STAF' ? id : null,
      kadaluarsa: new Date(Date.now() + config.lamaSesiJam * 3600 * 1000),
    },
  });
  res.cookie(COOKIE[jenis], token, opsiCookie());
}

export async function akhiriSesi(req: Request, res: Response, jenis: 'SISWA' | 'STAF') {
  const token = req.cookies?.[COOKIE[jenis]];
  if (token) await prisma.sesiLogin.deleteMany({ where: { token } });
  res.clearCookie(COOKIE[jenis], { path: '/' });
}

async function bacaSesi(req: Request, jenis: 'SISWA' | 'STAF') {
  const token = req.cookies?.[COOKIE[jenis]];
  if (!token) return null;
  const sesi = await prisma.sesiLogin.findUnique({
    where: { token },
    include: { siswa: { include: { sekolah: true } }, pengguna: { include: { sekolah: true } } },
  });
  if (!sesi || sesi.jenis !== jenis || sesi.kadaluarsa < new Date()) return null;
  return sesi;
}

export async function siswaDariRequest(req: Request): Promise<SiswaSesi | null> {
  const sesi = await bacaSesi(req, 'SISWA');
  const s = sesi?.siswa;
  if (!s || !s.aktif || !s.sekolah.aktif) return null;
  return { id: s.id, nisn: s.nisn, nama: s.nama, kelas: s.kelas, username: s.username, sekolahId: s.sekolahId, namaSekolah: s.sekolah.nama };
}

export async function stafDariRequest(req: Request): Promise<Staf | null> {
  const sesi = await bacaSesi(req, 'STAF');
  const p = sesi?.pengguna;
  if (!p || !p.aktif) return null;
  if (p.peran !== 'ADMIN' && (!p.sekolah || !p.sekolah.aktif)) return null;
  return {
    id: p.id, nama: p.nama, username: p.username, peran: p.peran,
    sekolahId: p.peran === 'ADMIN' ? null : p.sekolahId, namaSekolah: p.peran === 'ADMIN' ? null : (p.sekolah?.nama ?? null),
  };
}

export async function butuhSiswa(req: Request, _res: Response, next: NextFunction) {
  const siswa = await siswaDariRequest(req);
  if (!siswa) throw galat(401, 'Sesi login berakhir. Silakan masuk kembali.');
  req.siswa = siswa;
  next();
}

const NAMA_PERAN: Record<Peran, string> = { ADMIN: 'admin instansi', OPERATOR: 'operator sekolah', GURU: 'guru' };

/** Tanpa argumen: semua peran staf boleh. */
export function butuhStaf(...peran: Peran[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const staf = await stafDariRequest(req);
    if (!staf) throw galat(401, 'Sesi login berakhir. Silakan masuk kembali.');
    if (peran.length && !peran.includes(staf.peran)) {
      throw galat(403, `Akses ditolak. Fitur ini hanya untuk ${peran.map((p) => NAMA_PERAN[p]).join(' dan ')}.`);
    }
    req.staf = staf;
    next();
  };
}

// Penguncian sementara setelah beberapa kali salah kata sandi. Disimpan di database
// (tabel GagalLogin) agar berlaku untuk semua proses/instance server.

export async function cekKunciLogin(kunci: string) {
  const data = await prisma.gagalLogin.findUnique({ where: { kunci } });
  if (data && data.sampai > new Date() && data.jumlah >= config.maksGagalLogin) {
    throw galat(429, `Terlalu banyak percobaan gagal. Coba lagi dalam ${config.lamaKunciLoginMenit} menit.`);
  }
}

/** Tambah hitungan secara atomik; hitungan mulai dari 1 lagi bila masa kunci sebelumnya sudah lewat. */
export async function catatGagalLogin(kunci: string) {
  const sampai = new Date(Date.now() + config.lamaKunciLoginMenit * 60 * 1000);
  await prisma.$executeRaw`
    INSERT INTO "GagalLogin" ("kunci", "jumlah", "sampai") VALUES (${kunci}, 1, ${sampai})
    ON CONFLICT ("kunci") DO UPDATE SET
      "jumlah" = CASE WHEN "GagalLogin"."sampai" > NOW() THEN "GagalLogin"."jumlah" + 1 ELSE 1 END,
      "sampai" = EXCLUDED."sampai"`;
}

export const hapusGagalLogin = (kunci: string) => prisma.gagalLogin.deleteMany({ where: { kunci } });

/** Pembersihan berkala catatan yang masa kuncinya sudah lewat. */
export const bersihkanGagalLogin = () => prisma.gagalLogin.deleteMany({ where: { sampai: { lt: new Date() } } });

/** Dipakai tes agar penguncian dari satu tes tidak terbawa ke tes lain. */
export const kosongkanGagalLogin = () => prisma.gagalLogin.deleteMany();

/**
 * Batas data sekolah untuk staf: null = semua sekolah (admin instansi),
 * selain itu id sekolah staf. Dipakai sebagai filter Prisma.
 */
export function sekolahStaf(staf: Staf): string | null {
  return staf.peran === 'ADMIN' ? null : staf.sekolahId;
}

/** Filter `where` untuk model yang punya kolom sekolahId (Siswa, Hasil, Pengguna). */
export function filterSekolah(staf: Staf, pilihan?: unknown): { sekolahId?: string } {
  const milik = sekolahStaf(staf);
  if (milik) return { sekolahId: milik };
  return typeof pilihan === 'string' && pilihan ? { sekolahId: pilihan } : {};
}

/** Galat 404 bila data milik sekolah lain (tanpa membocorkan bahwa data itu ada). */
export function pastikanSekolah(staf: Staf, sekolahId: string | null | undefined, pesan = 'Data tidak ditemukan.') {
  const milik = sekolahStaf(staf);
  if (milik && sekolahId !== milik) throw galat(404, pesan);
}
