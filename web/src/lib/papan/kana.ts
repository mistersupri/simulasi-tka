/**
 * Tombol tanda gabung. Tombol ゛ dan ゜ pada papan ketik kana Jepang, serta aksen "mati" pada tata letak Eropa
 * (´ ̈ ^ ...), menyatu dengan huruf sebelumnya bila ada bentuk gabungannya (か + ゛ → が, a + ́ → á).
 */
import type { Komposisi } from './hangul.ts';

const TANDA_KANA: Record<string, string> = { '\u309B': '\u3099', '\u309C': '\u309A' };

export function susunKana(sebelum: string, teks: string): Komposisi | null {
  const p = sebelum.slice(-1);
  if (!p) return null;
  const tanda = TANDA_KANA[teks] ?? (/^\p{M}$/u.test(teks) ? teks : undefined);
  if (!tanda) return null;
  const gabungan = (p + tanda).normalize('NFC');
  return gabungan.length === 1 ? { hapus: 1, sisip: gabungan } : null;
}
