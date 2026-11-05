/**
 * Pembaruan otomatis aplikasi ujian Windows. Installer NSIS (Ujian-TKA-Setup-<versi>.exe) diletakkan di
 * PEMBARUAN_DIR (image Docker dan paket server rilis sudah membawanya). Server membuat latest.yml untuk
 * electron-updater (provider "generic") dari berkas itu: versi, ukuran, dan sha512.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';

const POLA = /^Ujian-TKA-Setup-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.exe$/;

export type BerkasPembaruan = { nama: string; versi: string; jalur: string; ukuran: number; sha512: string; tanggal: Date };

let cache: { kunci: string; data: BerkasPembaruan } | null = null;

function hitungSha512(jalur: string): Promise<string> {
  return new Promise((selesai, gagal) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(jalur).on('data', (b) => hash.update(b)).on('error', gagal).on('end', () => selesai(hash.digest('base64')));
  });
}

/** Installer terbaru di folder pembaruan, atau null bila tidak ada. */
export async function berkasPembaruan(): Promise<BerkasPembaruan | null> {
  let nama: string[];
  try {
    nama = fs.readdirSync(config.pembaruanDir);
  } catch {
    return null;
  }
  const calon = nama
    .map((n) => ({ n, m: POLA.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => !!x.m)
    .sort((a, b) => b.m[1].localeCompare(a.m[1], 'en', { numeric: true }));
  if (!calon.length) return null;
  const { n, m } = calon[0];
  const jalur = path.join(config.pembaruanDir, n);
  const stat = fs.statSync(jalur);
  const kunci = `${jalur}:${stat.size}:${stat.mtimeMs}`;
  if (cache?.kunci === kunci) return cache.data;
  const data = { nama: n, versi: m[1], jalur, ukuran: stat.size, sha512: await hitungSha512(jalur), tanggal: stat.mtime };
  cache = { kunci, data };
  return data;
}

/** latest.yml untuk electron-updater. */
export function latestYml(b: BerkasPembaruan): string {
  return [
    `version: ${b.versi}`,
    'files:',
    `  - url: ${b.nama}`,
    `    sha512: ${b.sha512}`,
    `    size: ${b.ukuran}`,
    `path: ${b.nama}`,
    `sha512: ${b.sha512}`,
    `releaseDate: '${b.tanggal.toISOString()}'`,
    '',
  ].join('\n');
}
