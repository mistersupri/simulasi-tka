import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { pecahTeks, type Segmen } from '@/lib/teksKaya';
import { cn } from '@/lib/utils';

type Katex = typeof import('katex').default;
type Sorot = typeof import('@/lib/sorot');

// KaTeX (+CSS dan font) dan penyorot kode dimuat sekali, hanya bila ada soal yang memakainya.
let katexSiap: Katex | null = null;
let sorotSiap: Sorot | null = null;
const muatKatex = () => Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => (katexSiap = m.default));
const muatSorot = () => import('@/lib/sorot').then((m) => (sorotSiap = m));

function useMuat<T>(perlu: boolean, siap: () => T | null, muat: () => Promise<T>): T | null {
  const [modul, setModul] = useState<T | null>(siap);
  useEffect(() => {
    if (!perlu || modul) return;
    let batal = false;
    muat().then((m) => !batal && setModul(m)).catch(() => {}); // gagal dimuat: teks mentah tetap terbaca
    return () => { batal = true; };
  }, [perlu, modul, muat]);
  return modul;
}

/**
 * Rumus satu baris dan blok kode sudah berdiri sendiri sebagai blok. Satu baris baru di kiri/kanannya
 * (hasil mengetik rumus di baris sendiri) dibuang agar tidak ada jarak kosong ganda.
 */
function rapikanBlok(segmen: Segmen[]): Segmen[] {
  const blok = (x?: Segmen) => !!x && (x.t === 'blokKode' || (x.t === 'rumus' && x.blok));
  return segmen
    .map((x, i) => {
      if (x.t !== 'teks') return x;
      let isi = x.isi;
      if (blok(segmen[i - 1])) isi = isi.replace(/^\n/, '');
      if (blok(segmen[i + 1])) isi = isi.replace(/\n$/, '');
      return { ...x, isi };
    })
    .filter((x) => x.t !== 'teks' || x.isi !== '');
}

function Rumus({ isi, blok, katex }: { isi: string; blok: boolean; katex: Katex | null }) {
  const html = useMemo(() => {
    if (!katex) return null;
    try {
      return katex.renderToString(isi, {
        displayMode: blok, throwOnError: false, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 1000,
        output: 'htmlAndMathml', errorColor: '#b42318',
      });
    } catch {
      return null;
    }
  }, [katex, isi, blok]);

  // Sebelum KaTeX siap (atau bila gagal), tampilkan rumus apa adanya agar tidak ada yang hilang.
  if (!html) return <code className="font-mono text-[0.92em]" dir="ltr">{blok ? `$$${isi}$$` : `$${isi}$`}</code>;
  return blok
    ? <div dir="ltr" className="my-2 overflow-x-auto overflow-y-hidden py-1 text-center" dangerouslySetInnerHTML={{ __html: html }} />
    : <span dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />;
}

function BlokKode({ isi, bahasa, sorot }: { isi: string; bahasa: string; sorot: Sorot | null }) {
  const html = useMemo(() => (sorot && bahasa ? sorot.sorotKode(isi, bahasa) : null), [sorot, isi, bahasa]);
  return (
    <figure className="my-3" dir="ltr">
      {bahasa && <figcaption className="rounded-t-md border border-b-0 border-garis bg-muted px-3 py-1 font-mono text-xs font-semibold uppercase text-muted-foreground">{bahasa}</figcaption>}
      <pre className={cn('overflow-x-auto border border-garis bg-kode px-3 py-2.5 font-mono text-[0.92em] leading-relaxed whitespace-pre text-tinta', bahasa ? 'rounded-b-md' : 'rounded-md')}>
        {html ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{isi}</code>}
      </pre>
    </figure>
  );
}

/**
 * Teks soal/pilihan/pembahasan dengan dukungan rumus LaTeX ($...$, $$...$$) dan kode (```bahasa```).
 * Arah tulisan ditentukan otomatis dari huruf pertama (dir="auto") sehingga teks Arab/Ibrani tampil kanan-ke-kiri.
 * `sebaris`: untuk dipakai di dalam tombol/span.
 */
export function Teks({ children, className, style, sebaris }: { children: string; className?: string; style?: CSSProperties; sebaris?: boolean }) {
  const segmen = useMemo<Segmen[]>(() => rapikanBlok(pecahTeks(children)), [children]);
  const katex = useMuat(segmen.some((x) => x.t === 'rumus'), () => katexSiap, muatKatex);
  const sorot = useMuat(segmen.some((x) => x.t === 'blokKode' && x.bahasa !== ''), () => sorotSiap, muatSorot);
  const Pembungkus = sebaris ? 'span' : 'div';
  return (
    <Pembungkus dir="auto" style={style} className={cn('break-words whitespace-pre-line text-start', className)}>
      {segmen.map((x, i) => {
        switch (x.t) {
          case 'teks': return x.isi;
          case 'rumus': return <Rumus key={i} isi={x.isi} blok={x.blok} katex={katex} />;
          case 'kode': return <code key={i} dir="ltr" className="rounded-sm bg-kode px-1 py-0.5 font-mono text-[0.92em]">{x.isi}</code>;
          case 'blokKode': return <BlokKode key={i} isi={x.isi} bahasa={x.bahasa} sorot={sorot} />;
        }
      })}
    </Pembungkus>
  );
}
