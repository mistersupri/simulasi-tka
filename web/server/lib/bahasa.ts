/**
 * Bahasa/aksara soal. Kode mengikuti BCP 47 sehingga browser memilih font dan bentuk huruf yang benar
 * (mis. huruf Han berbeda untuk Mandarin dan Jepang). "und" = bahasa lain/campuran.
 * Daftar yang sama dipakai di src/lib/bahasa.ts; ubah keduanya bersamaan.
 */
export const BAHASA: Record<string, string> = {
  id: 'Indonesia',
  en: 'Inggris',
  ar: 'Arab',
  zh: 'Mandarin (aksara sederhana)',
  'zh-Hant': 'Mandarin (aksara tradisional)',
  ja: 'Jepang',
  ko: 'Korea',
  ru: 'Rusia',
  hi: 'Hindi',
  th: 'Thai',
  he: 'Ibrani',
  fa: 'Persia',
  ur: 'Urdu',
  de: 'Jerman',
  fr: 'Prancis',
  es: 'Spanyol',
  nl: 'Belanda',
  pt: 'Portugis',
  it: 'Italia',
  tr: 'Turki',
  el: 'Yunani',
  vi: 'Vietnam',
  ms: 'Melayu',
  jv: 'Jawa',
  und: 'Bahasa lain / campuran',
};

export const KODE_BAHASA = Object.keys(BAHASA);

/** Menerima kode dari impor Excel ("ar", "Arab", "AR") dan mengembalikan kode baku, atau null bila tidak dikenal. */
export function kenaliBahasa(nilai: unknown): string | null {
  const t = String(nilai ?? '').trim();
  if (!t) return 'id';
  const kode = KODE_BAHASA.find((k) => k.toLowerCase() === t.toLowerCase());
  if (kode) return kode;
  const nama = Object.entries(BAHASA).find(([, n]) => n.toLowerCase().startsWith(t.toLowerCase()));
  if (nama) return nama[0];
  const alias: Record<string, string> = { mandarin: 'zh', cina: 'zh', china: 'zh', tiongkok: 'zh', inggris: 'en', arab: 'ar', rusia: 'ru', jepang: 'ja', korea: 'ko' };
  return alias[t.toLowerCase()] ?? null;
}
