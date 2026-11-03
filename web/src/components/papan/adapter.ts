/**
 * Adapter: cara papan ketik layar menyisipkan karakter ke tiga jenis kolom yang ada di formulir soal
 * (editor teks TipTap, kotak rumus MathLive, dan kotak teks biasa).
 */
import type { Editor } from '@tiptap/react';
import type { MathfieldElement } from 'mathlive';
import { mintaFokusRumus } from '@/components/editor/mathlive';
import { teksAksi, type Aksi } from '@/lib/papan/tataLetak';

export type Adapter = {
  fokus(): void;
  /** Menyisipkan hasil satu tombol (teks, atau kotak rumus untuk tombol struktur). */
  sisipAksi(aksi: Aksi): void;
  /** Teks tepat sebelum kursor (paling banyak n karakter), untuk penyusunan suku kata. */
  konteks(n: number): string;
  /** Mengganti n karakter sebelum kursor dengan teks baru. */
  ganti(hapus: number, sisip: string): void;
  hapus(): void;
  baris(): void;
};

export function adapterEditor(editor: Editor): Adapter {
  return {
    fokus: () => { editor.commands.focus(); },
    sisipAksi(a) {
      const latex = a.latexBaru ?? a.latex;
      if (a.struktur && latex) {
        mintaFokusRumus();
        editor.chain().focus().insertContent({ type: 'rumus', attrs: { latex } }).run();
        return;
      }
      editor.chain().focus().insertContent({ type: 'text', text: teksAksi(a) }).run();
    },
    konteks(n) {
      const { from } = editor.state.selection;
      return editor.state.doc.textBetween(Math.max(0, from - n), from, '', '\0');
    },
    ganti(hapus, sisip) {
      const { from, to } = editor.state.selection;
      const rentang = { from: Math.max(0, from - hapus), to };
      if (sisip) editor.chain().focus().insertContentAt(rentang, { type: 'text', text: sisip }).run();
      else editor.chain().focus().deleteRange(rentang).run();
    },
    hapus() { editor.chain().focus().keyboardShortcut('Backspace').run(); },
    baris() { editor.chain().focus().keyboardShortcut('Enter').run(); },
  };
}

export function adapterRumus(mf: MathfieldElement): Adapter {
  const ketik = (t: string) => { mf.executeCommand(['typedText', t]); };
  return {
    fokus: () => mf.focus(),
    sisipAksi(a) {
      if (a.latex) mf.insert(a.latex, { format: 'latex' });
      else ketik(teksAksi(a));
    },
    konteks: () => '',
    ganti(hapus, sisip) {
      for (let i = 0; i < hapus; i++) mf.executeCommand('deleteBackward');
      if (sisip) ketik(sisip);
    },
    hapus() { mf.executeCommand('deleteBackward'); },
    baris() {},
  };
}

/** Kotak teks/area teks biasa (mis. daftar jawaban yang diterima pada soal isian). */
export function adapterTeks(el: HTMLInputElement | HTMLTextAreaElement): Adapter {
  const ubah = (dari: number, sampai: number, teks: string) => {
    el.setRangeText(teks, dari, sampai, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true })); // agar React membaca nilai barunya
  };
  const posisi = () => [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length] as const;
  return {
    fokus: () => el.focus(),
    sisipAksi(a) { const [s, e] = posisi(); ubah(s, e, teksAksi(a)); },
    konteks(n) { const [s] = posisi(); return el.value.slice(Math.max(0, s - n), s); },
    ganti(hapus, sisip) { const [s, e] = posisi(); ubah(Math.max(0, s - hapus), e, sisip); },
    hapus() {
      const [s, e] = posisi();
      if (s !== e) ubah(s, e, '');
      else if (s > 0) ubah(s - 1, s, '');
    },
    baris() { const [s, e] = posisi(); ubah(s, e, '\n'); },
  };
}
