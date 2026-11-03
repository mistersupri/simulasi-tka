/**
 * Penilaian jawaban per tipe soal.
 *  PG/PGK : huruf pilihan (lihat util.normalisasiKunci).
 *  ISIAN  : siswa mengetik; benar bila cocok dengan salah satu jawaban yang diterima
 *           (satu per baris di `kunci`) setelah dinormalkan.
 */
import type { Soal } from '../db.ts';
import { normalisasiKunci, teks } from './util.ts';

export const MAKS_PANJANG_ISIAN = 500;
export const MAKS_JAWABAN_DITERIMA = 10;

const TANDA_ARAB = /[ً-ٰٟـ]/g; // harakat dan tatwil

/**
 * Normalisasi untuk membandingkan jawaban isian:
 *  - spasi berderet dijadikan satu, tepi dipangkas, Unicode NFC;
 *  - tanpa peka huruf: NFKC (angka/huruf lebar penuh dari IME Mandarin/Jepang jadi biasa),
 *    huruf kecil, dan harakat Arab dibuang agar "كَتَبَ" sama dengan "كتب".
 */
export function normalisasiIsian(nilai: unknown, pekaHuruf: boolean): string {
  let t = teks(nilai).replace(/\s+/g, ' ');
  if (pekaHuruf) return t.normalize('NFC');
  t = t.normalize('NFKC').toLowerCase().replace(TANDA_ARAB, '');
  return t;
}

/** Daftar jawaban yang diterima dari kolom kunci (dipisah baris baru atau tanda |). */
export function daftarJawabanIsian(kunci: string): string[] {
  return kunci.split(/\r?\n|\|/).map((j) => j.trim()).filter(Boolean);
}

type SoalNilai = Pick<Soal, 'tipe' | 'kunci' | 'pekaHuruf'>;

/**
 * `jawab`: bentuk jawaban siswa yang disimpan/ditampilkan (huruf urut untuk PG/PGK, teks untuk ISIAN; "" = kosong).
 * `benar`: apakah sesuai kunci.
 */
export function nilaiJawaban(soal: SoalNilai, mentah: unknown): { jawab: string; benar: boolean } {
  if (soal.tipe === 'ISIAN') {
    const jawab = teks(mentah).slice(0, MAKS_PANJANG_ISIAN);
    if (!jawab) return { jawab: '', benar: false };
    const diterima = new Set(daftarJawabanIsian(soal.kunci).map((j) => normalisasiIsian(j, soal.pekaHuruf)));
    return { jawab, benar: diterima.has(normalisasiIsian(jawab, soal.pekaHuruf)) };
  }
  const jawab = normalisasiKunci(mentah, soal.tipe);
  return { jawab, benar: !!jawab && jawab === soal.kunci };
}
