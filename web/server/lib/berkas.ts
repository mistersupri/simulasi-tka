import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import { config } from '../config.ts';
import { galat } from './galat.ts';

export type Folder = 'gambar' | 'pelanggaran' | 'layar';

export const unggah = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.ukuranGambarMaks } });

/** Berkas impor soal (.xlsx atau .zip beserta gambarnya). */
export const unggahImpor = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });

/** Mengenali jenis gambar dari isi berkas, bukan dari nama/header yang bisa dipalsukan. */
function jenisGambar(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export async function simpanGambar(buf: Buffer | undefined, folder: Folder): Promise<string> {
  if (!buf?.length) throw galat(400, 'Berkas gambar kosong.');
  const ext = jenisGambar(buf);
  if (!ext) throw galat(400, 'Format gambar harus PNG, JPG, GIF, atau WEBP.');
  const nama = `${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(path.join(config.uploadDir, folder), { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, folder, nama), buf);
  return nama;
}

/** Path aman: hanya nama berkas yang kita buat sendiri yang diterima. */
export function pathBerkas(folder: Folder, nama: string): string {
  if (!/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(nama)) throw galat(404, 'Berkas tidak ditemukan.');
  return path.join(config.uploadDir, folder, nama);
}

export async function hapusBerkas(folder: Folder, nama: string | null | undefined) {
  if (!nama) return;
  await fs.rm(pathBerkas(folder, nama), { force: true }).catch(() => {});
}

/** Mengirim berkas unggahan. Memakai `root` agar folder induk berawalan titik tetap bisa dipakai. */
export function kirimBerkas(res: Response, folder: Folder, nama: string, maxAge: string | number = 0) {
  pathBerkas(folder, nama);
  res.sendFile(nama, { root: path.join(config.uploadDir, folder), maxAge });
}

/**
 * Memastikan folder unggahan bisa ditulis. Dipanggil saat server mulai agar masalah izin terlihat jelas
 * di log sejak awal, bukan baru saat guru mengunggah gambar atau siswa mengirim foto bukti.
 */
export async function periksaFolderUnggah(): Promise<string | null> {
  const folder = path.join(config.uploadDir, 'gambar');
  try {
    await fs.mkdir(folder, { recursive: true });
    const uji = path.join(folder, `.uji-${process.pid}`);
    await fs.writeFile(uji, '');
    await fs.rm(uji, { force: true });
    return null;
  } catch (err) {
    const kode = (err as NodeJS.ErrnoException).code;
    return `Folder unggahan ${config.uploadDir} tidak bisa ditulis (${kode ?? 'galat'}). Gambar soal, logo, dan foto bukti pelanggaran akan gagal disimpan. ` +
      'Docker: pastikan volume dapat ditulis user "node" (entrypoint image memperbaikinya otomatis bila container dijalankan sebagai root). ' +
      'Tanpa Docker: jalankan `chown -R <user-server> ' + config.uploadDir + '`.';
  }
}
