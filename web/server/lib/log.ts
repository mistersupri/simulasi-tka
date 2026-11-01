import { prisma } from '../db.ts';
import type { Staf } from './sesi.ts';

export async function catatLog(staf: Pick<Staf, 'username' | 'peran'> | null, aksi: string, detail = '') {
  try {
    await prisma.logAktivitas.create({
      data: { pengguna: staf?.username ?? '-', peran: staf?.peran ?? 'SISTEM', aksi, detail: detail.slice(0, 2000) },
    });
  } catch (err) {
    console.error('Gagal mencatat log:', err);
  }
}
