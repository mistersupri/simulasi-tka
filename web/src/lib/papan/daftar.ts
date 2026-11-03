/**
 * Daftar papan ketik alternatif yang bisa dipilih di papan ketik layar: Formula dan tata letak bahasa asing.
 * Data tata letak berasal dari pustaka simple-keyboard-layouts (MIT) dan dimuat malas per bahasa.
 * Hindi, Urdu, Turki, dan Portugis belum disertakan karena data tata letaknya belum konsisten.
 */
import * as english from 'simple-keyboard-layouts/build/layouts/english.js';
import { FORMULA } from './formula.ts';
import { dariSimpleKeyboard, type DataSimpleKeyboard, type JenisKomposer, type TataLetak } from './tataLetak.ts';

export type EntriPapan = {
  id: string;
  nama: string;
  kelompok: 'matematika' | 'bahasa';
  /** Kode bahasa soal yang diatur saat entri ini dipilih (kosong untuk formula). */
  bahasa?: string;
  /** Kosong = tanpa papan khusus (hanya mengatur bahasa soal). */
  muat: (() => Promise<TataLetak>) | null;
};

type Pemuat = () => Promise<unknown>;

/**
 * Data tata letak dari modul hasil import. Bentuknya berbeda antara bundler (default = data) dan Node CommonJS
 * (default.default = data), sehingga keduanya dikenali.
 */
function ambilData(modul: unknown): DataSimpleKeyboard {
  let x: unknown = (modul as { default?: unknown }).default ?? modul;
  if (x && typeof x === 'object' && !('layout' in x) && 'default' in x) x = (x as { default: unknown }).default;
  return x as DataSimpleKeyboard;
}

const bahasa = (id: string, kode: string, nama: string, impor: Pemuat, komposer?: JenisKomposer): EntriPapan => ({
  id, bahasa: kode, nama, kelompok: 'bahasa',
  muat: async () => dariSimpleKeyboard(id, nama, ambilData(await impor()), { bahasa: kode, komposer }),
});

export const PAPAN: EntriPapan[] = [
  { id: 'formula', nama: 'Formula matematika', kelompok: 'matematika', muat: async () => FORMULA },
  { id: 'id', bahasa: 'id', nama: 'Indonesia / Latin (tanpa papan khusus)', kelompok: 'bahasa', muat: null },
  bahasa('ar', 'ar', 'Arab (العربية)', () => import('simple-keyboard-layouts/build/layouts/arabic.js')),
  bahasa('zh', 'zh', 'Mandarin, pinyin (中文)', () => import('simple-keyboard-layouts/build/layouts/chinese.js'), 'pinyin'),
  bahasa('ja', 'ja', 'Jepang, kana (日本語)', () => import('simple-keyboard-layouts/build/layouts/japanese.js'), 'kana'),
  bahasa('ko', 'ko', 'Korea, Hangul (한국어)', () => import('simple-keyboard-layouts/build/layouts/korean.js'), 'hangul'),
  bahasa('ru', 'ru', 'Rusia (Русский)', () => import('simple-keyboard-layouts/build/layouts/russian.js')),
  bahasa('el', 'el', 'Yunani (Ελληνικά)', () => import('simple-keyboard-layouts/build/layouts/greek.js')),
  bahasa('he', 'he', 'Ibrani (עברית)', () => import('simple-keyboard-layouts/build/layouts/hebrew.js')),
  bahasa('fa', 'fa', 'Persia (فارسی)', () => import('simple-keyboard-layouts/build/layouts/farsi.js')),
  bahasa('th', 'th', 'Thai (ไทย)', () => import('simple-keyboard-layouts/build/layouts/thai.js')),
  bahasa('de', 'de', 'Jerman (QWERTZ)', () => import('simple-keyboard-layouts/build/layouts/german.js')),
  bahasa('fr', 'fr', 'Prancis (AZERTY)', () => import('simple-keyboard-layouts/build/layouts/french.js')),
  bahasa('es', 'es', 'Spanyol', () => import('simple-keyboard-layouts/build/layouts/spanish.js')),
  bahasa('it', 'it', 'Italia', () => import('simple-keyboard-layouts/build/layouts/italian.js')),
];

/** Papan biasa (QWERTY): dipakai untuk tampilan tombol layar saat papan alternatif tidak aktif. */
export const PAPAN_BIASA: TataLetak = dariSimpleKeyboard('biasa', 'Papan biasa', ambilData(english));

/** Entri papan untuk bahasa soal tertentu (mis. "ar"), atau formula bila tidak ada. */
export const entriUntukBahasa = (kode: string | undefined): EntriPapan =>
  PAPAN.find((p) => p.bahasa === kode && p.muat) ?? PAPAN[0];
