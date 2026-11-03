/**
 * Teks soal yang boleh memuat rumus matematika dan kode program.
 *
 *   $ ... $  atau  \( ... \)     rumus dalam kalimat (LaTeX)
 *   $$ ... $$  atau  \[ ... \]   rumus satu baris sendiri
 *   ```bahasa ... ```            blok kode (baris pembuka dan penutup berdiri sendiri)
 *   `kode`                        kode dalam kalimat
 *   \$                            tanda dolar biasa
 *
 * Aturan `$...$` meniru Pandoc agar kalimat tentang uang tidak terbaca sebagai rumus:
 * `$` pembuka harus diikuti bukan spasi, `$` penutup harus didahului bukan spasi dan
 * tidak diikuti angka. Jadi "harga $5 dan $10" tetap teks biasa.
 *
 * Berkas ini murni TypeScript (tanpa DOM) agar bisa diuji di tests/.
 */
export type Segmen =
  | { t: 'teks'; isi: string }
  | { t: 'rumus'; isi: string; blok: boolean }
  | { t: 'kode'; isi: string }
  | { t: 'blokKode'; isi: string; bahasa: string };

const MAKS_PANJANG_RUMUS = 600;
const spasi = (c: string | undefined) => c === undefined || /\s/.test(c);

/** Posisi `$` penutup rumus sebaris yang sah, atau -1. */
function cariPenutupDolar(s: string, dari: number): number {
  const batas = Math.min(s.length, dari + MAKS_PANJANG_RUMUS);
  for (let j = dari; j < batas; j++) {
    const c = s[j];
    if (c === '\n' && s[j + 1] === '\n') return -1; // paragraf baru: bukan rumus sebaris
    if (c === '\\') { j++; continue; }
    if (c !== '$') continue;
    if (spasi(s[j - 1]) || /\d/.test(s[j + 1] ?? '')) continue;
    return j;
  }
  return -1;
}

export function pecahTeks(s: string): Segmen[] {
  const hasil: Segmen[] = [];
  let buf = '';
  const kosongkan = () => {
    if (buf) hasil.push({ t: 'teks', isi: buf });
    buf = '';
  };
  const rumus = (isi: string, blok: boolean) => {
    kosongkan();
    hasil.push({ t: 'rumus', isi: isi.trim(), blok });
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];

    // Blok kode: pagar ``` di awal baris.
    if (c === '`' && s.startsWith('```', i) && (i === 0 || s[i - 1] === '\n')) {
      const akhirBaris = s.indexOf('\n', i + 3);
      if (akhirBaris !== -1) {
        const penutup = s.indexOf('\n```', akhirBaris);
        if (penutup !== -1) {
          kosongkan();
          hasil.push({ t: 'blokKode', bahasa: s.slice(i + 3, akhirBaris).trim().toLowerCase(), isi: s.slice(akhirBaris + 1, penutup) });
          i = penutup + 4;
          if (s[i] === '\n') i++; // baris baru setelah pagar penutup tidak perlu ditampilkan lagi
          continue;
        }
      }
    }

    if (c === '`') {
      const tutup = s.indexOf('`', i + 1);
      if (tutup > i + 1 && !s.slice(i + 1, tutup).includes('\n')) {
        kosongkan();
        hasil.push({ t: 'kode', isi: s.slice(i + 1, tutup) });
        i = tutup + 1;
        continue;
      }
    }

    if (c === '\\') {
      const n = s[i + 1];
      if (n === '$') { buf += '$'; i += 2; continue; }
      if (n === '(' || n === '[') {
        const tutup = s.indexOf(n === '(' ? '\\)' : '\\]', i + 2);
        if (tutup !== -1 && tutup - i < MAKS_PANJANG_RUMUS) {
          rumus(s.slice(i + 2, tutup), n === '[');
          i = tutup + 2;
          continue;
        }
      }
    }

    if (c === '$') {
      if (s[i + 1] === '$') {
        const tutup = s.indexOf('$$', i + 2);
        if (tutup !== -1 && tutup - i < MAKS_PANJANG_RUMUS) {
          rumus(s.slice(i + 2, tutup), true);
          i = tutup + 2;
          continue;
        }
      } else if (!spasi(s[i + 1])) {
        const tutup = cariPenutupDolar(s, i + 1);
        if (tutup !== -1) {
          rumus(s.slice(i + 1, tutup), false);
          i = tutup + 1;
          continue;
        }
      }
    }

    buf += c;
    i++;
  }
  kosongkan();
  return hasil;
}

/** Apakah teks memuat rumus atau kode (untuk memutuskan perlu memuat KaTeX/penyorot kode atau tidak). */
export const adaMarkup = (s: string) => pecahTeks(s).some((x) => x.t !== 'teks');
export const adaRumus = (s: string) => pecahTeks(s).some((x) => x.t === 'rumus');
export const adaBlokKode = (s: string) => pecahTeks(s).some((x) => x.t === 'blokKode');

/**
 * Rumus satu baris dan blok kode berdiri sendiri sebagai blok. Satu baris baru di kiri/kanannya
 * (hasil mengetik rumus di baris sendiri) dibuang agar tidak ada jarak kosong ganda.
 */
export function rapikanBlok(segmen: Segmen[]): Segmen[] {
  const blok = (x?: Segmen) => !!x && (x.t === 'blokKode' || (x.t === 'rumus' && x.blok));
  return segmen
    .map((x, i) => {
      if (x.t !== 'teks') return x;
      let isi = x.isi;
      if (blok(segmen[i - 1])) isi = isi.replace(/^\n/, '');
      if (blok(segmen[i + 1])) isi = isi.replace(/\n$/, '');
      return { ...x, isi };
    })
    .filter((x) => x.t !== 'teks' || x.isi !== '');
}

/**
 * Rumus yang belum selesai diisi di editor (kotak putus-putus, \placeholder) ditampilkan sebagai kotak kosong
 * agar KaTeX tidak menolaknya.
 */
export const bersihkanRumus = (latex: string) => latex.replace(/\\placeholder(\[[^\]]*\])?\{[^{}]*\}/g, '\\square ');

export const rumusBelumLengkap = (latex: string) => /\\placeholder(\[[^\]]*\])?\{/.test(latex);
