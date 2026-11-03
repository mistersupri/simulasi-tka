import { describe, expect, it } from 'vitest';
import { adaRumusBelumLengkap, dariDokumen, keDokumen } from '../src/lib/dokumenTeks.ts';
import { pecahTeks, bersihkanRumus, rumusBelumLengkap } from '../src/lib/teksKaya.ts';

const bolakBalik = (s: string) => dariDokumen(keDokumen(s));

describe('konversi teks bertanda <-> dokumen editor', () => {
  it('stabil (hasilnya sama persis) untuk teks yang sudah rapi', () => {
    for (const s of [
      '',
      'Hasil dari 2 + 3 adalah ....',
      'Baris satu\nBaris dua',
      'Satu\n\nTiga setelah baris kosong',
      'Hasil $\\frac{3}{4}+\\frac{1}{2}$ adalah ....',
      '$x^{2}$',
      'Luas lingkaran\n$$L = \\pi r^{2}$$\nBila $r = 7$ cm',
      '$$a+b$$',
      'Atas\n\n$$x$$\n\nBawah',
      'Keluaran?\n```python\nfor i in range(3):\n    print(i)\n```\nPilih jawaban',
      '```\nkode tanpa bahasa\n```',
      'Panggil `print(x)` lalu `y`',
      'Biaya \\$5 dan \\$10',
      'ما معنى $x$ في «كتاب»؟',
      '你好，$a+b$ 再见',
      'Teks\n```sql\nSELECT 1\n```',
    ]) expect(bolakBalik(s), JSON.stringify(s)).toBe(s);
  });

  it('rumus yang langsung diikuti angka memakai \\( \\) agar tetap terbaca', () => {
    const dok = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'rumus', attrs: { latex: 'x' } }, { type: 'text', text: '5 buah' }] }] };
    const s = dariDokumen(dok);
    expect(s).toBe('\\(x\\)5 buah');
    expect(pecahTeks(s)[0]).toEqual({ t: 'rumus', isi: 'x', blok: false });
    expect(bolakBalik(s)).toBe(s); // stabil: tetap memakai \( \)
    expect(pecahTeks(bolakBalik(s))).toEqual(pecahTeks(s));
  });

  it('tanda dolar biasa di-escape saat disimpan dan tampil sama', () => {
    const s = 'Harga $5 dan $10 per buah';
    const hasil = bolakBalik(s);
    expect(hasil).toBe('Harga \\$5 dan \\$10 per buah');
    expect(pecahTeks(hasil)).toEqual(pecahTeks(s));
  });

  it('struktur dokumen: paragraf, rumus sebaris, rumus blok, blok kode', () => {
    const dok = keDokumen('Hasil $\\frac{1}{2}$ ya\n$$L=\\pi r^{2}$$\n```python\nprint(1)\n```');
    expect(dok.content.map((b) => b.type)).toEqual(['paragraph', 'rumusBlok', 'codeBlock']);
    expect(dok.content[0].content!.map((n) => n.type)).toEqual(['text', 'rumus', 'text']);
    expect(dok.content[2].attrs).toEqual({ language: 'python' });
    expect(keDokumen('').content).toEqual([{ type: 'paragraph' }]);
  });

  it('paragraf kosong tambahan di bawah blok terakhir tidak disimpan', () => {
    const dok = keDokumen('$$x$$');
    dok.content.push({ type: 'paragraph' });
    expect(dariDokumen(dok)).toBe('$$x$$');
  });

  it('rumus kosong tidak ikut disimpan, dan rumus belum lengkap terdeteksi', () => {
    const dok = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a ' }, { type: 'rumus', attrs: { latex: '' } }, { type: 'text', text: ' b' }] }] };
    expect(dariDokumen(dok)).toBe('a  b');
    expect(adaRumusBelumLengkap(dok)).toBe(true);
    expect(adaRumusBelumLengkap(keDokumen('$\\frac{1}{2}$'))).toBe(false);
    expect(adaRumusBelumLengkap(keDokumen('$\\frac{\\placeholder{}}{2}$'))).toBe(true);
  });

  it('kotak kosong editor (\\placeholder) ditampilkan sebagai kotak oleh penyaji', () => {
    expect(bersihkanRumus('\\frac{\\placeholder{}}{\\placeholder[b]{x}}')).toBe('\\frac{\\square }{\\square }');
    expect(rumusBelumLengkap('\\sqrt{\\placeholder{}}')).toBe(true);
    expect(rumusBelumLengkap('\\sqrt{2}')).toBe(false);
  });
});
