import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KepalaHalaman } from '@/components/admin';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, pesanGalat } from '@/lib/api';
import type { Sekolah } from '@/lib/tipe';

export default function HalamanSekolah() {
  const qc = useQueryClient();
  const [konfirmasi, dialog] = useKonfirmasi();
  const [form, setForm] = useState<Sekolah | 'baru' | null>(null);
  const [cari, setCari] = useState('');
  const q = useQuery({ queryKey: ['sekolah'], queryFn: () => api.get<Sekolah[]>('/admin/sekolah') });
  const data = useMemo(
    () => (q.data ?? []).filter((s) => !cari || `${s.nama} ${s.npsn ?? ''}`.toLowerCase().includes(cari.toLowerCase())),
    [q.data, cari],
  );
  const hapus = useMutation({
    mutationFn: (id: string) => api.delete<{ pesan: string }>(`/admin/sekolah/${id}`),
    onSuccess: (r) => { toast.success(r.pesan); qc.invalidateQueries({ queryKey: ['sekolah'] }); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman
        judul="Sekolah"
        keterangan="Sekolah binaan. Setiap sekolah punya operator yang mengelola data siswa dan akun guru sekolahnya."
      >
        <Button onClick={() => setForm('baru')}><Plus /> Tambah sekolah</Button>
      </KepalaHalaman>
      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !q.data.length ? (
        <Kosong judul="Belum ada sekolah.">Tambahkan sekolah, lalu buat akun operator untuk tiap sekolah di menu Pengguna.</Kosong>
      ) : (
        <>
          <Input type="search" className="mb-4 max-w-md" placeholder="Cari nama atau NPSN..." aria-label="Cari sekolah" value={cari} onChange={(e) => setCari(e.target.value)} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sekolah</TableHead><TableHead className="text-right">Siswa</TableHead><TableHead className="text-right">Operator</TableHead>
                <TableHead className="text-right">Guru</TableHead><TableHead className="text-right">Hasil ujian</TableHead><TableHead className="text-right">Rata-rata</TableHead>
                <TableHead>Status</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="min-w-52">
                    <b>{s.nama}</b>
                    <div className="text-xs text-muted-foreground">{s.npsn ? `NPSN ${s.npsn}` : 'NPSN belum diisi'}{s.alamat && ` · ${s.alamat}`}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.jumlahSiswa}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.jumlahOperator || <span className="font-semibold text-merah">Belum ada</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.jumlahGuru}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.jumlahHasil}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.rataRata ?? '-'}</TableCell>
                  <TableCell><Badge variant={s.aktif ? 'hijau' : 'default'}>{s.aktif ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${s.nama}`} onClick={() => setForm(s)}><PencilSimple /></Button>
                      <Button size="icon-sm" variant="ghost" className="text-merah" aria-label={`Hapus ${s.nama}`} onClick={async () => {
                        if (await konfirmasi({
                          judul: `Hapus ${s.nama}?`,
                          pesan: 'Hanya sekolah tanpa siswa dan akun yang bisa dihapus. Bila masih dipakai, nonaktifkan saja.',
                          ya: 'Hapus', bahaya: true,
                        })) hapus.mutate(s.id);
                      }}><Trash /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      {form && <FormSekolah sekolah={form === 'baru' ? null : form} tutup={() => setForm(null)} />}
      {dialog}
    </>
  );
}

function FormSekolah({ sekolah, tutup }: { sekolah: Sekolah | null; tutup: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ nama: sekolah?.nama ?? '', npsn: sekolah?.npsn ?? '', alamat: sekolah?.alamat ?? '', aktif: sekolah?.aktif ?? true });
  const [galat, setGalat] = useState('');
  const simpan = useMutation({
    mutationFn: () => sekolah ? api.put<{ pesan: string }>(`/admin/sekolah/${sekolah.id}`, d) : api.post<{ pesan: string }>('/admin/sekolah', d),
    onSuccess: (r) => {
      toast.success(r.pesan);
      qc.invalidateQueries({ queryKey: ['sekolah'] });
      tutup();
    },
    onError: (e) => setGalat(pesanGalat(e)),
  });
  return (
    <Dialog open onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); setGalat(''); simpan.mutate(); }} className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>{sekolah ? 'Ubah sekolah' : 'Tambah sekolah'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="k-nama">Nama sekolah</Label><Input id="k-nama" value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} placeholder="mis. SDN Johar Baru 01 Pagi" required /></div>
            <div className="space-y-1.5">
              <Label htmlFor="k-npsn">NPSN</Label>
              <Input id="k-npsn" inputMode="numeric" maxLength={8} value={d.npsn} onChange={(e) => setD({ ...d, npsn: e.target.value.replace(/\D/g, '') })} />
              <p className="text-xs text-muted-foreground">8 angka. Dipakai untuk mencocokkan siswa saat impor Excel (kolom NPSN).</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="k-alamat">Alamat</Label><Input id="k-alamat" value={d.alamat} onChange={(e) => setD({ ...d, alamat: e.target.value })} /></div>
            <div className="flex items-start gap-3">
              <Switch id="k-aktif" checked={d.aktif} onCheckedChange={(v) => setD({ ...d, aktif: v })} className="mt-0.5" />
              <div>
                <Label htmlFor="k-aktif">Sekolah aktif</Label>
                <p className="text-xs text-muted-foreground">Bila dinonaktifkan, siswa, guru, dan operator sekolah ini langsung keluar dan tidak bisa login.</p>
              </div>
            </div>
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
