/**
 * Penyusun suku kata Hangul untuk papan ketik Korea (dubeolsik). Tanpa status: bentuk suku kata ditentukan
 * dari karakter tepat sebelum kursor, sehingga tetap benar walau kursor dipindah. Murni TypeScript.
 */
export type Komposisi = { hapus: number; sisip: string };

const ADA = -1;
// Indeks choseong (huruf awal) → jongseong (huruf akhir); ㄸ ㅃ ㅉ tidak bisa menjadi huruf akhir.
const CHO_KE_JONG = [1, 2, 4, 7, ADA, 8, 16, 17, ADA, 19, 20, 21, 22, ADA, 23, 24, 25, 26, 27];
const JONG_KE_CHO: Record<number, number> = Object.fromEntries(CHO_KE_JONG.map((j, c) => [j, c]).filter(([j]) => j !== ADA));
// Huruf akhir gabungan: indeks → [huruf akhir pertama, choseong kedua].
const JONG_GABUNGAN: Record<number, [number, number]> = {
  3: [1, 9], 5: [4, 12], 6: [4, 18], 9: [8, 0], 10: [8, 6], 11: [8, 7], 12: [8, 9], 13: [8, 16], 14: [8, 17], 15: [8, 18], 18: [17, 9],
};
const GABUNG_JONG = new Map(Object.entries(JONG_GABUNGAN).map(([g, [a, c]]) => [`${a},${c}`, Number(g)]));
// Vokal gabungan: indeks → [vokal pertama, vokal kedua].
const JUNG_GABUNGAN: Record<number, [number, number]> = { 9: [8, 0], 10: [8, 1], 11: [8, 20], 14: [13, 4], 15: [13, 5], 16: [13, 20], 19: [18, 20] };
const GABUNG_JUNG = new Map(Object.entries(JUNG_GABUNGAN).map(([g, [a, b]]) => [`${a},${b}`, Number(g)]));

const CHO_KOMPAT = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG_KOMPAT = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';

const suku = (l: number, v: number, t: number) => String.fromCharCode(0xac00 + (l * 21 + v) * 28 + t);
const choTunggal = (l: number) => CHO_KOMPAT[l];
const jungTunggal = (v: number) => JUNG_KOMPAT[v];

type Unsur = { j: 'suku'; l: number; v: number; t: number } | { j: 'cho'; l: number } | { j: 'jung'; v: number } | null;

function urai(c: string | undefined): Unsur {
  if (!c) return null;
  const cp = c.codePointAt(0)!;
  if (cp >= 0xac00 && cp <= 0xd7a3) {
    const n = cp - 0xac00;
    return { j: 'suku', l: Math.floor(n / 588), v: Math.floor((n % 588) / 28), t: n % 28 };
  }
  const cho = CHO_KOMPAT.indexOf(c);
  if (cho !== -1) return { j: 'cho', l: cho };
  const jung = JUNG_KOMPAT.indexOf(c);
  if (jung !== -1) return { j: 'jung', v: jung };
  return null;
}

/** Jamo "conjoining" dari tata letak (U+1100...) → choseong atau jungseong. */
function jenisJamo(jamo: string): { cho: number } | { jung: number } | null {
  if (jamo.length !== 1) return null;
  const cp = jamo.codePointAt(0)!;
  if (cp >= 0x1100 && cp <= 0x1112) return { cho: cp - 0x1100 };
  if (cp >= 0x1161 && cp <= 0x1175) return { jung: cp - 0x1161 };
  return null;
}

/** Menyisipkan satu jamo setelah teks `sebelum`; null bila bukan jamo (diketik biasa). */
export function susunHangul(sebelum: string, jamo: string): Komposisi | null {
  const huruf = jenisJamo(jamo);
  if (!huruf) return null;
  const p = urai(sebelum.slice(-1));

  if ('cho' in huruf) {
    const c = huruf.cho;
    if (p?.j === 'suku') {
      if (p.t === 0 && CHO_KE_JONG[c] !== ADA) return { hapus: 1, sisip: suku(p.l, p.v, CHO_KE_JONG[c]) };
      if (p.t !== 0) {
        const gabungan = GABUNG_JONG.get(`${p.t},${c}`);
        if (gabungan !== undefined) return { hapus: 1, sisip: suku(p.l, p.v, gabungan) };
      }
    }
    return { hapus: 0, sisip: choTunggal(c) };
  }

  const v = huruf.jung;
  if (p?.j === 'cho') return { hapus: 1, sisip: suku(p.l, v, 0) };
  if (p?.j === 'jung') {
    const gabungan = GABUNG_JUNG.get(`${p.v},${v}`);
    return gabungan !== undefined ? { hapus: 1, sisip: jungTunggal(gabungan) } : { hapus: 0, sisip: jungTunggal(v) };
  }
  if (p?.j === 'suku') {
    if (p.t === 0) {
      const gabungan = GABUNG_JUNG.get(`${p.v},${v}`);
      if (gabungan !== undefined) return { hapus: 1, sisip: suku(p.l, gabungan, 0) };
    } else {
      // Huruf akhir pindah menjadi huruf awal suku kata berikutnya (한 + ㅏ → 하나).
      const pecah = JONG_GABUNGAN[p.t];
      if (pecah) return { hapus: 1, sisip: suku(p.l, p.v, pecah[0]) + suku(pecah[1], v, 0) };
      return { hapus: 1, sisip: suku(p.l, p.v, 0) + suku(JONG_KE_CHO[p.t], v, 0) };
    }
  }
  return { hapus: 0, sisip: jungTunggal(v) };
}

/** Backspace melepas satu jamo terakhir dari suku kata (한 → 하 → ㅎ); null bila harus menghapus biasa. */
export function hapusHangul(sebelum: string): Komposisi | null {
  const p = urai(sebelum.slice(-1));
  if (p?.j !== 'suku') return null;
  if (p.t !== 0) return { hapus: 1, sisip: suku(p.l, p.v, JONG_GABUNGAN[p.t]?.[0] ?? 0) };
  const pecah = JUNG_GABUNGAN[p.v];
  return { hapus: 1, sisip: pecah ? suku(p.l, pecah[0], 0) : choTunggal(p.l) };
}
