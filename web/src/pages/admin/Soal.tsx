import {
  BookOpen, CaretRight, DownloadSimple, Eye, Image as IkonGambar, PencilSimple, Plus, Trash, UploadSimple,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  BilahPilihan, DialogDitolak, DialogImpor, KepalaHalaman, paramSekolah, useDaftarSekolah, usePilihan, useStaf, type Ditolak,
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
const urutKelas = (a: string, b: string) => a.localeCompare(b, 'id', { numeric: true });

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

const INSTANSI = 'instansi';

export default function HalamanSoal() {
  const qc = useQueryClient();
  const staf = useStaf();
  const admin = staf.peran === 'ADMIN';
  const daftarSekolah = useDaftarSekolah();
  // Admin mengelola bank instansi (bawaan) dan bisa membuka bank soal sekolah; operator selalu bank sekolahnya.
  const [pemilik, setPemilikState] = useState(INSTANSI);
  const sekolahId = admin && pemilik !== INSTANSI ? pemilik : null;
  const [konfirmasi, dialogKonfirmasi] = useKonfirmasi();
  const q = useQuery({ queryKey: ['soal', pemilik], queryFn: () => api.get<Soal[]>(`/admin/soal${paramSekolah(sekolahId ?? '')}`) });
  const [cari, setCari] = useState('');
  // Alur: pilih kelas, lalu mata pelajaran, lalu daftar soal. Disimpan di URL agar tombol Kembali browser berfungsi.
  const [param, setParam] = useSearchParams();
  const kelas = param.get('kelas');
  const mapel = kelas ? param.get('mapel') : null;
  const buka = (k: string | null, m: string | null = null) => {
    const baru = new URLSearchParams();
    if (k) baru.set('kelas', k);
    if (k && m) baru.set('mapel', m);
    setParam(baru);
    setCari('');
  };
  const setPemilik = (v: string) => { setPemilikState(v); buka(null); };
  const [form, setForm] = useState<Soal | 'baru' | null>(null);
  const [pratinjau, setPratinjau] = useState<Soal | null>(null);
  const [impor, setImpor] = useState(false);
  const [ditolak, setDitolak] = useState<Ditolak[] | null>(null);

  const semua = q.data ?? [];
  const daftarMapel = useMemo(() => [...new Set(semua.map((s) => s.mataPelajaran))].sort(), [semua]);
  const ringkasKelas = useMemo(() => kelompokkan(semua, (s) => s.kelas).sort((a, b) => urutKelas(a.kunci, b.kunci)), [semua]);
  const ringkasMapel = useMemo(
    () => kelompokkan(semua.filter((s) => s.kelas === kelas), (s) => s.mataPelajaran).sort((a, b) => a.kunci.localeCompare(b.kunci, 'id')),
    [semua, kelas],
  );
  // Daftar soal tampil di tingkat mapel, atau di tingkat mana pun saat mencari.
  const tampilSoal = !!mapel || !!cari;
  const data = useMemo(() => semua.filter((s) =>
    (!kelas || s.kelas === kelas) && (!mapel || s.mataPelajaran === mapel) &&
    (!cari || `${s.id} ${s.pertanyaan} ${s.opsi.join(' ')}`.toLowerCase().includes(cari.toLowerCase())),
  ), [semua, mapel, kelas, cari]);
  const pilihan = usePilihan(useMemo(() => (tampilSoal ? data.map((s) => s.id) : []), [data, tampilSoal]));

  const massal = useMutation({
    mutationFn: (v: { aksi: 'hapus' | 'aktif' | 'nonaktif' }) => v.aksi === 'hapus'
      ? api.post<{ pesan: string }>('/admin/soal/hapus', { ids: pilihan.ids })
      : api.post<{ pesan: string }>('/admin/soal/status', { ids: pilihan.ids, aktif: v.aksi === 'aktif' }),
    onSuccess: (r) => { toast.success(r.pesan); pilihan.kosongkan(); qc.invalidateQueries({ queryKey: ['soal'] }); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman
        judul={admin ? 'Bank soal' : 'Bank soal sekolah'}
        keterangan={<>
          {q.data && `${semua.length} soal tersimpan. `}
          {admin
            ? (sekolahId ? 'Soal milik sekolah ini hanya dipakai ujian internal sekolahnya.' : 'Bank soal instansi dipakai ujian bersama dan tidak terlihat oleh sekolah.')
            : 'Soal untuk ujian internal sekolah Anda. Soal ujian bersama dari Suku Dinas tidak ditampilkan di sini.'}
        </>}
      >
        <Button variant="outline" disabled={!semua.length} onClick={() => unduhCsv('bank-soal.csv', [
          KOLOM_IMPOR.map((k) => k.header[0]),
          ...semua.map((s) => [s.id, s.mataPelajaran, s.kelas, s.pertanyaan, ...s.opsi, s.kunci, s.skor, s.tipe, s.pembahasan]),
        ])}><DownloadSimple /> Unduh</Button>
        <Button variant="outline" onClick={() => setImpor(true)}><UploadSimple /> Impor</Button>
        <Button onClick={() => setForm('baru')}><Plus /> Tambah soal</Button>
      </KepalaHalaman>

      {admin && (
        <div className="mb-2 max-w-sm">
          <Select value={pemilik} onValueChange={setPemilik}>
            <SelectTrigger aria-label="Pemilik bank soal"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={INSTANSI}>Bank soal instansi</SelectItem>
              {daftarSekolah.data?.map((x) => <SelectItem key={x.id} value={x.id}>Soal sekolah: {x.nama}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <nav aria-label="Posisi di bank soal" className="mb-4 flex flex-wrap items-center gap-1 text-[15px]">
        <TombolJejak aktif={!kelas} onClick={() => buka(null)}>Semua kelas</TombolJejak>
        {kelas && <><CaretRight className="size-4 text-muted-foreground" /><TombolJejak aktif={!mapel} onClick={() => buka(kelas)}>Kelas {kelas}</TombolJejak></>}
        {mapel && <><CaretRight className="size-4 text-muted-foreground" /><TombolJejak aktif>{mapel}</TombolJejak></>}
      </nav>
      <Input
        type="search" className="mb-4 max-w-md" aria-label="Cari soal" value={cari} onChange={(e) => setCari(e.target.value)}
        placeholder={mapel ? `Cari di ${mapel} kelas ${kelas}...` : kelas ? `Cari di semua soal kelas ${kelas}...` : 'Cari ID atau isi soal di semua kelas...'}
      />

      <BilahPilihan jumlah={pilihan.dipilih.size}>
        <Button size="sm" variant="outline" onClick={() => massal.mutate({ aksi: 'aktif' })}>Aktifkan</Button>
        <Button size="sm" variant="outline" onClick={() => massal.mutate({ aksi: 'nonaktif' })}>Nonaktifkan</Button>
        <Button size="sm" variant="destructive" onClick={async () => {
          if (await konfirmasi({ judul: `Hapus ${pilihan.dipilih.size} soal?`, pesan: 'Soal dan gambarnya dihapus permanen. Hasil ujian yang sudah ada tetap tersimpan.', ya: 'Hapus', bahaya: true })) massal.mutate({ aksi: 'hapus' });
        }}><Trash /> Hapus</Button>
      </BilahPilihan>

      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !semua.length ? (
        <Kosong judul="Bank soal masih kosong.">Tambahkan soal satu per satu, atau impor dari Excel.</Kosong>
      ) : !tampilSoal && !kelas ? (
        <DaftarKelompok
          judul="Pilih kelas" kelompok={ringkasKelas} label={(k) => `Kelas ${k}`}
          rincian={(g) => `${g.jumlahMapel} mata pelajaran`} pilih={(k) => buka(k)}
        />
      ) : !tampilSoal ? (
        ringkasMapel.length ? (
          <DaftarKelompok
            judul={`Mata pelajaran kelas ${kelas}`} kelompok={ringkasMapel} label={(m) => m}
            rincian={(g) => [g.pgk && `${g.pgk} PG kompleks`, g.bergambar && `${g.bergambar} bergambar`].filter(Boolean).join(' · ')} pilih={(m) => buka(kelas, m)}
          />
        ) : <Kosong judul={`Belum ada soal kelas ${kelas}.`}>Tambahkan soal atau kembali ke daftar kelas.</Kosong>
      ) : !data.length ? (
        <Kosong judul={cari ? 'Tidak ada soal yang cocok dengan pencarian.' : `Belum ada soal ${mapel} kelas ${kelas}.`} />
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
                <TableCell><b>{s.id}</b>{!mapel && <div className="text-xs text-muted-foreground">{s.mataPelajaran} · kls {s.kelas}</div>}</TableCell>
                <TableCell className="max-w-md">
                  <p className="line-clamp-2">{s.gambar && <IkonGambar className="mr-1 inline size-4" aria-label="Bergambar" />}{s.pertanyaan}</p>
                  {s.tipe === 'PGK' && <Badge variant="biru" className="mt-1">PG kompleks</Badge>}
                </TableCell>
                <TableCell className="font-semibold">{s.kunci}</TableCell>
                <TableCell>{s.skor}</TableCell>
                <TableCell><Badge variant={s.aktif ? 'hijau' : 'default'}>{s.aktif ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Pratinjau ${s.id}`} onClick={() => setPratinjau(s)}><Eye /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${s.id}`} onClick={() => setForm(s)}><PencilSimple /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {form && (
        <FormSoal
          soal={form === 'baru' ? null : form} sekolahId={sekolahId} daftarMapel={daftarMapel}
          awalKelas={kelas} awalMapel={mapel} tutup={() => setForm(null)}
        />
      )}
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
            const r = await api.post<{ jumlah: number; ditolak: Ditolak[] }>('/admin/soal/impor', { sekolahId, baris: baris.slice(i, i + 200) })
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

function FormSoal({ soal, sekolahId, daftarMapel, awalKelas, awalMapel, tutup }: {
  soal: Soal | null; sekolahId: string | null; daftarMapel: string[]; awalKelas: string | null; awalMapel: string | null; tutup: () => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState(() => ({
    id: soal?.id ?? '',
    mataPelajaran: soal?.mataPelajaran ?? awalMapel ?? daftarMapel[0] ?? 'Matematika',
    kelas: soal?.kelas ?? awalKelas ?? '6',
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
      const body = { ...d, kunci: d.kunci.join(','), skor: Number(d.skor), sekolahId };
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
              <span className="text-sm font-semibold">Gambar (opsional)</span>
              {d.gambar && <GambarSoal nama={d.gambar} className="max-h-48" />}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-3 text-[13px] font-semibold hover:bg-muted focus-within:outline-3 focus-within:outline-biru">
                  <UploadSimple className="size-4" /> {mengunggah ? 'Mengunggah...' : d.gambar ? 'Ganti gambar' : 'Pilih gambar'}
                  <input type="file" accept="image/*" className="sr-only" disabled={mengunggah} onChange={(e) => unggahGambar(e.target.files?.[0])} />
                </label>
                {d.gambar && <Button type="button" size="sm" variant="ghost" onClick={() => ubah('gambar', null)}>Hapus gambar</Button>}
                <span className="text-xs text-muted-foreground">Gambar besar otomatis diperkecil.</span>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                Pilihan jawaban <span className="font-semibold text-muted-foreground">({d.tipe === 'PGK' ? 'tandai SEMUA jawaban benar' : 'tandai satu jawaban benar'})</span>
              </legend>
              {HURUF.map((h, i) => (
                <div key={h} className="flex items-center gap-2">
                  <button
                    type="button" onClick={() => pilihKunci(h)} aria-pressed={d.kunci.includes(h)} aria-label={`Jadikan ${h} kunci jawaban`}
                    className={cn('grid size-11 shrink-0 place-content-center border font-semibold', d.tipe === 'PGK' ? 'rounded-md' : 'rounded-full',
                      d.kunci.includes(h) ? 'border-hijau bg-hijau text-white' : 'border-input bg-white')}
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
            {galat && <p role="alert" className="rounded-md bg-merah-muda px-3 py-2 text-sm font-semibold text-merah">{galat}</p>}
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
                  <li key={i} className={cn('rounded-md border px-3 py-2', s.kunci.includes(HURUF[i]) ? 'border-hijau bg-hijau-muda font-semibold' : 'border-border')}>
                    {HURUF[i]}. {o}
                  </li>
                ))}
              </ul>
              {s.pembahasan && <p className="mt-3 rounded-md bg-kuning-muda px-3 py-2"><b>Pembahasan:</b> {s.pembahasan}</p>}
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Kelompok = { kunci: string; jumlah: number; aktif: number; pgk: number; bergambar: number; jumlahMapel: number };

function kelompokkan(soal: Soal[], kunci: (s: Soal) => string): Kelompok[] {
  const peta = new Map<string, Soal[]>();
  for (const s of soal) peta.set(kunci(s), [...(peta.get(kunci(s)) ?? []), s]);
  return [...peta.entries()].map(([k, isi]) => ({
    kunci: k,
    jumlah: isi.length,
    aktif: isi.filter((s) => s.aktif).length,
    pgk: isi.filter((s) => s.tipe === 'PGK').length,
    bergambar: isi.filter((s) => s.gambar).length,
    jumlahMapel: new Set(isi.map((s) => s.mataPelajaran)).size,
  }));
}

function TombolJejak({ aktif, onClick, children }: { aktif: boolean; onClick?: () => void; children: React.ReactNode }) {
  if (aktif) return <span aria-current="page" className="px-1 font-semibold">{children}</span>;
  return <button type="button" onClick={onClick} className="rounded px-1 text-biru underline-offset-4 hover:underline">{children}</button>;
}

/** Kartu kelas atau mata pelajaran yang bisa diklik untuk masuk ke tingkat berikutnya. */
function DaftarKelompok({ judul, kelompok, label, rincian, pilih }: {
  judul: string; kelompok: Kelompok[]; label: (k: string) => string; rincian: (g: Kelompok) => string; pilih: (k: string) => void;
}) {
  return (
    <section aria-label={judul}>
      <h2 className="text-lg">{judul}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kelompok.map((g) => (
          <li key={g.kunci}>
            <button
              type="button" onClick={() => pilih(g.kunci)}
              className="flex w-full items-center gap-4 rounded-lg border border-garis bg-white p-4 text-left transition-colors hover:border-biru hover:bg-biru-muda/40"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-biru-muda text-biru"><BookOpen className="size-6" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{label(g.kunci)}</span>
                <span className="block text-sm text-muted-foreground">
                  <b className="text-tinta tabular-nums">{g.jumlah}</b> soal{g.aktif < g.jumlah && ` (${g.jumlah - g.aktif} nonaktif)`}{rincian(g) && ` · ${rincian(g)}`}
                </span>
              </span>
              <CaretRight className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
