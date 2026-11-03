import { describe, expect, it } from 'vitest';
import { pecahTeks } from '../src/lib/teksKaya.ts';

describe('pecahTeks', () => {
  it('teks biasa tetap satu segmen', () => {
    expect(pecahTeks('Hasil 2 + 3 adalah ....')).toEqual([{ t: 'teks', isi: 'Hasil 2 + 3 adalah ....' }]);
    expect(pecahTeks('')).toEqual([]);
  });

  it('rumus sebaris dan satu baris', () => {
    expect(pecahTeks('Nilai $\\frac{3}{4}$ lalu $$x^{2}$$ selesai')).toEqual([
      { t: 'teks', isi: 'Nilai ' },
      { t: 'rumus', isi: '\\frac{3}{4}', blok: false },
      { t: 'teks', isi: ' lalu ' },
      { t: 'rumus', isi: 'x^{2}', blok: true },
      { t: 'teks', isi: ' selesai' },
    ]);
    expect(pecahTeks('A \\(a+b\\) B \\[c\\]')).toEqual([
      { t: 'teks', isi: 'A ' }, { t: 'rumus', isi: 'a+b', blok: false },
      { t: 'teks', isi: ' B ' }, { t: 'rumus', isi: 'c', blok: true },
    ]);
  });

  it('uang bukan rumus: "$5 dan $10", "Rp$5", dan \\$ yang di-escape', () => {
    expect(pecahTeks('Harga $5 dan $10 per buah')).toEqual([{ t: 'teks', isi: 'Harga $5 dan $10 per buah' }]);
    expect(pecahTeks('Biaya \\$5 dan \\$10')).toEqual([{ t: 'teks', isi: 'Biaya $5 dan $10' }]);
    expect(pecahTeks('Sisa $ 5 dan $')).toEqual([{ t: 'teks', isi: 'Sisa $ 5 dan $' }]);
    // Tanda dolar di dalam rumus lewat \$
    expect(pecahTeks('$\\$5 + 3$')).toEqual([{ t: 'rumus', isi: '\\$5 + 3', blok: false }]);
  });

  it('kode: blok berpagar dengan bahasa, kode sebaris, dan rumus di dalam kode tidak diproses', () => {
    const s = 'Keluaran?\n```Python\nx = "$a$"\nprint(x)\n```\nPilih jawaban.';
    expect(pecahTeks(s)).toEqual([
      { t: 'teks', isi: 'Keluaran?\n' },
      { t: 'blokKode', bahasa: 'python', isi: 'x = "$a$"\nprint(x)' },
      { t: 'teks', isi: 'Pilih jawaban.' },
    ]);
    expect(pecahTeks('Panggil `print($x$)` dulu')).toEqual([
      { t: 'teks', isi: 'Panggil ' }, { t: 'kode', isi: 'print($x$)' }, { t: 'teks', isi: ' dulu' },
    ]);
  });

  it('penanda tak lengkap dibiarkan sebagai teks (saat guru masih mengetik)', () => {
    expect(pecahTeks('rumus $\\frac{1}{2 belum ditutup')).toEqual([{ t: 'teks', isi: 'rumus $\\frac{1}{2 belum ditutup' }]);
    expect(pecahTeks('```python\nprint(1)')).toEqual([{ t: 'teks', isi: '```python\nprint(1)' }]);
    expect(pecahTeks('satu `kode\nbaris` dua')).toEqual([{ t: 'teks', isi: 'satu `kode\nbaris` dua' }]);
    expect(pecahTeks('a $b\n\nc$ d')).toEqual([{ t: 'teks', isi: 'a $b\n\nc$ d' }]);
  });

  it('aksara asing tidak mengganggu penguraian', () => {
    expect(pecahTeks('ما معنى $x$ في «كتاب»؟')).toEqual([
      { t: 'teks', isi: 'ما معنى ' }, { t: 'rumus', isi: 'x', blok: false }, { t: 'teks', isi: ' في «كتاب»؟' },
    ]);
    expect(pecahTeks('你好，$a+b$')).toEqual([{ t: 'teks', isi: '你好，' }, { t: 'rumus', isi: 'a+b', blok: false }]);
  });
});
