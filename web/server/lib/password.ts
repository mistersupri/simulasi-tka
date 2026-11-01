import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.ts';
import { galat } from './galat.ts';

const scrypt = promisify(crypto.scrypt) as (p: string, s: Buffer, n: number, o: crypto.ScryptOptions) => Promise<Buffer>;
const N = 16384;

/**
 * Format tersimpan:
 *   scrypt$<N>$<salt base64>$<hash base64>   (akun baru)
 *   sha256x$<iterasi>$<salt>$<hash hex>       (akun impor dari versi Google Sheets)
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < config.panjangPasswordMin) {
    throw galat(400, `Kata sandi minimal ${config.panjangPasswordMin} karakter.`);
  }
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32, { N });
  return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Hash dari lembar DATA_SISWA lama (PASSWORD_HASH + PASSWORD_SALT). */
export function hashDariSheetLama(hash: string, salt: string): string {
  return `sha256x$10000$${salt}$${hash.toLowerCase()}`;
}

function sha256Berulang(password: string, salt: string, iterasi: number): string {
  let hasil = `${password}:${salt}`;
  for (let i = 0; i < iterasi; i++) hasil = crypto.createHash('sha256').update(hasil, 'utf8').digest('hex');
  return hasil;
}

function samaAman(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** perluUpgrade = true bila hash lama sebaiknya diganti ke scrypt setelah login berhasil. */
export async function cocokPassword(password: string, tersimpan: string): Promise<{ cocok: boolean; perluUpgrade: boolean }> {
  const bagian = tersimpan.split('$');
  if (bagian[0] === 'scrypt' && bagian.length === 4) {
    const hash = await scrypt(password, Buffer.from(bagian[2], 'base64'), 32, { N: Number(bagian[1]) });
    return { cocok: samaAman(hash.toString('base64'), bagian[3]), perluUpgrade: false };
  }
  if (bagian[0] === 'sha256x' && bagian.length === 4) {
    return { cocok: samaAman(sha256Berulang(password, bagian[2], Number(bagian[1])), bagian[3]), perluUpgrade: true };
  }
  return { cocok: false, perluUpgrade: false };
}
