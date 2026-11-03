import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { MathfieldElement } from 'mathlive';
import { cn } from '@/lib/utils';
import { adapterRumus } from '@/components/papan/adapter';
import { usePapan } from '@/components/papan/PapanKetik';
import { ambilFokusRumus, muatMathLive } from './mathlive';

/**
 * Tampilan rumus di dalam editor: elemen <math-field> MathLive. Disimpan sebagai LaTeX di atribut `latex`.
 * Elemen dibuat lewat kode (bukan JSX) agar siklus hidupnya tidak bercampur dengan React.
 */
function TampilanRumus({ node, updateAttributes, editor, getPos, deleteNode, selected }: NodeViewProps) {
  const blok = node.type.name === 'rumusBlok';
  const tempat = useRef<HTMLSpanElement>(null);
  const medan = useRef<MathfieldElement | null>(null);
  const latexTerakhir = useRef(String(node.attrs.latex ?? ''));
  const [gagal, setGagal] = useState(false);
  const daftarkanRef = useRef(usePapan()?.daftarkan);

  useEffect(() => {
    let batal = false;
    let el: MathfieldElement | null = null;
    let lepasPapan: (() => void) | undefined;
    muatMathLive()
      .then(({ MathfieldElement }) => {
        if (batal || !tempat.current) return;
        el = new MathfieldElement();
        el.mathVirtualKeyboardPolicy = 'manual'; // keyboard bawaan MathLive tidak dipakai; ada papan ketik layar sendiri
        el.className = cn('rumus-editor', blok && 'rumus-blok');
        el.setAttribute('aria-label', blok ? 'Rumus satu baris' : 'Rumus');
        el.value = latexTerakhir.current;
        // `latex-expanded` mengubah perintah khusus MathLive (mis. \differentialD) menjadi LaTeX biasa yang dipahami KaTeX.
        el.addEventListener('input', () => {
          const v = el!.getValue('latex-expanded');
          latexTerakhir.current = v;
          updateAttributes({ latex: v });
        });
        // Panah/Tab di ujung rumus memindahkan kursor ke teks di sekitarnya.
        el.addEventListener('move-out', (e) => {
          const pos = getPos();
          if (typeof pos !== 'number') return;
          e.preventDefault();
          const mundur = e.detail.direction === 'backward' || e.detail.direction === 'upward';
          editor.chain().focus().setTextSelection(mundur ? pos : pos + node.nodeSize).run();
        });
        el.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          const pos = getPos();
          if (typeof pos === 'number') editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
        });
        tempat.current.appendChild(el);
        medan.current = el;
        // Papan ketik layar menyisipkan karakter ke kotak rumus yang sedang aktif.
        lepasPapan = daftarkanRef.current?.(el, adapterRumus(el));
        if (ambilFokusRumus()) {
          requestAnimationFrame(() => {
            el?.focus();
            // Potongan seperti pecahan/akar: kursor langsung masuk ke kotak putus-putus pertama.
            if (/\\placeholder/.test(latexTerakhir.current)) {
              el?.executeCommand('moveToMathfieldStart');
              el?.executeCommand('moveToNextPlaceholder');
            }
          });
        }
      })
      .catch(() => setGagal(true));
    return () => {
      batal = true;
      lepasPapan?.();
      el?.remove();
      medan.current = null;
    };
    // Dibuat sekali per node; perubahan dari luar (undo/redo) disinkronkan di efek berikut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const latex = String(node.attrs.latex ?? '');
    if (medan.current && latex !== latexTerakhir.current) {
      medan.current.value = latex;
      latexTerakhir.current = latex;
    }
  }, [node.attrs.latex]);

  return (
    <NodeViewWrapper
      as={blok ? 'div' : 'span'}
      contentEditable={false}
      className={cn('rumus-node group/rumus', blok ? 'rumus-node-blok' : 'rumus-node-sebaris', selected && 'rumus-terpilih')}
    >
      {gagal
        ? <code className="rounded-sm bg-merah-muda px-1 text-sm text-merah">Editor rumus gagal dimuat. Muat ulang halaman.</code>
        : <span ref={tempat} className="rumus-tempat" />}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => deleteNode()}
        className="rumus-hapus"
        aria-label="Hapus rumus"
        title="Hapus rumus"
      >
        <X weight="bold" className="size-3" />
      </button>
    </NodeViewWrapper>
  );
}

const dalamRumus = (target: EventTarget | null) => target instanceof Element && !!target.closest('math-field, .rumus-hapus');

const dasar = {
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? '',
        renderHTML: (a: Record<string, unknown>) => ({ 'data-latex': String(a.latex ?? '') }),
      },
    };
  },
};

/** Rumus dalam kalimat: $...$ */
export const RumusSebaris = Node.create({
  name: 'rumus',
  group: 'inline',
  inline: true,
  ...dasar,
  parseHTML: () => [{ tag: 'span[data-rumus]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes({ 'data-rumus': '' }, HTMLAttributes), `$${node.attrs.latex}$`],
  addNodeView: () => ReactNodeViewRenderer(TampilanRumus, { as: 'span', stopEvent: ({ event }) => dalamRumus(event.target), ignoreMutation: () => true }),
});

/** Rumus di baris sendiri: $$...$$ */
export const RumusBlok = Node.create({
  name: 'rumusBlok',
  group: 'block',
  ...dasar,
  parseHTML: () => [{ tag: 'div[data-rumus-blok]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['div', mergeAttributes({ 'data-rumus-blok': '' }, HTMLAttributes), `$$${node.attrs.latex}$$`],
  addNodeView: () => ReactNodeViewRenderer(TampilanRumus, { as: 'div', stopEvent: ({ event }) => dalamRumus(event.target), ignoreMutation: () => true }),
});
