import { DownloadSimple, Eye, Image as IkonGambar, PencilSimple, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BilahPilihan, DialogDitolak, DialogImpor, KepalaHalaman, usePilihan, type Ditolak,
} from '@/components/admin';
import { GambarSoal } from '@/components/GambarSoal';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, pesanGalat } from '@/lib/api';
import { perkecilGambar } from '@/lib/gambar';
import { unduhCsv, type KolomImpor } from '@/lib/tabel';
import type { Soal } from '@/lib/tipe';
import { cn } from '@/lib/utils';

const HURUF = ['A', 'B', 'C', 'D'];
const SEMUA = 'semua';

const KOLOM_IMPOR: KolomImpor[] = [
  { kunci: 'id', header: ['ID_SOAL', 'ID'] },
  { kunci: 'mataPelajaran', header: ['MATA_PELAJARAN', 'MAPEL'] },
  { kunci: 'kelas', header: ['KELAS'] },
  { kunci: 'pertanyaan', header: ['PERTANYAAN', 'SOAL'] },
  { kunci: 'opsiA', header: ['OPSI_A', 'A'] },
  { kunci: 'opsiB', header: ['OPSI_B', 'B'] },
  { kunci: 'opsiC', header: ['OPSI_C', 'C'] },
  { kunci: 'opsiD', header: ['OPSI_D', 'D'] },
  { kunci: 'kunci', header: ['KUNCI_JAWABAN', 'KUNCI'] },
  { kunci: 'skor', header: ['SKOR', 'BOBOT'] },
  { kunci: 'tipe', header: ['TIPE_SOAL', 'TIPE'] },
  { kunci: 'pembahasan', header: ['PEMBAHASAN'] },
];

export default function HalamanSoal() {
  const qc = useQueryClient();
  const [konfirmasi, dialogKonfirmasi] = useKonfirmasi();
  const q = useQuery({ queryKey: ['soal'], queryFn: () => api.get<Soal[]>('/admin/soal') });
  const [cari, setCari] = useState('');
  const [mapel, setMapel] = useState(SEMUA);
  const [kelas, setKelas] = useState(SEMUA);
  const [form, setForm] = useState<Soal | 'baru' | null>(null);
  const [pratinjau, setPratinjau] = useState<Soal | null>(null);
  const [impor, setImpor] = useState(false);
  const [ditolak, setDitolak] = useState<Ditolak[] | null>(null);

  const semua = q.data ?? [];
  const daftarMapel = useMemo(() => [...new Set(semua.map((s) => s.mataPelajaran))].sort(), [semua]);
  const daftarKelas = useMemo(() => [...new Set(semua.map((s) => s.kelas))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true })), [semua]);
  const data = useMemo(() => semua.filter((s) =>
    (mapel === SEMUA || s.mataPelajaran === mapel) && (kelas === SEMUA || s.kelas === kelas) &&
    (!cari || `${s.id} ${s.pertanyaan} ${s.opsi.join(' ')}`.toLowerCase().includes(cari.toLowerCase())),
  ), [semua, mapel, kelas, cari]);
  const pilihan = usePilihan(useMemo(() => data.map((s) => s.id), [data]));

  const massal = useMutation({
    mutationFn: (v: { aksi: 'hapus' | 'aktif' | 'nonaktif' }) => v.aksi === 'hapus'
      ? api.post<{ pesan: string }>('/admin/soal/hapus', { ids: pilihan.ids })
      : api.post<{ pesan: string }>('/admin/soal/status', { ids: pilihan.ids, aktif: v.aksi === 'aktif' }),
    onSuccess: (r) => { toast.success(r.pesan); pilihan.kosongkan(); qc.invalidateQueries({ queryKey: ['soal'] }); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman judul="Bank soal" keterangan={q.data ? `${semua.length} soal tersimpan` : undefined}>
        <Button variant="outline" disabled={!semua.length} onClick={() => unduhCsv('bank-soal.csv', [
          KOLOM_IMPOR.map((k) => k.header[0]),
          ...semua.map((s) => [s.id, s.mataPelajaran, s.kelas, s.pertanyaan, ...s.opsi, s.kunci, s.skor, s.tipe, s.pembahasan]),
        ])}><DownloadSimple weight="bold" /> Unduh</Button>
        <Button variant="outline" onClick={() => setImpor(true)}><UploadSimple weight="bold" /> Impor</Button>
        <Button onClick={() => setForm('baru')}><Plus weight="bold" /> Tambah soal</Button>
      </KepalaHalaman>

      <div className="mb-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Input type="search" placeholder="Cari ID atau isi soal..." aria-label="Cari soal" value={cari} onChange={(e) => setCari(e.target.value)} />
        <Select value={mapel} onValueChange={setMapel}>
          <SelectTrigger aria-label="Saring mata pelajaran"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={SEMUA}>Semua mapel</SelectItem>{daftarMapel.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={kelas} onValueChange={setKelas}>
          <SelectTrigger aria-label="Saring kelas"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={SEMUA}>Semua kelas</SelectItem>{daftarKelas.map((k) => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <BilahPilihan jumlah={pilihan.dipilih.size}>
        <Button size="sm" variant="outline" onClick={() => massal.mutate({ aksi: 'aktif' })}>Aktifkan</Button>
        <Button size="sm" variant="outline" onClick={() => massal.mutate({ aksi: 'nonaktif' })}>Nonaktifkan</Button>
        <Button size="sm" variant="destructive" onClick={async () => {
          if (await konfirmasi({ judul: `Hapus ${pilihan.dipilih.size} soal?`, pesan: 'Soal dan gambarnya dihapus permanen. Hasil ujian yang sudah ada tetap tersimpan.', ya: 'Hapus', bahaya: true })) massal.mutate({ aksi: 'hapus' });
        }}><Trash weight="bold" /> Hapus</Button>
      </BilahPilihan>

      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !data.length ? (
        <Kosong judul={semua.length ? 'Tidak ada soal yang cocok dengan saringan.' : 'Bank soal masih kosong.'}>
          {!semua.length && 'Tambahkan soal satu per satu, atau impor dari Excel.'}
        </Kosong>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Pilih semua soal" checked={pilihan.semua} onCheckedChange={(v) => pilihan.ubahSemua(!!v)} /></TableHead>
              <TableHead>ID</TableHead><TableHead>Pertanyaan</TableHead><TableHead>Kunci</TableHead><TableHead>Skor</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => (
              <TableRow key={s.id} data-state={pilihan.dipilih.has(s.id) ? 'selected' : undefined}>
                <TableCell><Checkbox aria-label={`Pilih ${s.id}`} checked={pilihan.dipilih.has(s.id)} onCheckedChange={(v) => pilihan.ubah(s.id, !!v)} /></TableCell>
                <TableCell><b>{s.id}</b><div className="text-xs text-muted-foreground">{s.mataPelajaran} · kls {s.kelas}</div></TableCell>
                <TableCell className="max-w-md">
                  <p className="line-clamp-2">{s.gambar && <IkonGambar weight="bold" className="mr-1 inline size-4" aria-label="Bergambar" />}{s.pertanyaan}</p>
                  {s.tipe === 'PGK' && <Badge variant="jeruk" className="mt-1">PG kompleks</Badge>}
                </TableCell>
                <TableCell className="font-extrabold">{s.kunci}</TableCell>
                <TableCell>{s.skor}</TableCell>
                <TableCell><Badge variant={s.aktif ? 'daun' : 'default'}>{s.aktif ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Pratinjau ${s.id}`} onClick={() => setPratinjau(s)}><Eye weight="bold" /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${s.id}`} onClick={() => setForm(s)}><PencilSimple weight="bold" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {form && <FormSoal soal={form === 'baru' ? null : form} daftarMapel={daftarMapel} tutup={() => setForm(null)} />}
      <DialogPratinjau soal={pratinjau} tutup={() => setPratinjau(null)} />
      <DialogImpor
        buka={impor} setBuka={setImpor} judul="Impor soal" kolom={KOLOM_IMPOR}
        petunjuk="Salin baris soal dari Excel atau Google Sheets (termasuk lembar BANK_SOAL versi lama), lalu tempel di bawah."
        template={[KOLOM_IMPOR.map((k) => k.header[0]),
          ['', 'Matematika', '6', 'Hasil dari 125 + 75 adalah ....', '180', '190', '200', '210', 'C', '1', 'PG', '125 + 75 = 200'],
          ['', 'Matematika', '6', 'Manakah yang merupakan bilangan prima?', '2', '4', '7', '9', 'A,C', '2', 'PGK', '']]}
        kirim={async (baris, progres) => {
          let jumlah = 0;
          const tolak: Ditolak[] = [];
          for (let i = 0; i < baris.length; i += 200) {
            const r = await api.post<{ jumlah: number; ditolak: Ditolak[] }>('/admin/soal/impor', { baris: baris.slice(i, i + 200) })
              .catch((e) => { toast.error(pesanGalat(e)); throw e; });
            jumlah += r.jumlah;
            tolak.push(...r.ditolak);
            progres(Math.min(baris.length, i + 200));
          }
          toast.success(`${jumlah} soal diimpor.`);
          if (tolak.length) setDitolak(tolak);
          qc.invalidateQueries({ queryKey: ['soal'] });
        }}
      />
      <DialogDitolak ditolak={ditolak} tutup={() => setDitolak(null)} />
      {dialogKonfirmasi}
    </>
  );
}

function FormSoal({ soal, daftarMapel, tutup }: { soal: Soal | null; daftarMapel: string[]; tutup: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState(() => ({
    id: soal?.id ?? '',
    mataPelajaran: soal?.mataPelajaran ?? daftarMapel[0] ?? 'Matematika',
    kelas: soal?.kelas ?? '6',
    tipe: soal?.tipe ?? ('PG' as 'PG' | 'PGK'),
    pertanyaan: soal?.pertanyaan ?? '',
    opsi: soal?.opsi ?? ['', '', '', ''],
    kunci: soal?.kunci.split(',').filter(Boolean) ?? [],
    skor: String(soal?.skor ?? 1),
    pembahasan: soal?.pembahasan ?? '',
    aktif: soal?.aktif ?? true,
    gambar: soal?.gambar ?? null,
  }));
  const [galat, setGalat] = useState('');
  const [mengunggah, setMengunggah] = useState(false);
  const ubah = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const simpan = useMutation({
    mutationFn: () => {
      const body = { ...d, kunci: d.kunci.join(','), skor: Number(d.skor) };
      return soal ? api.put<{ pesan: string }>(`/admin/soal/${soal.id}`, body) : api.post<{ pesan: string }>('/admin/soal', body);
    },
    onSuccess: (r) => { toast.success(r.pesan); qc.invalidateQueries({ queryKey: ['soal'] }); tutup(); },
    onError: (e) => setGalat(pesanGalat(e)),
  });

  const unggahGambar = async (file?: File) => {
    if (!file) return;
    setMengunggah(true);
    try {
      const form = new FormData();
      form.append('gambar', await perkecilGambar(file), file.name);
      ubah('gambar', (await api.post<{ nama: string }>('/admin/soal/gambar', form)).nama);
    } catch (e) {
      toast.error(pesanGalat(e));
    } finally {
      setMengunggah(false);
    }
  };

  const pilihKunci = (h: string) => {
    if (d.tipe === 'PG') return ubah('kunci', [h]);
    ubah('kunci', d.kunci.includes(h) ? d.kunci.filter((k) => k !== h) : [...d.kunci, h].sort());
  };

  return (
    <Dialog open onOpenChange={(b) => !b && tutup()}>
      <DialogContent lebar>
        <form onSubmit={(e) => { e.preventDefault(); setGalat(''); simpan.mutate(); }} className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>{soal ? `Ubah soal ${soal.id}` : 'Tambah soal'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="s-id">ID soal</Label><Input id="s-id" value={d.id} disabled={!!soal} placeholder="Otomatis" onChange={(e) => ubah('id', e.target.value.toUpperCase())} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="s-mapel">Mata pelajaran</Label>
                <Input id="s-mapel" list="daftar-mapel" value={d.mataPelajaran} onChange={(e) => ubah('mataPelajaran', e.target.value)} required />
                <datalist id="daftar-mapel">{[...new Set([...daftarMapel, 'Matematika', 'Bahasa Indonesia'])].map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <div className="space-y-1.5"><Label htmlFor="s-kelas">Kelas</Label><Input id="s-kelas" value={d.kelas} onChange={(e) => ubah('kelas', e.target.value)} required /></div>
              <div className="space-y-1.5">
                <Label>Tipe soal</Label>
                <Select value={d.tipe} onValueChange={(v) => setD((x) => ({ ...x, tipe: v as 'PG' | 'PGK', kunci: v === 'PG' ? x.kunci.slice(0, 1) : x.kunci }))}>
                  <SelectTrigger aria-label="Tipe soal"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PG">Pilihan ganda</SelectItem><SelectItem value="PGK">Pilihan ganda kompleks</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5"><Label htmlFor="s-tanya">Pertanyaan</Label><Textarea id="s-tanya" rows={4} value={d.pertanyaan} onChange={(e) => ubah('pertanyaan', e.target.value)} required /></div>

            <div className="space-y-1.5">
              <span className="text-sm font-bold">Gambar (opsional)</span>
              {d.gambar && <GambarSoal nama={d.gambar} className="max-h-48" />}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border-2 border-tinta bg-white px-3 text-[13px] font-bold hover:bg-muted focus-within:outline-3 focus-within:outline-jeruk">
                  <UploadSimple weight="bold" className="size-4" /> {mengunggah ? 'Mengunggah...' : d.gambar ? 'Ganti gambar' : 'Pilih gambar'}
                  <input type="file" accept="image/*" className="sr-only" disabled={mengunggah} onChange={(e) => unggahGambar(e.target.files?.[0])} />
                </label>
                {d.gambar && <Button type="button" size="sm" variant="ghost" onClick={() => ubah('gambar', null)}>Hapus gambar</Button>}
                <span className="text-xs text-muted-foreground">Gambar besar otomatis diperkecil.</span>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-bold">
                Pilihan jawaban <span className="font-semibold text-muted-foreground">({d.tipe === 'PGK' ? 'tandai SEMUA jawaban benar' : 'tandai satu jawaban benar'})</span>
              </legend>
              {HURUF.map((h, i) => (
                <div key={h} className="flex items-center gap-2">
                  <button
                    type="button" onClick={() => pilihKunci(h)} aria-pressed={d.kunci.includes(h)} aria-label={`Jadikan ${h} kunci jawaban`}
                    className={cn('grid size-11 shrink-0 place-content-center border-2 font-extrabold', d.tipe === 'PGK' ? 'rounded-md' : 'rounded-full',
                      d.kunci.includes(h) ? 'border-daun bg-daun text-white' : 'border-tinta bg-white')}
                  >{h}</button>
                  <Input aria-label={`Opsi ${h}`} value={d.opsi[i]} onChange={(e) => ubah('opsi', d.opsi.map((o, j) => (j === i ? e.target.value : o)))} required />
                </div>
              ))}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <div className="space-y-1.5"><Label htmlFor="s-skor">Skor</Label><Input id="s-skor" type="number" min="0.5" step="0.5" value={d.skor} onChange={(e) => ubah('skor', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="s-bahas">Pembahasan (opsional)</Label><Textarea id="s-bahas" rows={2} value={d.pembahasan} onChange={(e) => ubah('pembahasan', e.target.value)} placeholder="Tampil ke siswa bila ujian mengizinkan pembahasan" /></div>
            </div>
            <Label className="font-semibold"><Switch checked={d.aktif} onCheckedChange={(v) => ubah('aktif', v)} /> Soal aktif (bisa muncul di ujian)</Label>
            {galat && <p role="alert" className="rounded-md bg-bata-muda px-3 py-2 text-sm font-bold text-bata">{galat}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={tutup}>Batal</Button>
            <Button type="submit" disabled={simpan.isPending || mengunggah}>{simpan.isPending ? 'Menyimpan...' : 'Simpan soal'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogPratinjau({ soal: s, tutup }: { soal: Soal | null; tutup: () => void }) {
  return (
    <Dialog open={!!s} onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        {s && (
          <>
            <DialogHeader><DialogTitle>Pratinjau {s.id}</DialogTitle></DialogHeader>
            <DialogBody>
              <p className="text-sm text-muted-foreground">{s.mataPelajaran} · Kelas {s.kelas} · Skor {s.skor}</p>
              <p className="mt-3 text-lg whitespace-pre-line">{s.pertanyaan}</p>
              <GambarSoal nama={s.gambar} />
              <ul className="mt-3 space-y-2">
                {s.opsi.map((o, i) => (
                  <li key={i} className={cn('rounded-md border-2 px-3 py-2', s.kunci.includes(HURUF[i]) ? 'border-daun bg-daun-muda font-bold' : 'border-border')}>
                    {HURUF[i]}. {o}
                  </li>
                ))}
              </ul>
              {s.pembahasan && <p className="mt-3 rounded-md bg-matahari-muda px-3 py-2"><b>Pembahasan:</b> {s.pembahasan}</p>}
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
