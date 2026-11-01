import { ChartBar, DownloadSimple, FileXls, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BilahPilihan, KepalaHalaman, LABEL_STATUS_HASIL, usePilihan } from '@/components/admin';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, pesanGalat } from '@/lib/api';
import { formatDurasi, formatTanggal } from '@/lib/format';
import { unduhCsv } from '@/lib/tabel';
import type { Hasil, ItemPembahasan, Pelanggaran, Ujian } from '@/lib/tipe';
import { cn } from '@/lib/utils';
import { DaftarPelanggaran } from './Monitor';

const SEMUA = 'semua';

export default function HalamanHasil() {
  const qc = useQueryClient();
  const [konfirmasi, dialog] = useKonfirmasi();
  const hasil = useQuery({ queryKey: ['hasil-admin'], queryFn: () => api.get<{ kkm: number; hasil: Hasil[] }>('/admin/hasil') });
  const ujian = useQuery({ queryKey: ['ujian'], queryFn: () => api.get<{ ujian: Ujian[] }>('/admin/ujian') });
  const [cari, setCari] = useState('');
  const [ujianId, setUjianId] = useState(SEMUA);
  const [kelas, setKelas] = useState(SEMUA);
  const [detail, setDetail] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<string | null>(null);

  const semua = hasil.data?.hasil ?? [];
  const kkm = hasil.data?.kkm ?? 0;
  const daftarKelas = useMemo(() => [...new Set(semua.map((h) => h.kelas))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true })), [semua]);
  const data = useMemo(() => semua.filter((h) =>
    (ujianId === SEMUA || h.ujianId === ujianId) && (kelas === SEMUA || h.kelas === kelas) &&
    (!cari || `${h.namaSiswa} ${h.nisn} ${h.username}`.toLowerCase().includes(cari.toLowerCase())),
  ), [semua, ujianId, kelas, cari]);
  const pilihan = usePilihan(useMemo(() => data.map((h) => h.id), [data]));
  const rata = data.length ? Math.round((data.reduce((s, h) => s + h.nilai, 0) / data.length) * 10) / 10 : null;

  const hapus = useMutation({
    mutationFn: () => api.post<{ pesan: string }>('/admin/hasil/hapus', { ids: pilihan.ids }),
    onSuccess: (r) => { toast.success(r.pesan); pilihan.kosongkan(); qc.invalidateQueries({ queryKey: ['hasil-admin'] }); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman judul="Hasil & analisis" keterangan={rata === null ? undefined : `${data.length} hasil · rata-rata ${rata}`}>
        <Button variant="outline" disabled={!data.length} onClick={() => unduhCsv('hasil-ujian.csv', [
          ['Tanggal', 'NISN', 'Nama', 'Kelas', 'Ujian', 'Nilai', 'Benar', 'Salah', 'Kosong', 'Durasi (detik)', 'Pelanggaran', 'Status'],
          ...data.map((h) => [formatTanggal(h.tanggal), h.nisn, h.namaSiswa, h.kelas, h.namaUjian, h.nilai, h.benar, h.salah - h.kosong, h.kosong, h.durasiDetik, h.jumlahPelanggaran, LABEL_STATUS_HASIL[h.status].label]),
        ])}><DownloadSimple weight="bold" /> CSV</Button>
        <a className={buttonVariants()} href={`/api/admin/ekspor.xlsx${ujianId !== SEMUA ? `?ujianId=${ujianId}` : ''}`} download>
          <FileXls weight="bold" /> Unduh Excel
        </a>
      </KepalaHalaman>

      <div className="mb-4 grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr_auto]">
        <Input type="search" placeholder="Cari nama atau NISN..." aria-label="Cari siswa" value={cari} onChange={(e) => setCari(e.target.value)} />
        <Select value={ujianId} onValueChange={setUjianId}>
          <SelectTrigger aria-label="Saring ujian"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={SEMUA}>Semua ujian</SelectItem>{ujian.data?.ujian.map((u) => <SelectItem key={u.id} value={u.id}>{u.nama}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={kelas} onValueChange={setKelas}>
          <SelectTrigger aria-label="Saring kelas"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={SEMUA}>Semua kelas</SelectItem>{daftarKelas.map((k) => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" disabled={ujianId === SEMUA} onClick={() => setAnalisis(ujianId)} title={ujianId === SEMUA ? 'Pilih satu ujian dulu' : undefined}>
          <ChartBar weight="bold" /> Analisis butir
        </Button>
      </div>

      <BilahPilihan jumlah={pilihan.dipilih.size}>
        <Button size="sm" variant="destructive" onClick={async () => {
          if (await konfirmasi({ judul: `Hapus ${pilihan.dipilih.size} hasil?`, pesan: 'Siswa tersebut dapat mengerjakan ujiannya lagi.', ya: 'Hapus', bahaya: true })) hapus.mutate();
        }}><Trash weight="bold" /> Hapus agar bisa mengulang</Button>
      </BilahPilihan>

      {hasil.isPending ? <Memuat /> : hasil.error ? <Galat galat={hasil.error} ulangi={() => hasil.refetch()} /> : !data.length ? (
        <Kosong judul={semua.length ? 'Tidak ada hasil yang cocok dengan saringan.' : 'Belum ada hasil ujian.'} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Pilih semua hasil" checked={pilihan.semua} onCheckedChange={(v) => pilihan.ubahSemua(!!v)} /></TableHead>
              <TableHead>Siswa</TableHead><TableHead>Ujian</TableHead><TableHead>Nilai</TableHead><TableHead>B / S / K</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((h) => {
              const st = LABEL_STATUS_HASIL[h.status];
              return (
                <TableRow key={h.id} data-state={pilihan.dipilih.has(h.id) ? 'selected' : undefined}>
                  <TableCell><Checkbox aria-label={`Pilih hasil ${h.namaSiswa}`} checked={pilihan.dipilih.has(h.id)} onCheckedChange={(v) => pilihan.ubah(h.id, !!v)} /></TableCell>
                  <TableCell><b>{h.namaSiswa}</b><div className="text-xs text-muted-foreground">Kelas {h.kelas} · {formatTanggal(h.tanggal)}</div></TableCell>
                  <TableCell>{h.namaUjian}</TableCell>
                  <TableCell>
                    <span className={cn('text-xl font-extrabold tabular-nums', kkm > 0 && (h.nilai >= kkm ? 'text-daun' : 'text-bata'))}>{h.nilai}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{h.benar} / {h.salah - h.kosong} / {h.kosong}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={st.varian}>{st.label}</Badge>
                      {h.jumlahPelanggaran > 0 && <Badge variant="bata">{h.jumlahPelanggaran} pelanggaran</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setDetail(h.id)}>Detail</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <DialogDetail id={detail} kkm={kkm} tutup={() => setDetail(null)} />
      <DialogAnalisis ujianId={analisis} tutup={() => setAnalisis(null)} />
      {dialog}
    </>
  );
}

function DialogDetail({ id, kkm, tutup }: { id: string | null; kkm: number; tutup: () => void }) {
  const q = useQuery({
    queryKey: ['hasil-detail', id],
    queryFn: () => api.get<{ hasil: Hasil; soal: ItemPembahasan[]; pelanggaran: Pelanggaran[] }>(`/admin/hasil/${id}`),
    enabled: !!id,
  });
  return (
    <Dialog open={!!id} onOpenChange={(b) => !b && tutup()}>
      <DialogContent lebar>
        <DialogHeader><DialogTitle>{q.data ? `${q.data.hasil.namaSiswa} · ${q.data.hasil.namaUjian}` : 'Detail hasil'}</DialogTitle></DialogHeader>
        <DialogBody>
          {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} /> : (
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <section>
                <p className="text-sm text-muted-foreground">
                  Nilai <b className={cn('text-lg', kkm > 0 && (q.data.hasil.nilai >= kkm ? 'text-daun' : 'text-bata'))}>{q.data.hasil.nilai}</b>
                  {' '}· waktu {formatDurasi(q.data.hasil.durasiDetik)}
                </p>
                <Table className="mt-3">
                  <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Soal</TableHead><TableHead>Jawaban</TableHead><TableHead>Kunci</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {q.data.soal.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.nomor}</TableCell>
                        <TableCell><b>{s.id}</b><p className="line-clamp-1 text-xs text-muted-foreground">{s.pertanyaan}</p></TableCell>
                        <TableCell><Badge variant={s.benar ? 'daun' : s.jawaban ? 'bata' : 'default'}>{s.jawaban || 'Kosong'}</Badge></TableCell>
                        <TableCell className="font-bold">{s.kunci}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
              <section>
                <h3 className="text-base">Catatan pengawasan</h3>
                <div className="mt-3"><DaftarPelanggaran daftar={q.data.pelanggaran} /></div>
              </section>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

type Analisis = {
  jumlahPeserta: number; rataRata: number; tertinggi: number; terendah: number; kkm: number; tuntas: number | null;
  sebaranNilai: number[];
  butir: { id: string; pertanyaan: string; kunci: string; peserta: number; benar: number; kosong: number; sebaran: Record<string, number>; p: number; kategori: string }[];
};

export function DialogAnalisis({ ujianId, tutup }: { ujianId: string | null; tutup: () => void }) {
  const q = useQuery({
    queryKey: ['analisis', ujianId],
    queryFn: () => api.get<{ ujian: Ujian | null; analisis: Analisis }>(`/admin/analisis/${ujianId}`),
    enabled: !!ujianId,
  });
  const a = q.data?.analisis;
  const maks = Math.max(1, ...(a?.sebaranNilai ?? []));
  return (
    <Dialog open={!!ujianId} onOpenChange={(b) => !b && tutup()}>
      <DialogContent lebar>
        <DialogHeader><DialogTitle>Analisis: {q.data?.ujian?.nama ?? 'ujian'}</DialogTitle></DialogHeader>
        <DialogBody>
          {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} /> : !a?.jumlahPeserta ? <Kosong judul="Belum ada siswa yang mengerjakan ujian ini." /> : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[['Peserta', a.jumlahPeserta], ['Rata-rata', a.rataRata], ['Tertinggi', a.tertinggi], ['Terendah', a.terendah],
                  [`Tuntas (KKM ${a.kkm})`, a.tuntas === null ? '-' : `${a.tuntas}/${a.jumlahPeserta}`]].map(([l, v]) => (
                  <div key={l as string} className="rounded-md bg-muted px-3 py-2"><dt className="text-xs font-bold text-muted-foreground">{l}</dt><dd className="text-2xl font-extrabold tabular-nums">{v}</dd></div>
                ))}
              </dl>
              <h3 className="mt-6 text-base">Sebaran nilai</h3>
              <div className="mt-3 flex h-36 items-end gap-1.5" role="img" aria-label="Grafik sebaran nilai per rentang 10">
                {a.sebaranNilai.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1 text-[11px] font-bold">
                    <span>{n || ''}</span>
                    <span className="w-full rounded-t-sm bg-jeruk" style={{ height: `${(n / maks) * 100}%`, minHeight: n ? 4 : 1 }} />
                    <span className="text-muted-foreground">{i * 10}</span>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 text-base">Analisis butir soal</h3>
              <p className="text-sm text-muted-foreground">Benar ≥ 70%: mudah, 30 sampai 69%: sedang, di bawah 30%: sukar. Pengecoh yang tidak pernah dipilih perlu ditinjau ulang.</p>
              <Table className="mt-3">
                <TableHeader><TableRow><TableHead>Soal</TableHead><TableHead>Kunci</TableHead><TableHead>% benar</TableHead><TableHead>Kategori</TableHead><TableHead>A / B / C / D</TableHead></TableRow></TableHeader>
                <TableBody>
                  {a.butir.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell><b>{b.id}</b><p className="line-clamp-1 max-w-72 text-xs text-muted-foreground">{b.pertanyaan}</p></TableCell>
                      <TableCell className="font-bold">{b.kunci}</TableCell>
                      <TableCell className="tabular-nums"><b>{b.p}%</b> <span className="text-xs text-muted-foreground">({b.benar}/{b.peserta})</span></TableCell>
                      <TableCell><Badge variant={b.kategori === 'Mudah' ? 'daun' : b.kategori === 'Sedang' ? 'matahari' : 'bata'}>{b.kategori}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {['A', 'B', 'C', 'D'].map((h, i) => (
                          <span key={h}>{i > 0 && ' / '}<span className={b.kunci.includes(h) ? 'font-extrabold text-daun' : ''}>{b.sebaran[h]}</span></span>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
