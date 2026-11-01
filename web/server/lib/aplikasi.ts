/**
 * Mengenali permintaan dari aplikasi ujian Windows (folder desktop/).
 *
 * Aplikasi mengirim header  X-TKA-Aplikasi: <menit>.<hmac>
 * dengan hmac = HMAC-SHA256(KUNCI_APLIKASI, "simulasi-tka:<menit>"), menit = Date.now()/60000.
 * Header berganti tiap menit sehingga tidak bisa dipakai ulang lama-lama.
 * Ini mempersulit, bukan mustahil: kunci tertanam di installer.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config.ts';

export const HEADER_APLIKASI = 'x-tka-aplikasi';

export function tandaAplikasi(kunci: string, menit: number): string {
  return `${menit}.${crypto.createHmac('sha256', kunci).update(`simulasi-tka:${menit}`).digest('hex')}`;
}

export function dariAplikasi(req: Request): boolean {
  if (!config.kunciAplikasi) return false;
  const nilai = req.get(HEADER_APLIKASI) ?? '';
  const menit = Number(nilai.split('.')[0]);
  if (!Number.isInteger(menit)) return false;
  const sekarang = Math.floor(Date.now() / 60000);
  if (Math.abs(sekarang - menit) > config.toleransiJamAplikasiMenit) return false;
  const harapan = Buffer.from(tandaAplikasi(config.kunciAplikasi, menit));
  const diterima = Buffer.from(nilai);
  return harapan.length === diterima.length && crypto.timingSafeEqual(harapan, diterima);
}
