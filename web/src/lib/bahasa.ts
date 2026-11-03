/**
 * Bahasa/aksara soal. Daftar yang sama ada di server/lib/bahasa.ts; ubah keduanya bersamaan.
 * `rtl`: ditulis kanan-ke-kiri. Arah tiap teks tetap ditentukan otomatis (dir="auto") dari huruf pertamanya,
 * sehingga soal berbahasa Indonesia dengan pilihan berhuruf Arab tampil benar.
 */
export type InfoBahasa = { kode: string; nama: string; aksara?: string; rtl?: boolean };

export const DAFTAR_BAHASA: InfoBahasa[] = [
  { kode: 'id', nama: 'Indonesia' },
  { kode: 'en', nama: 'Inggris' },
  { kode: 'ar', nama: 'Arab', aksara: 'العربية', rtl: true },
  { kode: 'zh', nama: 'Mandarin (aksara sederhana)', aksara: '中文' },
  { kode: 'zh-Hant', nama: 'Mandarin (aksara tradisional)', aksara: '中文' },
  { kode: 'ja', nama: 'Jepang', aksara: '日本語' },
  { kode: 'ko', nama: 'Korea', aksara: '한국어' },
  { kode: 'ru', nama: 'Rusia', aksara: 'Русский' },
  { kode: 'hi', nama: 'Hindi', aksara: 'हिन्दी' },
  { kode: 'th', nama: 'Thai', aksara: 'ไทย' },
  { kode: 'he', nama: 'Ibrani', aksara: 'עברית', rtl: true },
  { kode: 'fa', nama: 'Persia', aksara: 'فارسی', rtl: true },
  { kode: 'ur', nama: 'Urdu', aksara: 'اردو', rtl: true },
  { kode: 'de', nama: 'Jerman' },
  { kode: 'fr', nama: 'Prancis' },
  { kode: 'es', nama: 'Spanyol' },
  { kode: 'nl', nama: 'Belanda' },
  { kode: 'pt', nama: 'Portugis' },
  { kode: 'it', nama: 'Italia' },
  { kode: 'tr', nama: 'Turki' },
  { kode: 'el', nama: 'Yunani', aksara: 'Ελληνικά' },
  { kode: 'vi', nama: 'Vietnam' },
  { kode: 'ms', nama: 'Melayu' },
  { kode: 'jv', nama: 'Jawa' },
  { kode: 'und', nama: 'Bahasa lain / campuran' },
];

export const labelBahasa = (b: InfoBahasa) => (b.aksara ? `${b.nama} (${b.aksara})` : b.nama);
export const bahasaRtl = (kode: string) => !!DAFTAR_BAHASA.find((b) => b.kode === kode)?.rtl;
/** Atribut lang yang valid; "und" dan kode tak dikenal tidak dipasang agar browser memakai bawaannya. */
export const atributLang = (kode: string | undefined) => (kode && kode !== 'und' ? kode : undefined);
