import {
  BookOpen, CaretRight, DownloadSimple, Eye, FileArrowUp, Image as IkonGambar, PencilSimple, Plus, Trash, UploadSimple,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  BilahPilihan, DialogDitolak, DialogImpor, KepalaHalaman, paramSekolah, useDaftarSekolah, usePilihan, useStaf, type Ditolak,
} from '@/components/admin';
import { GambarSoal } from '@/components/GambarSoal';
import { Teks } from '@/components/TeksKaya';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSoal } from './FormSoal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, pesanGalat } from '@/lib/api';
import { adaMarkup } from '@/lib/teksKaya';
import { atributLang, DAFTAR_BAHASA } from '@/lib/bahasa';
import { unduhCsv, type KolomImpor } from '@/lib/tabel';
import type { Soal } from '@/lib/tipe';
import { cn } from '@/lib/utils';

const HURUF = ['A', 'B', 'C', 'D'];
const urutKelas = (a: string, b: string) => a.localeCompare(b, 'id', { numeric: true });

// Urutan kolom impor tempel. Kolom baru (bahasa, peka huruf, kode) ada di ujung agar tempelan format lama tetap terbaca.
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
  { kunci: 'bahasa', header: ['BAHASA'] },
  { kunci: 'pekaHuruf', header: ['PEKA_HURUF'] },
  { kunci: 'kode', header: ['KODE'] },
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
  const [imporBerkas, setImporBerkas] = useState(false);
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
          ...semua.map((s) => [
            s.id, s.mataPelajaran, s.kelas, s.pertanyaan, ...[0, 1, 2, 3].map((i) => s.opsi[i] ?? ''),
            s.tipe === 'ISIAN' ? s.kunci.split('\n').join(' | ') : s.kunci, s.skor, s.tipe, s.pembahasan, s.bahasa, s.pekaHuruf ? 'YA' : '', s.kode ? 'YA' : '',
          ]),
        ])}><DownloadSimple /> Unduh</Button>
        <Button variant="outline" onClick={() => setImpor(true)}><UploadSimple /> Impor tempel</Button>
        <Button variant="outline" onClick={() => setImporBerkas(true)}><FileArrowUp /> Impor berkas</Button>
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
                  <p className="line-clamp-2" dir="auto" lang={atributLang(s.bahasa)}>
                    {(s.gambar || s.opsiGambar?.some(Boolean)) && <IkonGambar className="mr-1 inline size-4" aria-label="Bergambar" />}
                    {s.pertanyaan || <i className="text-muted-foreground">(soal berupa gambar)</i>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.tipe === 'PGK' && <Badge variant="biru">PG kompleks</Badge>}
                    {s.tipe === 'ISIAN' && <Badge variant="biru">{s.kode ? 'Isian kode' : 'Isian'}</Badge>}
                    {s.bahasa !== 'id' && <Badge>{DAFTAR_BAHASA.find((b) => b.kode === s.bahasa)?.nama ?? s.bahasa}</Badge>}
                    {adaMarkup(`${s.pertanyaan}\n${s.opsi.join('\n')}`) && <Badge>Rumus/kode</Badge>}
                  </div>
                </TableCell>
                <TableCell className="max-w-40 font-semibold">
                  {s.tipe === 'ISIAN'
                    ? <span dir="auto" className={cn('block truncate', s.kode && 'font-mono')}>{s.kunci.split('\n')[0]}{s.kunci.includes('\n') && ` (+${s.kunci.split('\n').length - 1})`}</span>
                    : s.kunci}
                </TableCell>
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
        petunjuk={<>Salin baris soal dari Excel atau Google Sheets (termasuk lembar BANK_SOAL versi lama), lalu tempel di bawah. Rumus ditulis LaTeX di antara $...$. Soal isian: tulis TIPE <b>ISIAN</b> dan jawaban yang diterima di kolom kunci, dipisah tanda |. Untuk gambar, pakai <b>Impor berkas</b>.</>}
        template={[KOLOM_IMPOR.map((k) => k.header[0]),
          ['', 'Matematika', '6', 'Hasil dari 125 + 75 adalah ....', '180', '190', '200', '210', 'C', '1', 'PG', '125 + 75 = 200', 'id', '', ''],
          ['', 'Matematika', '6', 'Hasil dari $\\frac{3}{4} + \\frac{1}{2}$ adalah ....', '$1\\frac{1}{4}$', '$\\frac{4}{6}$', '$\\frac{5}{8}$', '$1$', 'A', '1', 'PG', '', 'id', '', ''],
          ['', 'Matematika', '6', 'Manakah yang merupakan bilangan prima?', '2', '4', '7', '9', 'A,C', '2', 'PGK', '', 'id', '', ''],
          ['', 'Bahasa Arab', '6', 'ما معنى كلمة «كِتَاب»؟', 'Buku', 'Pensil', 'Meja', 'Kursi', 'A', '1', 'PG', '', 'ar', '', ''],
          ['', 'Bahasa Rusia', '6', 'Tulis "terima kasih" dalam bahasa Rusia', '', '', '', '', 'спасибо', '1', 'ISIAN', '', 'ru', '', ''],
          ['', 'Informatika', '6', 'Tulis keluaran: print(2 + 3 * 4)', '', '', '', '', '14', '1', 'ISIAN', '', 'id', 'YA', 'YA']]}
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
      <DialogImporBerkas buka={imporBerkas} setBuka={setImporBerkas} sekolahId={sekolahId} />
      <DialogDitolak ditolak={ditolak} tutup={() => setDitolak(null)} />
      {dialogKonfirmasi}
    </>
  );
}

function DialogPratinjau({ soal: s, tutup }: { soal: Soal | null; tutup: () => void }) {
  const diterima = s?.tipe === 'ISIAN' ? s.kunci.split('\n').filter(Boolean) : [];
  return (
    <Dialog open={!!s} onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        {s && (
          <>
            <DialogHeader><DialogTitle>Pratinjau {s.id}</DialogTitle></DialogHeader>
            <DialogBody lang={atributLang(s.bahasa)}>
              <p className="text-sm text-muted-foreground">
                {s.mataPelajaran} · Kelas {s.kelas} · Skor {s.skor}{s.bahasa !== 'id' && ` · ${DAFTAR_BAHASA.find((b) => b.kode === s.bahasa)?.nama ?? s.bahasa}`}
              </p>
              {s.pertanyaan && <Teks className="mt-3 text-lg">{s.pertanyaan}</Teks>}
              <GambarSoal nama={s.gambar} />
              {s.tipe === 'ISIAN' ? (
                <div className="mt-3 space-y-2">
                  <div aria-hidden className={cn('rounded-md border border-input bg-white px-3 py-2 text-muted-foreground', s.kode && 'font-mono')}>Kotak jawaban siswa</div>
                  <div className="rounded-md border border-hijau bg-hijau-muda px-3 py-2">
                    <p className="text-xs font-semibold text-muted-foreground">Jawaban yang diterima{s.pekaHuruf ? ' (huruf besar/kecil dibedakan)' : ''}</p>
                    <ul className={cn('font-semibold', s.kode && 'font-mono')} dir="auto">{diterima.map((j) => <li key={j}>{j}</li>)}</ul>
                  </div>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {s.opsi.map((o, i) => (
                    <li key={i} className={cn('flex items-start gap-2 rounded-md border px-3 py-2', s.kunci.includes(HURUF[i]) ? 'border-hijau bg-hijau-muda font-semibold' : 'border-border')}>
                      <span>{HURUF[i]}.</span>
                      <span className="min-w-0 flex-1">
                        {o && <Teks sebaris className="block">{o}</Teks>}
                        <GambarSoal nama={s.opsiGambar?.[i]} alt={`Gambar pilihan ${HURUF[i]}`} className="max-h-40" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.pembahasan && <div className="mt-3 rounded-md bg-kuning-muda px-3 py-2"><b>Pembahasan:</b> <Teks>{s.pembahasan}</Teks></div>}
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

type LaporanBerkas = { jumlah: number; ditolak: { nomor: number; alasan: string }[]; peringatan: string[] };

/** Impor dari .xlsx atau .zip (Excel + gambar). Mendukung rumus LaTeX, kode, bahasa asing, soal isian, dan gambar. */
function DialogImporBerkas({ buka, setBuka, sekolahId }: { buka: boolean; setBuka: (b: boolean) => void; sekolahId: string | null }) {
  const qc = useQueryClient();
  const [berkas, setBerkas] = useState<File | null>(null);
  const [laporan, setLaporan] = useState<LaporanBerkas | null>(null);
  const kirim = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('berkas', berkas!);
      if (sekolahId) form.append('sekolahId', sekolahId);
      return api.post<LaporanBerkas>('/admin/soal/impor-berkas', form);
    },
    onSuccess: (r) => {
      setLaporan(r);
      qc.invalidateQueries({ queryKey: ['soal'] });
      if (r.jumlah) toast.success(`${r.jumlah} soal diimpor.`);
    },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const tutup = (b: boolean) => {
    if (kirim.isPending) return;
    setBuka(b);
    if (!b) { setBerkas(null); setLaporan(null); }
  };
  return (
    <Dialog open={buka} onOpenChange={tutup}>
      <DialogContent lebar>
        <DialogHeader>
          <DialogTitle>Impor soal dari berkas</DialogTitle>
          <DialogDescription>Unggah satu berkas Excel (.xlsx), atau ZIP berisi Excel beserta gambar-gambarnya.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!laporan ? (
            <>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                <li><b>Rumus matematika:</b> tulis LaTeX di antara $...$, mis. <code className="rounded-sm bg-kode px-1">{'$\\frac{3}{4}$'}</code>. Bisa di pertanyaan, pilihan, dan pembahasan.</li>
                <li><b>Gambar dari berkas:</b> isi kolom GAMBAR (soal) atau GAMBAR_A sampai GAMBAR_D (pilihan) dengan nama berkas, lalu kumpulkan Excel dan gambarnya dalam satu ZIP.</li>
                <li><b>Gambar ditempel di Excel:</b> letakkan gambar di sel kolom PERTANYAAN atau OPSI_A sampai OPSI_D pada baris soalnya (gambar mengambang biasa; tidak perlu ZIP). Cocok untuk rumus yang berupa gambar.</li>
                <li><b>Kode program, soal isian, dan bahasa asing</b> (Arab, Mandarin, Rusia, dan lainnya): lihat contoh di template.</li>
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href="/api/admin/soal/template.xlsx" download><DownloadSimple /> Unduh template Excel</a>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-3 text-[13px] font-semibold hover:bg-muted focus-within:outline-3 focus-within:outline-biru">
                  <UploadSimple className="size-4" /> {berkas ? 'Ganti berkas' : 'Pilih berkas .xlsx atau .zip'}
                  <input type="file" accept=".xlsx,.zip" className="sr-only" onChange={(e) => { setBerkas(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                </label>
                {berkas && <span className="text-sm font-semibold">{berkas.name} <span className="font-normal text-muted-foreground">({(berkas.size / 1024 / 1024).toFixed(1)} MB)</span></span>}
              </div>
              <p className="text-xs text-muted-foreground">Maksimal 40 MB, 500 soal, dan 5 MB per gambar. Baris yang bermasalah dilewati dan dilaporkan; baris lain tetap masuk.</p>
            </>
          ) : (
            <div role="status" className="space-y-3">
              <p className="rounded-md bg-hijau-muda px-3 py-2 font-semibold">{laporan.jumlah} soal berhasil diimpor.</p>
              {laporan.peringatan.length > 0 && (
                <div className="rounded-md bg-kuning-muda px-3 py-2 text-sm">
                  <p className="font-semibold">Perhatian:</p>
                  <ul className="mt-1 list-disc pl-5">{laporan.peringatan.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {laporan.ditolak.length > 0 && (
                <div className="rounded-md bg-merah-muda px-3 py-2 text-sm">
                  <p className="font-semibold text-merah">{laporan.ditolak.length} baris dilewati:</p>
                  <ul className="mt-1 list-disc pl-5">{laporan.ditolak.map((d, i) => <li key={i}><b>Baris {d.nomor}:</b> {d.alasan}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {!laporan ? (
            <>
              <Button variant="outline" disabled={kirim.isPending} onClick={() => tutup(false)}>Batal</Button>
              <Button disabled={!berkas || kirim.isPending} onClick={() => kirim.mutate()}>{kirim.isPending ? 'Mengimpor...' : 'Impor'}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setLaporan(null); setBerkas(null); }}>Impor berkas lain</Button>
              <Button onClick={() => tutup(false)}>Selesai</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
