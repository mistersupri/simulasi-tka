import { Code, Function as IkonRumus } from '@phosphor-icons/react';
import { useRef, type ComponentProps } from 'react';
import { Teks } from '@/components/TeksKaya';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { atributLang } from '@/lib/bahasa';
import { adaMarkup } from '@/lib/teksKaya';

/** Potongan LaTeX yang paling sering dipakai guru. `tampil` = tulisan di tombol, `isi` = LaTeX, `pilih` = bagian yang ditandai setelah disisipkan. */
const POTONGAN: { tampil: string; nama: string; isi: string; pilih?: string }[] = [
  { tampil: 'a/b', nama: 'Pecahan', isi: '\\frac{a}{b}', pilih: 'a' },
  { tampil: '√', nama: 'Akar', isi: '\\sqrt{x}', pilih: 'x' },
  { tampil: 'xⁿ', nama: 'Pangkat', isi: 'x^{2}', pilih: 'x' },
  { tampil: 'xₙ', nama: 'Indeks bawah', isi: 'x_{1}', pilih: 'x' },
  { tampil: '×', nama: 'Kali', isi: '\\times ' },
  { tampil: '÷', nama: 'Bagi', isi: '\\div ' },
  { tampil: 'π', nama: 'Pi', isi: '\\pi ' },
  { tampil: '±', nama: 'Tambah kurang', isi: '\\pm ' },
  { tampil: '≤', nama: 'Kurang dari sama dengan', isi: '\\leq ' },
  { tampil: '≥', nama: 'Lebih dari sama dengan', isi: '\\geq ' },
  { tampil: '≠', nama: 'Tidak sama dengan', isi: '\\neq ' },
  { tampil: '°', nama: 'Derajat', isi: '^{\\circ}' },
  { tampil: '∠', nama: 'Sudut', isi: '\\angle ' },
  { tampil: '△', nama: 'Segitiga', isi: '\\triangle ' },
  { tampil: '∑', nama: 'Sigma', isi: '\\sum_{i=1}^{n}' },
  { tampil: '∫', nama: 'Integral', isi: '\\int_{a}^{b}' },
];

/** Apakah posisi kursor berada di dalam rumus $...$ (jumlah $ yang belum ditutup ganjil; \$ tidak dihitung). */
function didalamRumus(teks: string, posisi: number) {
  return ((teks.slice(0, posisi).replace(/\\\$/g, '').match(/\$/g) ?? []).length % 2) === 1;
}

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  bahasa?: string;
  /** Tampilkan tombol rumus dan kode. */
  alat?: boolean;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  petunjuk?: string;
} & Pick<ComponentProps<typeof Textarea>, 'disabled'>;

/**
 * Kolom teks untuk soal: tombol bantu rumus matematika dan kode, serta pratinjau langsung
 * bila teks memuat rumus atau kode. Mengikuti bahasa soal (huruf dan arah tulisan).
 */
export function PenyuntingTeks({ id, label, value, onChange, bahasa, alat = true, rows = 4, required, placeholder, petunjuk, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const sisipkan = (sebelum: string, isi: string, sesudah = '', pilih?: string) => {
    const el = ref.current;
    const awal = el?.selectionStart ?? value.length;
    const akhir = el?.selectionEnd ?? value.length;
    const terpilih = value.slice(awal, akhir);
    const tengah = terpilih || isi;
    onChange(value.slice(0, awal) + sebelum + tengah + sesudah + value.slice(akhir));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const mulai = awal + sebelum.length;
      const p = !terpilih && pilih ? tengah.indexOf(pilih) : -1;
      if (p >= 0) el.setSelectionRange(mulai + p, mulai + p + pilih!.length);
      else el.setSelectionRange(mulai, mulai + tengah.length);
    });
  };

  // Di luar rumus, potongan dibungkus $...$ otomatis; di dalam rumus disisipkan apa adanya.
  const sisipkanPotongan = (p: (typeof POTONGAN)[number]) => {
    const di = didalamRumus(value, ref.current?.selectionStart ?? value.length);
    if (di) sisipkan('', p.isi, '', p.pilih);
    else {
      const el = ref.current;
      const awal = el?.selectionStart ?? value.length;
      const akhir = el?.selectionEnd ?? value.length;
      const terpilih = value.slice(awal, akhir);
      sisipkan('$', terpilih || p.isi, '$', terpilih ? undefined : p.pilih);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {alat && !disabled && (
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={`Alat bantu ${label}`}>
          <Button type="button" size="sm" variant="outline" onClick={() => sisipkan('$', 'x', '$', 'x')} title="Rumus dalam kalimat: $...$"><IkonRumus /> Rumus</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => sisipkan('\n$$', 'x', '$$\n', 'x')} title="Rumus di baris sendiri: $$...$$">Rumus baris</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => sisipkan('\n```python\n', 'print("halo")', '\n```\n', 'print("halo")')} title="Blok kode program"><Code /> Kode</Button>
          <span className="mx-1 h-5 w-px bg-garis" aria-hidden />
          {POTONGAN.map((p) => (
            <Button key={p.nama} type="button" size="sm" variant="ghost" className="min-w-9 px-2 font-semibold" aria-label={p.nama} title={`${p.nama}: ${p.isi.trim()}`} onClick={() => sisipkanPotongan(p)}>
              {p.tampil}
            </Button>
          ))}
        </div>
      )}
      <Textarea
        id={id} ref={ref} rows={rows} value={value} required={required} placeholder={placeholder} disabled={disabled}
        lang={atributLang(bahasa)} dir="auto" onChange={(e) => onChange(e.target.value)}
        className={adaMarkup(value) ? 'font-mono text-[0.95rem]' : undefined}
      />
      {petunjuk && <p className="text-xs text-muted-foreground">{petunjuk}</p>}
      {adaMarkup(value) && (
        <div className="rounded-md border border-dashed border-garis bg-latar px-3 py-2" lang={atributLang(bahasa)}>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Pratinjau</p>
          <Teks>{value}</Teks>
        </div>
      )}
    </div>
  );
}
