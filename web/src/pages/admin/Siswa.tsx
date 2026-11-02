import { DownloadSimple, Key, PencilSimple, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BilahPilihan, DialogAkun, DialogDitolak, DialogImpor, KepalaHalaman, PilihSekolah, SEMUA_SEKOLAH, paramSekolah, usePilihan, useStaf, type Ditolak,
} from '@/components/admin';
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
import { api, pesanGalat } from '@/lib/api';
import { formatTanggal } from '@/lib/format';
import { unduhCsv, type KolomImpor } from '@/lib/tabel';
import type { Akun, Siswa } from '@/lib/tipe';

const SEMUA = 'semua';
const KOLOM_IMPOR: KolomImpor[] = [
  { kunci: 'nisn', header: ['NISN'] },
  { kunci: 'nama', header: ['NAMA_SISWA', 'NAMA', 'NAMA_LENGKAP'] },
  { kunci: 'kelas', header: ['KELAS'] },
  { kunci: 'username', header: ['USERNAME'] },
  { kunci: 'password', header: ['PASSWORD', 'KATA_SANDI'] },
];

export default function HalamanSiswa() {
  const qc = useQueryClient();
  const staf = useStaf();
  const admin = staf.peran === 'ADMIN';
  const [konfirmasi, dialog] = useKonfirmasi();
  // Admin instansi menyaring per sekolah; operator selalu sekolahnya sendiri (dibatasi server).
  const [sekolah, setSekolah] = useState(SEMUA_SEKOLAH);
  const [sekolahImpor, setSekolahImpor] = useState('');
  const q = useQuery({ queryKey: ['siswa', sekolah], queryFn: () => api.get<Siswa[]>(`/admin/siswa${paramSekolah(sekolah)}`) });
  const [cari, setCari] = useState('');
  const [kelas, setKelas] = useState(SEMUA);
  const [form, setForm] = useState<Siswa | 'baru' | null>(null);
  const [impor, setImpor] = useState(false);
  const [akun, setAkun] = useState<{ judul: string; daftar: Akun[]; ditolak?: Ditolak[] } | null>(null);
  const [ditolak, setDitolak] = useState<Ditolak[] | null>(null);

  const semua = q.data ?? [];
  const daftarKelas = useMemo(() => [...new Set(semua.map((s) => s.kelas))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true })), [semua]);
  const data = useMemo(() => semua.filter((s) =>
    (kelas === SEMUA || s.kelas === kelas) && (!cari || `${s.nama} ${s.nisn} ${s.username}`.toLowerCase().includes(cari.toLowerCase())),
  ), [semua, kelas, cari]);
  const pilihan = usePilihan(useMemo(() => data.map((s) => s.id), [data]));
  const segarkan = () => qc.invalidateQueries({ queryKey: ['siswa'] });

  const status = useMutation({
    mutationFn: (aktif: boolean) => api.post<{ pesan: string }>('/admin/siswa/status', { ids: pilihan.ids, aktif }),
    onSuccess: (r) => { toast.success(r.pesan); segarkan(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const hapus = useMutation({
    mutationFn: () => api.post<{ pesan: string }>('/admin/siswa/hapus', { ids: pilihan.ids }),
    onSuccess: (r) => { toast.success(r.pesan); pilihan.kosongkan(); segarkan(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const reset = useMutation({
    mutationFn: async (ids: string[]) => {
      const hasil: Akun[] = [];
      for (let i = 0; i < ids.length; i += 50) hasil.push(...(await api.post<{ akun: Akun[] }>('/admin/siswa/reset-password', { ids: ids.slice(i, i + 50) })).akun);
      return hasil;
    },
    onSuccess: (daftar) => setAkun({ judul: 'Kata sandi baru', daftar }),
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman
        judul="Data siswa"
        keterangan={q.data ? `${semua.length} siswa terdaftar${admin ? '' : ` di ${staf.namaSekolah}`}` : undefined}
      >
        <Button variant="outline" disabled={!semua.length} onClick={() => unduhCsv('data-siswa.csv', [
          ['SEKOLAH', 'NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'STATUS'],
          ...semua.map((s) => [s.namaSekolah, s.nisn, s.nama, s.kelas, s.username, s.aktif ? 'AKTIF' : 'NONAKTIF']),
        ])}><DownloadSimple /> Unduh</Button>
        <Button variant="outline" onClick={() => { setSekolahImpor(sekolah === SEMUA_SEKOLAH ? '' : sekolah); setImpor(true); }}><UploadSimple /> Impor</Button>
        <Button onClick={() => setForm('baru')}><Plus /> Tambah siswa</Button>
      </KepalaHalaman>

      <div className={admin ? 'mb-4 grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr]' : 'mb-4 grid gap-2 sm:grid-cols-[2fr_1fr]'}>
        {admin && <div className="sm:order-2"><PilihSekolah nilai={sekolah} ubah={setSekolah} semua label="Saring sekolah" /></div>}
        <Input type="search" placeholder="Cari nama, NISN, atau username..." aria-label="Cari siswa" value={cari} onChange={(e) => setCari(e.target.value)} />
        <Select value={kelas} onValueChange={setKelas}>
          <SelectTrigger aria-label="Saring kelas" className="sm:order-3"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={SEMUA}>Semua kelas</SelectItem>{daftarKelas.map((k) => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <BilahPilihan jumlah={pilihan.dipilih.size}>
        <Button size="sm" disabled={reset.isPending} onClick={async () => {
          if (await konfirmasi({ judul: 'Buat kata sandi baru?', pesan: `${pilihan.dipilih.size} siswa akan mendapat kata sandi baru secara acak. Kata sandi lama tidak berlaku lagi.`, ya: 'Buat kata sandi baru' })) reset.mutate(pilihan.ids);
        }}><Key /> {reset.isPending ? 'Memproses...' : 'Reset sandi & cetak kartu'}</Button>
        <Button size="sm" variant="outline" onClick={() => status.mutate(true)}>Aktifkan</Button>
        <Button size="sm" variant="outline" onClick={() => status.mutate(false)}>Nonaktifkan</Button>
        <Button size="sm" variant="destructive" onClick={async () => {
          if (await konfirmasi({ judul: `Hapus ${pilihan.dipilih.size} siswa?`, pesan: 'Akun dihapus. Hasil ujian mereka tetap tersimpan.', ya: 'Hapus', bahaya: true })) hapus.mutate();
        }}><Trash /> Hapus</Button>
      </BilahPilihan>

      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !data.length ? (
        <Kosong judul={semua.length ? 'Tidak ada siswa yang cocok.' : 'Belum ada siswa.'}>{!semua.length && 'Impor daftar siswa dari Excel; username dan kata sandi bisa dibuat otomatis.'}</Kosong>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Pilih semua siswa" checked={pilihan.semua} onCheckedChange={(v) => pilihan.ubahSemua(!!v)} /></TableHead>
              <TableHead>Nama</TableHead>{admin && sekolah === SEMUA_SEKOLAH && <TableHead>Sekolah</TableHead>}<TableHead>Kelas</TableHead><TableHead>Username</TableHead><TableHead>Status</TableHead><TableHead>Login terakhir</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => (
              <TableRow key={s.id} data-state={pilihan.dipilih.has(s.id) ? 'selected' : undefined}>
                <TableCell><Checkbox aria-label={`Pilih ${s.nama}`} checked={pilihan.dipilih.has(s.id)} onCheckedChange={(v) => pilihan.ubah(s.id, !!v)} /></TableCell>
                <TableCell><b>{s.nama}</b>{s.nisn && <div className="text-xs text-muted-foreground">NISN {s.nisn}</div>}</TableCell>
                {admin && sekolah === SEMUA_SEKOLAH && <TableCell className="text-sm">{s.namaSekolah}</TableCell>}
                <TableCell>{s.kelas}</TableCell>
                <TableCell><code>{s.username}</code></TableCell>
                <TableCell><Badge variant={s.aktif ? 'hijau' : 'default'}>{s.aktif ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatTanggal(s.loginTerakhir)}</TableCell>
                <TableCell className="text-right"><Button size="icon-sm" variant="ghost" aria-label={`Ubah ${s.nama}`} onClick={() => setForm(s)}><PencilSimple /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {form && <FormSiswa admin={admin} sekolahAwal={sekolah === SEMUA_SEKOLAH ? '' : sekolah} siswa={form === 'baru' ? null : form} tutup={() => setForm(null)} akunBaru={(daftar) => setAkun({ judul: 'Akun siswa baru', daftar })} />}
      <DialogImpor
        buka={impor} setBuka={setImpor} judul="Impor siswa" kolom={KOLOM_IMPOR}
        petunjuk="Salin daftar siswa dari Excel, Google Sheets, atau Dapodik. Username dan kata sandi boleh kosong: dibuat otomatis lalu bisa dicetak sebagai kartu login."
        atas={admin && (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="impor-sekolah">Masukkan ke sekolah</Label>
            <PilihSekolah id="impor-sekolah" nilai={sekolahImpor} ubah={setSekolahImpor} label="Sekolah tujuan impor" />
          </div>
        )}
        template={[['NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'PASSWORD'], ['0123456789', 'Budi Santoso', '6', '', ''], ['0123456790', 'Siti Aminah', '6', 'siti', 'rahasia1']]}
        kirim={async (baris, progres) => {
          if (admin && !sekolahImpor) {
            toast.error('Pilih sekolah tujuan terlebih dahulu.');
            throw new Error('Sekolah belum dipilih');
          }
          const dibuat: Akun[] = [];
          const tolak: Ditolak[] = [];
          for (let i = 0; i < baris.length; i += 25) {
            const r = await api.post<{ akun: Akun[]; ditolak: Ditolak[] }>('/admin/siswa/impor', { sekolahId: sekolahImpor || null, baris: baris.slice(i, i + 25) })
              .catch((e) => { toast.error(pesanGalat(e)); throw e; });
            dibuat.push(...r.akun);
            tolak.push(...r.ditolak);
            progres(Math.min(baris.length, i + 25));
          }
          segarkan();
          if (dibuat.length) setAkun({ judul: `${dibuat.length} akun siswa baru`, daftar: dibuat, ditolak: tolak });
          else if (tolak.length) setDitolak(tolak);
        }}
      />
      <DialogAkun akun={akun?.daftar ?? null} judul={akun?.judul ?? ''} ditolak={akun?.ditolak} tutup={() => setAkun(null)} />
      <DialogDitolak ditolak={ditolak} tutup={() => setDitolak(null)} />
      {dialog}
    </>
  );
}

function FormSiswa({ admin, sekolahAwal, siswa, tutup, akunBaru }: {
  admin: boolean; sekolahAwal: string; siswa: Siswa | null; tutup: () => void; akunBaru: (a: Akun[]) => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState({
    nisn: siswa?.nisn ?? '', nama: siswa?.nama ?? '', kelas: siswa?.kelas ?? '6', username: siswa?.username ?? '', password: '', aktif: siswa?.aktif ?? true,
    sekolahId: siswa?.sekolahId ?? sekolahAwal,
  });
  const [galat, setGalat] = useState('');
  const simpan = useMutation({
    mutationFn: () => siswa
      ? api.put<{ pesan: string; akun?: Akun[] }>(`/admin/siswa/${siswa.id}`, d)
      : api.post<{ pesan: string; akun?: Akun[] }>('/admin/siswa', d),
    onSuccess: (r) => {
      toast.success(r.pesan);
      qc.invalidateQueries({ queryKey: ['siswa'] });
      qc.invalidateQueries({ queryKey: ['sekolah'] });
      tutup();
      if (r.akun) akunBaru(r.akun);
    },
    onError: (e) => setGalat(pesanGalat(e)),
  });
  return (
    <Dialog open onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); setGalat(''); simpan.mutate(); }} className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>{siswa ? 'Ubah data siswa' : 'Tambah siswa'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            {admin && (
              <div className="space-y-1.5">
                <Label htmlFor="m-sekolah">Sekolah</Label>
                <PilihSekolah id="m-sekolah" nilai={d.sekolahId} ubah={(v) => setD({ ...d, sekolahId: v })} />
                {siswa && d.sekolahId !== siswa.sekolahId && <p className="text-xs font-semibold text-merah">Siswa akan dipindahkan ke sekolah lain. Hasil ujian lamanya tetap tercatat di sekolah asal.</p>}
              </div>
            )}
            <div className="space-y-1.5"><Label htmlFor="m-nama">Nama lengkap</Label><Input id="m-nama" value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="m-nisn">NISN</Label><Input id="m-nisn" inputMode="numeric" value={d.nisn} onChange={(e) => setD({ ...d, nisn: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="m-kelas">Kelas</Label><Input id="m-kelas" value={d.kelas} onChange={(e) => setD({ ...d, kelas: e.target.value })} required /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="m-user">Username</Label><Input id="m-user" autoCapitalize="none" value={d.username} disabled={!!siswa} placeholder="Otomatis dari nama" onChange={(e) => setD({ ...d, username: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="m-pass">{siswa ? 'Kata sandi baru' : 'Kata sandi'}</Label><Input id="m-pass" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} placeholder={siswa ? 'Kosongkan bila tidak diganti' : 'Kosongkan untuk dibuat otomatis'} /></div>
            <Label className="font-semibold"><Switch checked={d.aktif} onCheckedChange={(v) => setD({ ...d, aktif: v })} /> Akun aktif</Label>
            {galat && <p role="alert" className="rounded-md bg-merah-muda px-3 py-2 text-sm font-semibold text-merah">{galat}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={tutup}>Batal</Button>
            <Button type="submit" disabled={simpan.isPending}>{simpan.isPending ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
