import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Kosong } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatTanggal } from '@/lib/format';
import type { TangkapanLayar } from '@/lib/tipe';
import { cn } from '@/lib/utils';

export const urlLayar = (berkas: string) => `/api/admin/berkas/layar/${berkas}`;

/** Garis waktu tangkapan layar satu siswa: gambar besar di atas, deret mini di bawah. */
export function GaleriLayar({ daftar }: { daftar: TangkapanLayar[] }) {
  const [pilih, setPilih] = useState(daftar.length - 1);
  const [hanyaPelanggaran, setHanyaPelanggaran] = useState(false);
  const tampil = hanyaPelanggaran ? daftar.filter((t) => t.pemicu === 'PELANGGARAN') : daftar;

  // Data baru masuk (monitor diperbarui): tetap tampilkan yang terbaru bila sebelumnya di ujung.
  useEffect(() => {
    setPilih((p) => (p < 0 || p >= tampil.length - 2 ? tampil.length - 1 : p));
  }, [tampil.length, hanyaPelanggaran]);

  if (!daftar.length) return <Kosong judul="Belum ada tangkapan layar." />;
  const aktif = tampil[pilih];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{daftar.length} tangkapan · {daftar.filter((t) => t.pemicu === 'PELANGGARAN').length} saat pelanggaran</span>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="size-4 accent-biru" checked={hanyaPelanggaran} onChange={(e) => { setHanyaPelanggaran(e.target.checked); setPilih(-1); }} />
          Hanya saat pelanggaran
        </label>
      </div>
      {aktif ? (
        <figure>
          <a href={urlLayar(aktif.berkas)} target="_blank" rel="noreferrer" title="Buka ukuran penuh">
            <img src={urlLayar(aktif.berkas)} alt={`Tangkapan layar ${formatTanggal(aktif.waktu)}`} className="max-h-[52dvh] w-full rounded-md border border-garis bg-tinta object-contain" />
          </a>
          <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Button size="icon-sm" variant="outline" aria-label="Sebelumnya" disabled={pilih <= 0} onClick={() => setPilih((p) => p - 1)}><CaretLeft /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Berikutnya" disabled={pilih >= tampil.length - 1} onClick={() => setPilih((p) => p + 1)}><CaretRight /></Button>
            <span className="tabular-nums">{formatTanggal(aktif.waktu)}</span>
            {aktif.pemicu === 'PELANGGARAN' ? <Badge variant="merah">Pelanggaran{aktif.keterangan ? `: ${aktif.keterangan}` : ''}</Badge> : <Badge>Berkala</Badge>}
          </figcaption>
        </figure>
      ) : <Kosong judul="Tidak ada tangkapan saat pelanggaran." />}
      <ol className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Daftar tangkapan layar">
        {tampil.map((t, i) => (
          <li key={t.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setPilih(i)}
              aria-label={`Tangkapan ${formatTanggal(t.waktu)}${t.pemicu === 'PELANGGARAN' ? ', pelanggaran' : ''}`}
              aria-current={i === pilih}
              className={cn('block overflow-hidden rounded-sm border-2', i === pilih ? 'border-biru' : t.pemicu === 'PELANGGARAN' ? 'border-merah' : 'border-transparent')}
            >
              <img src={urlLayar(t.berkas)} alt="" loading="lazy" className="h-14 w-24 bg-tinta object-cover" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
