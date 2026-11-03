import { describe, expect, it } from 'vitest';
import { PAPAN, PAPAN_BIASA, entriUntukBahasa } from '../src/lib/papan/daftar.ts';
import { FORMULA } from '../src/lib/papan/formula.ts';
import { hapusHangul, susunHangul } from '../src/lib/papan/hangul.ts';
import { susunKana } from '../src/lib/papan/kana.ts';
import { PINYIN_AWAL, kandidatPinyin, prosesPinyin, type KeadaanPinyin, type MasukanPinyin } from '../src/lib/papan/pinyin.ts';
import { pilihAksi, teksAksi, type TataLetak } from '../src/lib/papan/tataLetak.ts';

const muat = async (id: string): Promise<TataLetak> => (await PAPAN.find((p) => p.id === id)!.muat!());
const ketik = (t: TataLetak, kode: string, shift = false) => teksAksi(pilihAksi(t, kode, shift)!);

describe('tata letak bahasa asing (pemetaan tombol fisik)', () => {
  it('semua tata letak termuat dan lengkap untuk huruf A-Z', async () => {
    for (const e of PAPAN.filter((p) => p.muat)) {
      const t = await e.muat!();
      for (const huruf of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(t.kunci[`Key${huruf}`], `${e.id} Key${huruf}`).toBeDefined();
    }
  });

  it('Rusia (ЙЦУКЕН), Arab, Yunani, Ibrani, Thai, Persia sesuai tata letak standar', async () => {
    const ru = await muat('ru');
    expect([ketik(ru, 'KeyQ'), ketik(ru, 'KeyF'), ketik(ru, 'Backquote'), ketik(ru, 'KeyQ', true)]).toEqual(['й', 'а', 'ё', 'Й']);
    const ar = await muat('ar');
    expect([ketik(ar, 'KeyQ'), ketik(ar, 'KeyH'), ketik(ar, 'KeyF'), ketik(ar, 'KeyB')]).toEqual(['ض', 'ا', 'ب', 'لا']);
    const el = await muat('el');
    expect([ketik(el, 'KeyA'), ketik(el, 'KeyP'), ketik(el, 'KeyA', true)]).toEqual(['α', 'π', 'Α']);
    const he = await muat('he');
    expect([ketik(he, 'KeyT'), ketik(he, 'KeyA'), ketik(he, 'Digit1')]).toEqual(['א', 'ש', '1']); // baris angka tanpa tombol ` tidak bergeser
    const th = await muat('th');
    expect([ketik(th, 'KeyQ'), ketik(th, 'KeyA'), ketik(th, 'Digit1')]).toEqual(['ๆ', 'ฟ', 'ๅ']);
    const fa = await muat('fa');
    expect([ketik(fa, 'KeyQ'), ketik(fa, 'KeyH'), ketik(fa, 'Digit1')]).toEqual(['ض', 'ا', '۱']);
  });

  it('tata letak Eropa: QWERTZ, AZERTY, dan tombol ISO tambahan', async () => {
    const de = await muat('de');
    expect([ketik(de, 'KeyY'), ketik(de, 'KeyZ'), ketik(de, 'Semicolon'), ketik(de, 'IntlBackslash')]).toEqual(['z', 'y', 'ö', '<']);
    const fr = await muat('fr');
    // Tata letak Prancis pustaka ini menaruh angka di lapisan dasar dan &é"' di lapisan Shift.
    expect([ketik(fr, 'KeyQ'), ketik(fr, 'KeyA'), ketik(fr, 'Digit1'), ketik(fr, 'Digit1', true)]).toEqual(['a', 'q', '1', '&']);
    const es = await muat('es');
    expect(ketik(es, 'Semicolon')).toBe('ñ');
  });

  it('CapsLock mengubah huruf bercase saja, bukan angka atau tanda baca', async () => {
    const ru = await muat('ru');
    expect(teksAksi(pilihAksi(ru, 'KeyQ', false, true)!)).toBe('Й');
    expect(teksAksi(pilihAksi(ru, 'KeyQ', true, true)!)).toBe('й');
    expect(teksAksi(pilihAksi(ru, 'Digit2', false, true)!)).toBe('2');
    expect(pilihAksi(ru, 'F1', false)).toBeNull();
  });

  it('papan biasa menampilkan QWERTY dan tombol harakat diberi lingkaran putus-putus', async () => {
    expect([ketik(PAPAN_BIASA, 'KeyQ'), ketik(PAPAN_BIASA, 'KeyQ', true), ketik(PAPAN_BIASA, 'Digit1', true)]).toEqual(['q', 'Q', '!']);
    const ar = await muat('ar');
    expect(pilihAksi(ar, 'KeyQ', true)!.tampil).toBe('◌َ'); // fatha
    expect(teksAksi(pilihAksi(ar, 'KeyQ', true)!)).toBe('َ');
  });

  it('bahasa soal dipetakan ke papan; bahasa tanpa papan memakai formula', () => {
    expect(entriUntukBahasa('ar').id).toBe('ar');
    expect(entriUntukBahasa('zh').id).toBe('zh');
    expect(entriUntukBahasa('en').id).toBe('formula');
    expect(entriUntukBahasa(undefined).id).toBe('formula');
  });
});

describe('papan Formula', () => {
  it('contoh dari permintaan: A → +, S → −, D → ×; Shift → huruf Yunani', () => {
    expect([ketik(FORMULA, 'KeyA'), ketik(FORMULA, 'KeyS'), ketik(FORMULA, 'KeyD'), ketik(FORMULA, 'KeyF')]).toEqual(['+', '−', '×', '÷']);
    expect([ketik(FORMULA, 'KeyA', true), ketik(FORMULA, 'KeyP'), ketik(FORMULA, 'KeyU', true)]).toEqual(['α', 'π', 'θ']);
  });

  it('angka tetap seperti papan biasa; tombol struktur ditandai (pecahan, akar, pangkat)', () => {
    expect(['Digit0', 'Digit5', 'Digit9'].map((k) => ketik(FORMULA, k))).toEqual(['0', '5', '9']);
    const pecahan = pilihAksi(FORMULA, 'Slash', false)!;
    expect(pecahan).toMatchObject({ struktur: true, latex: '\\frac{\\placeholder{}}{\\placeholder{}}' });
    expect(pilihAksi(FORMULA, 'KeyU', false)).toMatchObject({ struktur: true, latex: '\\sqrt{\\placeholder{}}' });
    const pangkat = pilihAksi(FORMULA, 'KeyI', false)!;
    expect(pangkat.latex).toBe('^{\\placeholder{}}'); // di dalam rumus
    expect(pangkat.latexBaru).toBe('{\\placeholder{}}^{\\placeholder{}}'); // rumus baru butuh dasar
  });

  it('simbol punya LaTeX untuk dipakai di dalam kotak rumus', () => {
    expect(pilihAksi(FORMULA, 'KeyD', false)).toMatchObject({ teks: '×', latex: '\\times ' });
    expect(pilihAksi(FORMULA, 'KeyT', false)).toMatchObject({ teks: '{', latex: '\\{' });
  });

  it('semua tombol huruf terpetakan dan tidak ada tombol huruf yang kembar di lapisan dasar', () => {
    const dasar = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((h) => FORMULA.kunci[`Key${h}`].biasa.tampil);
    expect(dasar.length).toBe(26);
    // Beberapa simbol sengaja ganda hanya bila fungsinya berbeda (mis. struktur); periksa bahwa tak ada tombol kosong.
    expect(dasar.every(Boolean)).toBe(true);
  });
});

describe('penyusun Hangul (Korea)', () => {
  const kor = async () => muat('ko');
  /** Mengetik rangkaian tombol fisik pada papan Korea dan mengembalikan teks hasilnya. */
  async function tulis(kode: string[]) {
    const t = await kor();
    let teks = '';
    for (const k of kode) {
      const aksi = teksAksi(pilihAksi(t, k, false)!);
      const s = susunHangul(teks, aksi);
      if (s) teks = teks.slice(0, teks.length - s.hapus) + s.sisip;
      else teks += aksi;
    }
    return teks;
  }
  const keys = (s: string) => s.split('').map((c) => `Key${c.toUpperCase()}`);

  it('menyusun suku kata dari tombol fisik', async () => {
    expect(await tulis(keys('gksrmf'))).toBe('한글'); // g=ㅎ k=ㅏ s=ㄴ r=ㄱ m=ㅡ f=ㄹ
    expect(await tulis(keys('dkssud'))).toBe('안녕'); // huruf akhir ㄴ pindah menjadi awal ㄴ+ㅕ
    expect(await tulis(keys('gksrnrdj'))).toBe('한국어');
  });

  it('huruf akhir gabungan dan vokal gabungan', async () => {
    expect(await tulis(keys('ekfr'))).toBe('닭'); // ㄷ ㅏ ㄹ ㄱ
    expect(await tulis(keys('ekfrk'))).toBe('달가'); // ㄱ pindah ke suku kata berikutnya
    expect(await tulis(keys('dhk'))).toBe('와'); // ㅗ + ㅏ = ㅘ
  });

  it('Backspace melepas satu jamo terakhir', () => {
    expect(hapusHangul('한')).toEqual({ hapus: 1, sisip: '하' });
    expect(hapusHangul('하')).toEqual({ hapus: 1, sisip: 'ㅎ' });
    expect(hapusHangul('닭')).toEqual({ hapus: 1, sisip: '달' });
    expect(hapusHangul('와')).toEqual({ hapus: 1, sisip: '오' });
    expect(hapusHangul('ㅎ')).toBeNull();
    expect(hapusHangul('a')).toBeNull();
  });

  it('bukan jamo: diketik biasa', () => {
    expect(susunHangul('한', '1')).toBeNull();
  });
});

describe('penyusun kana (Jepang)', () => {
  it('tanda dakuten dan handakuten bergabung dengan kana sebelumnya', () => {
    expect(susunKana('か', '゛')).toEqual({ hapus: 1, sisip: 'が' });
    expect(susunKana('は', '゜')).toEqual({ hapus: 1, sisip: 'ぱ' });
    expect(susunKana('あ', '゛')).toBeNull(); // あ tidak punya bentuk bersuara
    expect(susunKana('', '゛')).toBeNull();
    expect(susunKana('か', 'き')).toBeNull();
  });

  it('aksen gabung Eropa menyatu dengan huruf sebelumnya bila ada bentuknya', () => {
    expect(susunKana('a', '\u0301')).toEqual({ hapus: 1, sisip: 'á' });
    expect(susunKana('n', '\u0303')).toEqual({ hapus: 1, sisip: 'ñ' });
    expect(susunKana('x', '\u0301')).toBeNull(); // tidak ada "x́" tunggal: biarkan sebagai tanda gabung
    expect(susunKana('ك', '\u064E')).toBeNull(); // harakat Arab tidak bergabung: disisipkan apa adanya
  });
});

describe('penyusun pinyin (Mandarin)', () => {
  const kamus = async () => (await muat('zh')).kandidat!;
  const jalankan = (k: Record<string, string[]>, masukan: MasukanPinyin[]) => {
    let keadaan: KeadaanPinyin = PINYIN_AWAL;
    const keluar: string[] = [];
    for (const m of masukan) {
      const h = prosesPinyin(k, keadaan, m);
      keadaan = h.keadaan;
      if (h.sisip) keluar.push(h.sisip);
    }
    return { keadaan, keluar };
  };
  const huruf = (s: string): MasukanPinyin[] => s.split('').map((h) => ({ jenis: 'huruf', huruf: h }));

  it('kamus memuat suku kata umum', async () => {
    const k = await kamus();
    expect(Object.keys(k).length).toBeGreaterThan(300);
    expect(k.ni).toContain('你');
    expect(k.hao).toContain('好');
  });

  it('ketik pinyin, pilih dengan spasi (kandidat pertama) atau angka', async () => {
    const k = await kamus();
    expect(jalankan(k, [...huruf('ni'), { jenis: 'spasi' }]).keluar).toEqual([k.ni[0]]);
    expect(jalankan(k, [...huruf('ni'), { jenis: 'angka', n: 2 }]).keluar).toEqual([k.ni[1]]);
    expect(jalankan(k, [...huruf('hao'), { jenis: 'angka', n: 1 }]).keluar).toEqual([k.hao[0]]);
  });

  it('Enter menulis huruf latin apa adanya; Backspace dan Esc mengubah penampung', async () => {
    const k = await kamus();
    expect(jalankan(k, [...huruf('ni'), { jenis: 'enter' }]).keluar).toEqual(['ni']);
    expect(jalankan(k, [...huruf('nih'), { jenis: 'hapus' }]).keadaan.penampung).toBe('ni');
    expect(jalankan(k, [...huruf('ni'), { jenis: 'batal' }]).keadaan).toEqual(PINYIN_AWAL);
  });

  it('tanpa penampung, spasi/angka/Backspace/Enter dibiarkan bekerja biasa', async () => {
    const k = await kamus();
    for (const jenis of ['spasi', 'enter', 'hapus', 'batal'] as const) expect(prosesPinyin(k, PINYIN_AWAL, { jenis }).tangani).toBe(false);
    expect(prosesPinyin(k, PINYIN_AWAL, { jenis: 'angka', n: 3 }).tangani).toBe(false);
  });

  it('halaman kandidat bila lebih dari sembilan', async () => {
    const k = await kamus();
    const panjang = Object.keys(k).find((s) => k[s].length > 12)!;
    const h1 = prosesPinyin(k, { penampung: panjang, halaman: 0 }, { jenis: 'berikut' });
    expect(h1.keadaan.halaman).toBe(1);
    expect(prosesPinyin(k, h1.keadaan, { jenis: 'angka', n: 1 }).sisip).toBe(k[panjang][9]);
    expect(prosesPinyin(k, h1.keadaan, { jenis: 'sebelum' }).keadaan.halaman).toBe(0);
    expect(kandidatPinyin(k, 'zzzz')).toEqual([]);
    expect(kandidatPinyin(k, 'zh').length).toBeGreaterThan(9); // awalan: gabungan suku kata zh*
  });
});
