/**
 * Papan ketik Mandarin (pinyin): huruf yang diketik masuk ke penampung, lalu siswa/guru memilih huruf Han dari
 * daftar kandidat. Murni TypeScript; kamus berasal dari tata letak "chinese" (suku kata tanpa nada).
 */
export const UKURAN_HALAMAN = 9;
const MAKS_PENAMPUNG = 6;

export type KeadaanPinyin = { penampung: string; halaman: number };
export const PINYIN_AWAL: KeadaanPinyin = { penampung: '', halaman: 0 };

export type MasukanPinyin =
  | { jenis: 'huruf'; huruf: string }
  | { jenis: 'angka'; n: number }
  | { jenis: 'spasi' | 'enter' | 'hapus' | 'batal' | 'berikut' | 'sebelum' };

export type HasilPinyin = { keadaan: KeadaanPinyin; sisip?: string; tangani: boolean };

/** Kandidat untuk penampung: suku kata persis; bila tidak ada, suku kata yang diawali penampung. */
export function kandidatPinyin(kamus: Record<string, string[]>, penampung: string): string[] {
  if (!penampung) return [];
  if (kamus[penampung]) return kamus[penampung];
  return Object.keys(kamus).filter((k) => k.startsWith(penampung)).sort().flatMap((k) => kamus[k]).slice(0, 90);
}

export function prosesPinyin(kamus: Record<string, string[]>, keadaan: KeadaanPinyin, masukan: MasukanPinyin): HasilPinyin {
  const { penampung, halaman } = keadaan;
  const kandidat = kandidatPinyin(kamus, penampung);
  const kosong = penampung === '';
  const tetap = (k: KeadaanPinyin = keadaan): HasilPinyin => ({ keadaan: k, tangani: true });
  const selesai = (sisip: string): HasilPinyin => ({ keadaan: PINYIN_AWAL, sisip, tangani: true });

  switch (masukan.jenis) {
    case 'huruf':
      return penampung.length >= MAKS_PENAMPUNG ? tetap() : tetap({ penampung: penampung + masukan.huruf, halaman: 0 });
    case 'angka': {
      if (kosong) return { keadaan, tangani: false };
      const pilihan = kandidat[halaman * UKURAN_HALAMAN + masukan.n - 1];
      return pilihan ? selesai(pilihan) : tetap();
    }
    case 'spasi':
      if (kosong) return { keadaan, tangani: false };
      return selesai(kandidat[halaman * UKURAN_HALAMAN] ?? penampung);
    case 'enter':
      return kosong ? { keadaan, tangani: false } : selesai(penampung);
    case 'hapus':
      return kosong ? { keadaan, tangani: false } : tetap({ penampung: penampung.slice(0, -1), halaman: 0 });
    case 'batal':
      return kosong ? { keadaan, tangani: false } : tetap(PINYIN_AWAL);
    case 'berikut':
      if (kosong) return { keadaan, tangani: false };
      return tetap({ penampung, halaman: (halaman + 1) * UKURAN_HALAMAN < kandidat.length ? halaman + 1 : halaman });
    case 'sebelum':
      return kosong ? { keadaan, tangani: false } : tetap({ penampung, halaman: Math.max(0, halaman - 1) });
  }
}
