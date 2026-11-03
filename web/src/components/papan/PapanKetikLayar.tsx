import { ArrowFatUp, ArrowsLeftRight, CaretLeft, CaretRight, Keyboard, X } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import { atributLang, DAFTAR_BAHASA } from '@/lib/bahasa';
import { PAPAN_BIASA } from '@/lib/papan/daftar';
import { UKURAN_HALAMAN } from '@/lib/papan/pinyin';
import { BARIS_KODE, pilihAksi } from '@/lib/papan/tataLetak';
import { cn } from '@/lib/utils';
import { usePapan } from './PapanKetik';

const kelasKunci =
  'flex h-10 min-w-0 items-center justify-center rounded-md border border-garis bg-white px-0.5 text-base font-semibold text-tinta select-none ' +
  'hover:border-biru hover:bg-biru-muda active:bg-biru-pucat';

/**
 * Tombol keyboard di tiap kotak isian (satu per kotak). Tampil dengan label singkat bila papan alternatif sedang aktif
 * (Σ untuk formula, kode bahasa untuk bahasa asing) agar jelas bahwa tombol fisik sedang dipetakan ulang.
 */
export function TombolPapan({ className }: { className?: string }) {
  const p = usePapan();
  if (!p) return null;
  const label = p.aktif ? (p.idAlternatif === 'formula' ? 'Σ' : p.idAlternatif.toUpperCase()) : null;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => p.setTerbuka(!p.terbuka)}
      aria-pressed={p.terbuka}
      aria-label="Papan ketik layar"
      title={p.aktif ? 'Papan ketik layar (papan alternatif sedang aktif)' : 'Papan ketik layar: formula dan bahasa asing'}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-md border px-2 text-sm font-semibold transition-colors',
        p.terbuka || p.aktif ? 'border-biru bg-biru-muda text-biru-tua' : 'border-garis bg-white text-tinta hover:bg-muted',
        className,
      )}
    >
      <Keyboard className="size-5" weight={p.aktif ? 'fill' : 'regular'} />
      {label && <span aria-hidden>{label}</span>}
    </button>
  );
}

export function PapanKetikLayar() {
  const p = usePapan();
  const [shiftLayar, setShiftLayar] = useState(false);
  const [shiftFisik, setShiftFisik] = useState(false);
  const [ditekan, setDitekan] = useState<string | null>(null);

  // Sorot tombol yang sedang ditekan di papan fisik, dan tampilkan lapisan Shift saat Shift ditahan.
  useEffect(() => {
    if (!p?.terbuka) return;
    const turun = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftFisik(true); setDitekan(e.code); };
    const naik = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftFisik(false); setDitekan(null); };
    const lepas = () => { setShiftFisik(false); setDitekan(null); };
    window.addEventListener('keydown', turun, true);
    window.addEventListener('keyup', naik, true);
    window.addEventListener('blur', lepas);
    return () => {
      window.removeEventListener('keydown', turun, true);
      window.removeEventListener('keyup', naik, true);
      window.removeEventListener('blur', lepas);
    };
  }, [p?.terbuka]);

  if (!p?.terbuka) return null;
  const shift = shiftLayar || shiftFisik;
  const layout = p.layoutTampil;
  const namaBahasa = DAFTAR_BAHASA.find((b) => b.kode === p.bahasa)?.nama ?? p.bahasa;
  const entriAlt = p.entri.find((e) => e.id === p.idAlternatif);
  const tanpaPapan = !!entriAlt && !entriAlt.muat;

  const tekan = (kode: string) => {
    p.tekan(kode, shift);
    setShiftLayar(false);
  };
  const huruf = (kode: string) => {
    const a = pilihAksi(layout, kode, shift) ?? pilihAksi(PAPAN_BIASA, kode, shift);
    return (
      <button
        key={kode} type="button" tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()} onClick={() => tekan(kode)}
        aria-label={a?.tampil.replace('◌', '') || kode}
        className={cn(kelasKunci, 'flex-1', ditekan === kode && 'border-biru bg-biru-pucat')}
      >{a?.tampil ?? ''}</button>
    );
  };
  const khusus = (kode: string, isi: ReactNode, aria: string, bobot: number, aktifSorot = false) => (
    <button
      key={`${kode}-${aria}`} type="button" tabIndex={-1} aria-label={aria} aria-pressed={kode === 'Shift' ? shiftLayar : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (kode === 'Shift' ? setShiftLayar((s) => !s) : tekan(kode))}
      style={{ flex: bobot }}
      className={cn(kelasKunci, 'bg-muted text-sm', (aktifSorot || ditekan === kode) && 'border-biru bg-biru-pucat')}
    >{isi}</button>
  );

  return (
    <section role="group" aria-label="Papan ketik layar" className="border-t border-garis bg-latar px-3 pt-2 pb-3" lang={atributLang(layout.bahasa)}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" lang="id">
        <label className="flex items-center gap-1.5 text-sm font-semibold">
          Papan alternatif
          <select
            value={p.idAlternatif} onChange={(e) => p.pilihAlternatif(e.target.value)}
            className="h-9 max-w-56 rounded-md border border-input bg-white px-2 text-sm font-normal"
          >
            <optgroup label="Matematika">
              {p.entri.filter((e) => e.kelompok === 'matematika').map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
            </optgroup>
            <optgroup label="Bahasa soal">
              {p.entri.filter((e) => e.kelompok === 'bahasa').map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
            </optgroup>
          </select>
        </label>
        <button
          type="button" onMouseDown={(e) => e.preventDefault()} onClick={p.ganti} aria-pressed={p.aktif} disabled={tanpaPapan}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold disabled:opacity-50',
            p.aktif ? 'border-biru bg-biru text-white' : 'border-input bg-white hover:bg-muted',
          )}
        >
          <ArrowsLeftRight className="size-4" />
          {p.aktif ? `Papan alternatif aktif: ${entriAlt?.nama.split(' (')[0]}` : 'Papan biasa'}
        </button>
        <span className="text-xs text-muted-foreground">
          Ganti dengan <kbd className="rounded border border-garis bg-white px-1">Ctrl</kbd>+<kbd className="rounded border border-garis bg-white px-1">Shift</kbd>+<kbd className="rounded border border-garis bg-white px-1">T</kbd>
          {' '}(atau <kbd className="rounded border border-garis bg-white px-1">Alt</kbd>+<kbd className="rounded border border-garis bg-white px-1">Shift</kbd>+<kbd className="rounded border border-garis bg-white px-1">T</kbd>)
        </span>
        <span className="ml-auto rounded-md bg-biru-muda px-2 py-1 text-xs font-semibold text-biru-tua">Bahasa soal: {namaBahasa}</span>
        <button
          type="button" onClick={() => p.setTerbuka(false)} aria-label="Tutup papan ketik layar"
          className="rounded-md p-1.5 text-tinta hover:bg-muted"
        ><X className="size-4" /></button>
      </div>

      {p.memuat && <p role="status" className="mb-2 text-sm text-muted-foreground" lang="id">Memuat papan ketik...</p>}
      {tanpaPapan && <p className="mb-2 text-sm text-muted-foreground" lang="id">Bahasa soal diatur ke {namaBahasa}. Ketik dengan papan biasa; tidak ada papan khusus yang perlu dinyalakan.</p>}

      {p.pinyin.penampung && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-biru/40 bg-white px-2 py-1.5" lang="zh">
          <span className="rounded bg-biru-muda px-2 py-0.5 font-mono text-sm font-semibold" lang="id">{p.pinyin.penampung}</span>
          {p.kandidat.slice(p.pinyin.halaman * UKURAN_HALAMAN, (p.pinyin.halaman + 1) * UKURAN_HALAMAN).map((c, i) => (
            <button
              key={`${c}-${i}`} type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => p.pilihKandidat(i)}
              className="rounded border border-garis bg-white px-2 py-0.5 text-lg hover:border-biru hover:bg-biru-muda"
            ><span className="mr-1 text-xs text-muted-foreground" lang="id">{i + 1}</span>{c}</button>
          ))}
          {!p.kandidat.length && <span className="text-sm text-muted-foreground" lang="id">Tidak ada huruf Han untuk ejaan ini. Enter menulis hurufnya apa adanya.</span>}
          <span className="ml-auto flex gap-1">
            <button type="button" tabIndex={-1} aria-label="Halaman sebelumnya" onMouseDown={(e) => e.preventDefault()} onClick={() => p.halamanKandidat(-1)} className="rounded p-1 hover:bg-muted"><CaretLeft /></button>
            <button type="button" tabIndex={-1} aria-label="Halaman berikutnya" onMouseDown={(e) => e.preventDefault()} onClick={() => p.halamanKandidat(1)} className="rounded p-1 hover:bg-muted"><CaretRight /></button>
          </span>
        </div>
      )}

      <div className="mx-auto flex max-w-4xl flex-col gap-1">
        <div className="flex gap-1">{BARIS_KODE[0].map(huruf)}{khusus('Backspace', '⌫', 'Hapus mundur', 1.8)}</div>
        <div className="flex gap-1">{BARIS_KODE[1].map(huruf)}</div>
        <div className="flex gap-1">{BARIS_KODE[2].map(huruf)}{khusus('Enter', '↵', 'Baris baru', 2)}</div>
        <div className="flex gap-1">
          {khusus('Shift', <ArrowFatUp weight={shift ? 'fill' : 'regular'} className="size-5" />, 'Shift', 2.2, shift)}
          {BARIS_KODE[3].map(huruf)}
          {khusus('Shift', <ArrowFatUp weight={shift ? 'fill' : 'regular'} className="size-5" />, 'Shift (kanan)', 2.2, shift)}
        </div>
        <div className="flex gap-1">{khusus('Space', <span className="text-xs text-muted-foreground" lang="id">spasi</span>, 'Spasi', 8)}</div>
      </div>
    </section>
  );
}
