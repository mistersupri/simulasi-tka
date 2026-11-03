/**
 * Tata letak papan ketik: pemetaan TOMBOL FISIK (event.code) ke karakter, seperti tata letak keyboard
 * pada umumnya. Berkas ini murni TypeScript (tanpa DOM) agar bisa diuji di tests/.
 */

/** Apa yang dilakukan satu tombol. `tampil` = tulisan di tombol layar. */
export type Aksi = {
  tampil: string;
  /** Teks biasa yang disisipkan (di teks soal, pilihan, dan kotak isian). Bila kosong dipakai `tampil`. */
  teks?: string;
  /** LaTeX yang disisipkan bila kursor berada di dalam kotak rumus. */
  latex?: string;
  /** Tombol struktur (pecahan, akar, pangkat): di luar kotak rumus membuat kotak rumus baru. */
  struktur?: boolean;
  /** LaTeX untuk kotak rumus baru bila berbeda dari `latex` (mis. pangkat butuh dasar dan eksponen). */
  latexBaru?: string;
};
export type Kunci = { biasa: Aksi; shift: Aksi };
export type JenisKomposer = 'hangul' | 'kana' | 'pinyin';

export type TataLetak = {
  id: string;
  nama: string;
  /** Kode bahasa soal yang dipakai tata letak ini (kosong untuk formula). */
  bahasa?: string;
  kunci: Record<string, Kunci>;
  komposer?: JenisKomposer;
  /** Pinyin: suku kata tanpa nada → daftar huruf Han. */
  kandidat?: Record<string, string[]>;
};

/** Kode tombol fisik per baris, sesuai papan ketik standar (huruf pada tata letak QWERTY). */
export const BARIS_KODE: string[][] = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];

const KODE_ISO = 'IntlBackslash';

/** Format data pustaka simple-keyboard-layouts: lima baris teks per lapisan, tombol dipisah spasi. */
export type DataSimpleKeyboard = {
  layout: Record<string, string[]>;
  layoutCandidates?: Record<string, string>;
};

const tokenBaris = (baris: string) => baris.split(' ').filter((t) => t !== '' && !/^\{.*\}$/.test(t));

/** Menentukan kode fisik tiap tombol dalam satu baris dari jumlah tombolnya. Melempar galat bila bentuknya tidak dikenal. */
function kodeUntukBaris(indeks: number, jumlah: number, id: string): string[] {
  const dasar = BARIS_KODE[indeks];
  const salah = () => new Error(`Tata letak ${id}: baris ${indeks + 1} berisi ${jumlah} tombol (tidak dikenal).`);
  switch (indeks) {
    case 0: // tanpa tombol ` pada sebagian tata letak (mis. Ibrani)
      if (jumlah === 13) return dasar;
      if (jumlah === 12) return dasar.slice(1);
      throw salah();
    case 1: // tanpa \ pada tata letak ISO
      if (jumlah === 13) return dasar;
      if (jumlah === 12) return dasar.slice(0, 12);
      throw salah();
    case 2: // tata letak ISO punya tombol # tambahan
      if (jumlah === 11) return dasar;
      if (jumlah === 12) return [...dasar, 'Backslash'];
      throw salah();
    default: // tata letak ISO punya tombol < > tambahan di kiri Z
      if (jumlah === 10) return dasar;
      if (jumlah === 11) return [KODE_ISO, ...dasar];
      throw salah();
  }
}

/** Tombol pengubah (harakat, tanda Hangul, dll.) diberi lingkaran putus-putus agar terbaca di tombol layar. */
function tampilKunci(t: string): string {
  if (/^\p{M}$/u.test(t)) return `◌${t}`;
  const cp = t.codePointAt(0) ?? 0;
  // Jamo Hangul "conjoining" ditampilkan sebagai jamo kompatibilitas (ㅂ, ㅏ) agar terlihat jelas.
  if (t.length === 1 && cp >= 0x1100 && cp <= 0x11ff) return jamoKompatibilitas(t) ?? t;
  return t;
}

const CHOSEONG_KE_KOMPAT = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNGSEONG_KE_KOMPAT = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';

function jamoKompatibilitas(t: string): string | null {
  const cp = t.codePointAt(0)!;
  if (cp >= 0x1100 && cp <= 0x1112) return CHOSEONG_KE_KOMPAT[cp - 0x1100];
  if (cp >= 0x1161 && cp <= 0x1175) return JUNGSEONG_KE_KOMPAT[cp - 0x1161];
  return null;
}

const aksiDariTeks = (t: string): Aksi => ({ tampil: tampilKunci(t), teks: t });

/** Mengubah data pustaka simple-keyboard-layouts menjadi pemetaan berdasarkan kode tombol fisik. */
export function dariSimpleKeyboard(
  id: string,
  nama: string,
  data: DataSimpleKeyboard,
  opsi: { bahasa?: string; komposer?: JenisKomposer } = {},
): TataLetak {
  const biasa: Record<string, string> = {};
  const shift: Record<string, string> = {};
  for (const [lapisan, tujuan] of [[data.layout.default, biasa], [data.layout.shift, shift]] as const) {
    if (!lapisan || lapisan.length < 4) throw new Error(`Tata letak ${id}: data tidak lengkap.`);
    for (let i = 0; i < 4; i++) {
      const token = tokenBaris(lapisan[i]);
      const kode = kodeUntukBaris(i, token.length, id);
      token.forEach((t, k) => { tujuan[kode[k]] = t; });
    }
  }
  const kunci: Record<string, Kunci> = {};
  for (const kode of Object.keys(biasa)) {
    kunci[kode] = { biasa: aksiDariTeks(biasa[kode]), shift: aksiDariTeks(shift[kode] ?? biasa[kode]) };
  }
  const kandidat = data.layoutCandidates && opsi.komposer === 'pinyin'
    ? Object.fromEntries(Object.entries(data.layoutCandidates).map(([k, v]) => [k, v.split(' ').filter(Boolean)]))
    : undefined;
  return { id, nama, bahasa: opsi.bahasa, kunci, komposer: opsi.komposer, kandidat };
}

/**
 * Memilih aksi untuk satu penekanan tombol. CapsLock membalik Shift hanya untuk huruf yang punya
 * pasangan huruf besar (Rusia, Yunani, Latin), bukan untuk tanda baca dan angka.
 */
export function pilihAksi(tata: TataLetak, kode: string, shift: boolean, capsLock = false): Aksi | null {
  const k = tata.kunci[kode];
  if (!k) return null;
  const adalahHuruf = k.biasa.teks !== undefined && k.shift.teks !== undefined && k.shift.teks !== k.biasa.teks
    && k.shift.teks.toLowerCase() === k.biasa.teks && k.biasa.teks.toUpperCase() === k.shift.teks;
  return (adalahHuruf && capsLock ? !shift : shift) ? k.shift : k.biasa;
}

export function teksAksi(a: Aksi): string {
  return a.teks ?? a.tampil;
}
