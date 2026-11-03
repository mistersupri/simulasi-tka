/**
 * Konversi antara teks soal bertanda ($...$, $$...$$, ```kode```, `kode`) dan dokumen editor (TipTap/ProseMirror).
 *
 * Soal tetap disimpan sebagai teks bertanda: impor Excel, ekspor, penilaian, dan tampilan siswa (KaTeX)
 * tidak berubah. Editor hanya cara yang lebih rapi untuk menulisnya. Berkas ini murni TypeScript (tanpa DOM)
 * agar bisa diuji di tests/.
 */
import { pecahTeks, rapikanBlok } from './teksKaya.ts';

export type NodeDok = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeDok[];
  text?: string;
  marks?: { type: string }[];
};
export type Dok = { type: 'doc'; content: NodeDok[] };

const KODE: { type: string }[] = [{ type: 'code' }];

/** Teks bertanda → dokumen editor. Satu baris = satu paragraf (baris kosong dipertahankan). */
export function keDokumen(teks: string): Dok {
  const blok: NodeDok[] = [];
  let baris: NodeDok[] = [];
  let tersentuh = false; // baris ini sungguhan ada (bukan sisa awal dokumen atau setelah blok)

  const tutupBaris = () => {
    blok.push({ type: 'paragraph', ...(baris.length ? { content: baris } : {}) });
    baris = [];
  };
  const keluarBaris = () => {
    if (tersentuh) tutupBaris();
    baris = [];
    tersentuh = false;
  };

  for (const x of rapikanBlok(pecahTeks(teks))) {
    switch (x.t) {
      case 'teks':
        x.isi.split('\n').forEach((potongan, k) => {
          if (k > 0) { tutupBaris(); tersentuh = true; }
          if (potongan) { baris.push({ type: 'text', text: potongan }); tersentuh = true; }
        });
        break;
      case 'kode':
        baris.push({ type: 'text', text: x.isi, marks: KODE });
        tersentuh = true;
        break;
      case 'rumus':
        if (x.blok) { keluarBaris(); blok.push({ type: 'rumusBlok', attrs: { latex: x.isi } }); }
        else { baris.push({ type: 'rumus', attrs: { latex: x.isi } }); tersentuh = true; }
        break;
      case 'blokKode':
        keluarBaris();
        blok.push({ type: 'codeBlock', attrs: { language: x.bahasa || null }, ...(x.isi ? { content: [{ type: 'text', text: x.isi }] } : {}) });
        break;
    }
  }
  if (tersentuh || blok.length === 0) tutupBaris();
  return { type: 'doc', content: blok };
}

/** `$` biasa harus di-escape agar tidak terbaca sebagai awal rumus. */
const escapeTeks = (t: string) => t.replace(/\$/g, '\\$');

function inline(node: NodeDok[] | undefined): string {
  const anak = node ?? [];
  return anak
    .map((n, i) => {
      if (n.type === 'hardBreak') return '\n';
      if (n.type === 'rumus') {
        const latex = String(n.attrs?.latex ?? '').trim();
        if (!latex) return '';
        // $...$ tidak sah bila `$` penutup langsung diikuti angka; pakai \( \) pada kasus itu.
        const berikut = anak[i + 1];
        const diikutiAngka = berikut?.type === 'text' && /^\d/.test(berikut.text ?? '');
        return diikutiAngka ? `\\(${latex}\\)` : `$${latex}$`;
      }
      if (n.type !== 'text') return '';
      const isi = n.text ?? '';
      return n.marks?.some((m) => m.type === 'code') && isi && !isi.includes('`') ? `\`${isi}\`` : escapeTeks(isi);
    })
    .join('');
}

/** Dokumen editor → teks bertanda. */
export function dariDokumen(dok: Dok): string {
  const blok = [...(dok.content ?? [])];
  // Paragraf kosong yang ditambahkan editor di bawah blok terakhir (agar kursor bisa turun) tidak ikut disimpan.
  const terakhir = blok[blok.length - 1];
  const sebelum = blok[blok.length - 2];
  if (terakhir?.type === 'paragraph' && !terakhir.content?.length && sebelum && sebelum.type !== 'paragraph') blok.pop();

  return blok
    .map((b) => {
      switch (b.type) {
        case 'paragraph': return inline(b.content);
        case 'rumusBlok': {
          const latex = String(b.attrs?.latex ?? '').trim();
          return latex ? `$$${latex}$$` : '';
        }
        case 'codeBlock': {
          const bahasa = typeof b.attrs?.language === 'string' ? b.attrs.language : '';
          const isi = (b.content ?? []).map((n) => n.text ?? '').join('');
          return `\`\`\`${bahasa}\n${isi.replace(/\n```/g, '\n` ``')}\n\`\`\``;
        }
        default: return '';
      }
    })
    .join('\n');
}

/** Apakah ada rumus yang masih kosong atau belum lengkap (kotak putus-putus belum diisi)? */
export function adaRumusBelumLengkap(dok: Dok): boolean {
  const periksa = (n: NodeDok): boolean => {
    if (n.type === 'rumus' || n.type === 'rumusBlok') {
      const latex = String(n.attrs?.latex ?? '').trim();
      return !latex || /\\placeholder(\[[^\]]*\])?\{/.test(latex);
    }
    return (n.content ?? []).some(periksa);
  };
  return (dok.content ?? []).some(periksa);
}
