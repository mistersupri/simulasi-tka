import { ArrowClockwise, Camera, Monitor as IkonLayar } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { KepalaHalaman } from '@/components/admin';
import { GaleriLayar, urlLayar } from '@/components/GaleriLayar';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { api, pesanGalat } from '@/lib/api';
import { formatDurasi, formatJam, formatTanggal } from '@/lib/format';
import { LABEL_PELANGGARAN, type Pelanggaran, type TangkapanLayar } from '@/lib/tipe';
import { cn } from '@/lib/utils';

type Sesi = {
  id: string; nama: string; kelas: string; username: string; namaUjian: string; jumlahSoal: number; terjawab: number; ragu: number;
  mulai: string; sisaDetik: number | null; terakhirAktif: string; jumlahPelanggaran: number; maksPelanggaran: number;
  pelanggaranTerakhir: Pelanggaran | null;
  tangkapanTerakhir: TangkapanLayar | null;
};

const urlFoto = (nama: string) => `/api/admin/berkas/pelanggaran/${nama}`;

export default function Monitor() {
  const qc = useQueryClient();
  const [konfirmasi, dialog] = useKonfirmasi();
  const [lihat, setLihat] = useState<Sesi | null>(null);
  const [lihatLayar, setLihatLayar] = useState<Sesi | null>(null);
  const q = useQuery({
    queryKey: ['monitor'],
    queryFn: () => api.get<{ sekarang: string; sesi: Sesi[] }>('/admin/monitor'),
    refetchInterval: 10_000,
  });
  const aksi = useMutation({
    mutationFn: (v: { id: string; aksi: 'KIRIM' | 'RESET' | 'TAMBAH_WAKTU'; menit?: number }) =>
      api.post<{ pesan: string }>(`/admin/sesi/${v.id}/aksi`, v),
    onSuccess: (r) => { toast.success(r.pesan); qc.invalidateQueries({ queryKey: ['monitor'] }); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman judul="Monitor ujian" keterangan="Diperbarui otomatis setiap 10 detik.">
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}><ArrowClockwise /> Perbarui</Button>
      </KepalaHalaman>
      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !q.data.sesi.length ? (
        <Kosong judul="Tidak ada siswa yang sedang mengerjakan ujian.">Siswa akan muncul di sini begitu menekan "Mulai ujian".</Kosong>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data.sesi.map((s) => {
            const diam = Math.round((new Date(q.data.sekarang).getTime() - new Date(s.terakhirAktif).getTime()) / 1000);
            const rawan = s.jumlahPelanggaran > 0;
            return (
              <li key={s.id} className={cn('rounded-lg border bg-white p-4', rawan ? 'border-merah/50' : 'border-garis')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.nama}</p>
                    <p className="truncate text-sm text-muted-foreground">Kelas {s.kelas} · {s.namaUjian}</p>
                  </div>
                  <span className="text-xl font-semibold tabular-nums">{s.sisaDetik === null ? 'Bebas' : formatJam(s.sisaDetik)}</span>
                </div>
                <Progress className="mt-3" value={(s.terjawab / Math.max(1, s.jumlahSoal)) * 100} />
                <p className="mt-1.5 text-sm">{s.terjawab}/{s.jumlahSoal} dijawab{s.ragu ? ` · ${s.ragu} ragu` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={diam > 120 ? 'kuning' : 'hijau'}>Aktif {formatDurasi(diam)} lalu</Badge>
                  {rawan && (
                    <Badge variant="merah">
                      {s.jumlahPelanggaran}{s.maksPelanggaran ? `/${s.maksPelanggaran}` : ''} pelanggaran
                    </Badge>
                  )}
                </div>
                {s.tangkapanTerakhir && (
                  <button type="button" onClick={() => setLihatLayar(s)} className="mt-3 block w-full overflow-hidden rounded-md border border-garis text-left hover:border-biru">
                    <img src={urlLayar(s.tangkapanTerakhir.berkas)} alt={`Layar terakhir ${s.nama}`} className="aspect-video w-full bg-tinta object-cover" />
                    <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                      <IkonLayar className="size-3.5" /> Layar {formatTanggal(s.tangkapanTerakhir.waktu)} · lihat semua
                    </span>
                  </button>
                )}
                {s.pelanggaranTerakhir && (
                  <button type="button" onClick={() => setLihat(s)} className="mt-3 flex w-full items-center gap-3 rounded-md bg-merah-muda p-2 text-left text-sm hover:brightness-95">
                    {s.pelanggaranTerakhir.foto
                      ? <img src={urlFoto(s.pelanggaranTerakhir.foto)} alt="Foto bukti pelanggaran terakhir" className="h-12 w-16 rounded object-cover" />
                      : <Camera className="size-6 shrink-0 text-merah" />}
                    <span><b>Terakhir:</b> {LABEL_PELANGGARAN[s.pelanggaranTerakhir.jenis]}<br /><span className="text-muted-foreground">Lihat semua catatan</span></span>
                  </button>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={s.sisaDetik === null} onClick={() => aksi.mutate({ id: s.id, aksi: 'TAMBAH_WAKTU', menit: 10 })}>Tambah 10 menit</Button>
                  <Button size="sm" variant="hijau" onClick={async () => {
                    if (await konfirmasi({ judul: `Kirim ujian ${s.nama}?`, pesan: 'Ujian langsung dinilai memakai jawaban yang sudah tersimpan.', ya: 'Kirim sekarang' })) aksi.mutate({ id: s.id, aksi: 'KIRIM' });
                  }}>Kirim paksa</Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (await konfirmasi({ judul: `Reset ujian ${s.nama}?`, pesan: 'Jawaban siswa ini dihapus dan ia bisa memulai dari awal.', ya: 'Reset', bahaya: true })) aksi.mutate({ id: s.id, aksi: 'RESET' });
                  }}>Reset</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <DialogPelanggaran sesi={lihat} tutup={() => setLihat(null)} />
      <DialogLayar sesi={lihatLayar} tutup={() => setLihatLayar(null)} />
      {dialog}
    </>
  );
}

export function DaftarPelanggaran({ daftar }: { daftar: Pelanggaran[] }) {
  if (!daftar.length) return <p className="text-sm text-muted-foreground">Tidak ada pelanggaran tercatat.</p>;
  return (
    <ol className="space-y-3">
      {daftar.map((p) => (
        <li key={p.id} className="flex gap-3 rounded-md border border-border p-2">
          {p.foto
            ? <a href={urlFoto(p.foto)} target="_blank" rel="noreferrer"><img src={urlFoto(p.foto)} alt="Foto bukti" className="h-20 w-28 rounded object-cover" /></a>
            : <div className="grid h-20 w-28 shrink-0 place-content-center rounded bg-muted text-xs text-muted-foreground">Tanpa foto</div>}
          <div className="text-sm">
            <p className="font-semibold">{LABEL_PELANGGARAN[p.jenis]}</p>
            <p className="text-muted-foreground">{formatTanggal(p.waktu)}</p>
            {p.detail && <p>{p.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DialogPelanggaran({ sesi, tutup }: { sesi: Sesi | null; tutup: () => void }) {
  const q = useQuery({
    queryKey: ['pelanggaran', sesi?.id],
    queryFn: () => api.get<Pelanggaran[]>(`/admin/sesi/${sesi!.id}/pelanggaran`),
    enabled: !!sesi,
  });
  return (
    <Dialog open={!!sesi} onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Catatan pelanggaran: {sesi?.nama}</DialogTitle></DialogHeader>
        <DialogBody>{q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} /> : <DaftarPelanggaran daftar={q.data} />}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function DialogLayar({ sesi, tutup }: { sesi: Sesi | null; tutup: () => void }) {
  const q = useQuery({
    queryKey: ['layar', sesi?.id],
    queryFn: () => api.get<TangkapanLayar[]>(`/admin/sesi/${sesi!.id}/layar`),
    enabled: !!sesi,
    refetchInterval: 15_000,
  });
  return (
    <Dialog open={!!sesi} onOpenChange={(b) => !b && tutup()}>
      <DialogContent lebar>
        <DialogHeader><DialogTitle>Rekaman layar: {sesi?.nama}</DialogTitle></DialogHeader>
        <DialogBody>{q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} /> : <GaleriLayar daftar={q.data} />}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
