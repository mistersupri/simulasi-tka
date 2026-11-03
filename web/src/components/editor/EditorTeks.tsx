import { Code, Function as IkonRumus, Warning } from '@phosphor-icons/react';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { atributLang } from '@/lib/bahasa';
import { adaRumusBelumLengkap, dariDokumen, keDokumen, type Dok } from '@/lib/dokumenTeks';
import { adaMarkup } from '@/lib/teksKaya';
import { cn } from '@/lib/utils';
import { adapterEditor } from '@/components/papan/adapter';
import { usePapan } from '@/components/papan/PapanKetik';
import { TombolPapan } from '@/components/papan/PapanKetikLayar';
import { mintaFokusRumus } from './mathlive';
import { RumusBlok, RumusSebaris } from './rumus';

const BAHASA_KODE = ['python', 'javascript', 'java', 'c', 'cpp', 'csharp', 'php', 'sql', 'html', 'css', 'bash', 'json', 'pascal'];

/** Arah tulisan tiap paragraf ditentukan dari huruf pertamanya (Arab/Ibrani kanan-ke-kiri). */
const ParagrafAuto = Paragraph.extend({
  renderHTML({ HTMLAttributes }) {
    return ['p', { ...HTMLAttributes, dir: 'auto' }, 0];
  },
});

function buatEkstensi(ringkas: boolean, placeholder?: string) {
  return [
    StarterKit.configure({
      paragraph: false,
      bold: false, italic: false, strike: false, underline: false, link: false, heading: false, blockquote: false,
      bulletList: false, orderedList: false, listItem: false, listKeymap: false, horizontalRule: false,
      codeBlock: ringkas ? false : { defaultLanguage: null },
    }),
    ParagrafAuto,
    RumusSebaris,
    RumusBlok,
    Placeholder.configure({ placeholder: placeholder ?? '' }),
  ];
}

/** Potongan rumus siap pakai: kotak putus-putus yang tinggal diisi, seperti di MathLive. */
const POTONGAN = [
  { tampil: 'a/b', nama: 'Pecahan', latex: '\\frac{\\placeholder{}}{\\placeholder{}}' },
  { tampil: '√', nama: 'Akar', latex: '\\sqrt{\\placeholder{}}' },
  { tampil: 'xⁿ', nama: 'Pangkat', latex: '{\\placeholder{}}^{\\placeholder{}}' },
  { tampil: 'xₙ', nama: 'Indeks bawah', latex: '{\\placeholder{}}_{\\placeholder{}}' },
];

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  bahasa?: string;
  /** Mode ringkas (untuk pilihan jawaban): tanpa blok kode, bilah alat muncul saat diklik. */
  ringkas?: boolean;
  placeholder?: string;
  petunjuk?: string;
  /** Label hanya untuk pembaca layar (bila label terlihat sudah ada di sekitarnya). */
  labelTersembunyi?: boolean;
  /** Tinggi minimum area ketik (rem). */
  tinggiMin?: number;
  className?: string;
};

function Alat({ editor, ringkas }: { editor: Editor; ringkas: boolean }) {
  const status = useEditorState({
    editor,
    selector: (c) => ({
      kode: !ringkas && c.editor.isActive('codeBlock'),
      bahasaKode: (c.editor.getAttributes('codeBlock').language as string | null) ?? '',
      kodeSebaris: c.editor.isActive('code'),
    }),
  });
  const sisip = (jenis: 'rumus' | 'rumusBlok', latex = '') => {
    mintaFokusRumus();
    editor.chain().focus().insertContent({ type: jenis, attrs: { latex } }).run();
  };
  // Tombol tidak boleh mencuri fokus dari editor.
  const jaga = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() };
  return (
    <div
      role="toolbar" aria-label="Alat bantu penulisan"
      // Mode ringkas: bilah melayang di atas kotak saat fokus, tanpa menggeser tata letak (klik di sekitarnya tetap kena sasaran).
      className={cn(
        'flex flex-wrap items-center gap-1 bg-latar px-2 py-1.5',
        ringkas ? 'absolute -top-12 left-0 z-20 hidden rounded-md border border-garis shadow-md group-focus-within/editor:flex' : 'border-b border-garis',
      )}
    >
      <Button type="button" size="sm" variant="outline" {...jaga} onClick={() => sisip('rumus')} title="Rumus dalam kalimat"><IkonRumus /> Rumus</Button>
      {POTONGAN.map((p) => (
        <Button key={p.nama} type="button" size="sm" variant="ghost" className="min-w-9 px-2 font-semibold" {...jaga} aria-label={p.nama} title={p.nama} onClick={() => sisip('rumus', p.latex)}>
          {p.tampil}
        </Button>
      ))}
      {!ringkas && (
        <>
          <span className="mx-1 h-5 w-px bg-garis" aria-hidden />
          <Button type="button" size="sm" variant="outline" {...jaga} onClick={() => sisip('rumusBlok')} title="Rumus di baris sendiri">Rumus baris</Button>
          <Button
            type="button" size="sm" variant={status.kode ? 'default' : 'outline'} aria-pressed={status.kode} {...jaga}
            onClick={() => editor.chain().focus().toggleCodeBlock({ language: 'python' }).run()} title="Blok kode program"
          ><Code /> Kode</Button>
          <Button
            type="button" size="sm" variant={status.kodeSebaris ? 'default' : 'ghost'} aria-pressed={status.kodeSebaris} className="font-mono" {...jaga}
            onClick={() => editor.chain().focus().toggleCode().run()} title="Kode di dalam kalimat"
          >{'</>'}</Button>
          {status.kode && (
            <select
              aria-label="Bahasa pemrograman" value={status.bahasaKode}
              onChange={(e) => editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value || null }).run()}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Tanpa pewarnaan</option>
              {BAHASA_KODE.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </>
      )}
      {!ringkas && <TombolPapan className="ml-auto" />}
    </div>
  );
}

/**
 * Editor teks soal ala TipTap dengan rumus visual (MathLive). Menyimpan teks bertanda ($...$, ```kode```)
 * sehingga impor, penilaian, dan tampilan siswa tidak berubah (lihat lib/dokumenTeks.ts).
 */
export function EditorTeks({ label, value, onChange, bahasa, ringkas = false, placeholder, petunjuk, labelTersembunyi, tinggiMin, className }: Props) {
  const terakhir = useRef(value);
  const pembungkus = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const daftarkanPapan = usePapan()?.daftarkan;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [lengkap, setLengkap] = useState(() => !adaRumusBelumLengkap(keDokumen(value)));
  const ekstensi = useMemo(() => buatEkstensi(ringkas, placeholder), [ringkas, placeholder]);

  const editor = useEditor({
    extensions: ekstensi,
    content: keDokumen(value),
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'editor-isi' },
      // Tempelan teks yang memuat $rumus$ atau ```kode``` diubah menjadi rumus dan blok kode sungguhan.
      handlePaste: (_view, event) => {
        const teks = event.clipboardData?.getData('text/plain') ?? '';
        if (!teks || !adaMarkup(teks)) return false;
        editorRef.current?.commands.insertContent(keDokumen(teks).content);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON() as Dok;
      const teks = dariDokumen(json);
      terakhir.current = teks;
      setLengkap(!adaRumusBelumLengkap(json));
      onChangeRef.current(teks);
    },
  });

  editorRef.current = editor;

  // Papan ketik layar menyisipkan ke editor ini bila editor (bukan kotak rumus di dalamnya) yang sedang fokus.
  useEffect(() => {
    if (!editor || !daftarkanPapan || !pembungkus.current) return;
    return daftarkanPapan(pembungkus.current, adapterEditor(editor));
  }, [editor, daftarkanPapan]);

  // Perubahan dari luar (mis. form dimuat ulang) masuk ke editor; ketikan sendiri tidak dimuat ulang.
  useEffect(() => {
    if (editor && value !== terakhir.current) {
      terakhir.current = value;
      editor.commands.setContent(keDokumen(value), { emitUpdate: false });
      setLengkap(!adaRumusBelumLengkap(keDokumen(value)));
    }
  }, [editor, value]);

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className={cn('block text-sm font-semibold', labelTersembunyi && 'sr-only')}>{label}</span>
      <div
        ref={pembungkus}
        lang={atributLang(bahasa)}
        className={cn(
          'editor-teks group/editor relative rounded-md border border-input bg-white focus-within:border-biru focus-within:outline-2 focus-within:outline-biru',
          ringkas && 'editor-ringkas',
        )}
        style={{ ['--tinggi-min' as string]: `${tinggiMin ?? (ringkas ? 2.5 : 8)}rem` }}
      >
        {editor && <Alat editor={editor} ringkas={ringkas} />}
        <EditorContent editor={editor} />
        {/* Pilihan jawaban: tombol keyboard tetap terlihat di ujung kanan kotak (satu per kotak). */}
        {ringkas && <TombolPapan className="absolute top-1 right-1 z-10" />}
      </div>
      {petunjuk && <p className="text-xs text-muted-foreground">{petunjuk}</p>}
      {!lengkap && (
        <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-merah">
          <Warning weight="fill" className="size-4" /> Ada rumus yang masih kosong atau belum lengkap (kotak putus-putus belum diisi).
        </p>
      )}
    </div>
  );
}
