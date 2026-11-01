import crypto from 'node:crypto';

export const HURUF = ['A', 'B', 'C', 'D'] as const;

export function teks(nilai: unknown): string {
  return nilai === null || nilai === undefined ? '' : String(nilai).trim();
}

/** "6", "6.0", "06", "Kelas 6" → "6" */
export function normalisasiKelas(nilai: unknown): string {
  const t = teks(nilai);
  const angka = t.match(/\d+/);
  return angka ? String(Number(angka[0])) : t.toUpperCase();
}

/** "5, 6" → ["5", "6"]; kosong / "SEMUA" → [] (artinya semua kelas). */
export function daftarKelas(nilai: unknown): string[] {
  const daftar = Array.isArray(nilai) ? nilai : teks(nilai).split(/[,;]/);
  const hasil = daftar.map(normalisasiKelas).filter((k) => k && k !== 'SEMUA');
  return [...new Set(hasil)];
}

export function kelasCocok(kelasUjian: string[], kelas: string): boolean {
  return kelasUjian.length === 0 || kelasUjian.includes(normalisasiKelas(kelas));
}

/** Kunci/jawaban → huruf urut tanpa duplikat. PG mengambil huruf pertama. */
export function normalisasiKunci(nilai: unknown, tipe: 'PG' | 'PGK'): string {
  const daftar = Array.isArray(nilai) ? nilai.join(',') : teks(nilai);
  const huruf = [...new Set(daftar.toUpperCase().match(/[A-D]/g) ?? [])].sort();
  return tipe === 'PGK' ? huruf.join(',') : (huruf[0] ?? '');
}

export function acak<T>(daftar: T[]): T[] {
  const salinan = [...daftar];
  for (let i = salinan.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [salinan[i], salinan[j]] = [salinan[j], salinan[i]];
  }
  return salinan;
}

/** Kata sandi mudah dibaca anak: tanpa l/1/o/0 yang mirip. */
export function buatPasswordAcak(): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyz';
  const angka = '23456789';
  let hasil = '';
  for (let i = 0; i < 4; i++) hasil += huruf[crypto.randomInt(huruf.length)];
  for (let i = 0; i < 3; i++) hasil += angka[crypto.randomInt(angka.length)];
  return hasil;
}

export function buatTokenUjian(): string {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 6 }, () => huruf[crypto.randomInt(huruf.length)]).join('');
}
