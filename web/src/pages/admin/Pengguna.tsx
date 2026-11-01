import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { DialogAkun, KepalaHalaman, useStaf } from '@/components/admin';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, pesanGalat } from '@/lib/api';
import { formatTanggal } from '@/lib/format';
import type { Akun, Pengguna } from '@/lib/tipe';

export default function HalamanPengguna() {
  const saya = useStaf();
  const qc = useQueryClient();
  const [konfirmasi, dialog] = useKonfirmasi();
  const [form, setForm] = useState<Pengguna | 'baru' | null>(null);
  const [akun, setAkun] = useState<Akun[] | null>(null);
  const q = useQuery({ queryKey: ['pengguna'], queryFn: () => api.get<Pengguna[]>('/admin/pengguna') });
  const hapus = useMutation({
    mutationFn: (id: string) => api.delete<{ pesan: string }>(`/admin/pengguna/${id}`),
    onSuccess: (r) => { toast.success(r.pesan); qc.invalidateQueries({ queryKey: ['pengguna'] }); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  return (
    <>
      <KepalaHalaman judul="Guru & admin" keterangan="Guru: bank soal, jadwal, monitor, dan hasil. Admin: semua menu.">
        <Button onClick={() => setForm('baru')}><Plus weight="bold" /> Tambah pengguna</Button>
      </KepalaHalaman>
      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Username</TableHead><TableHead>Peran</TableHead><TableHead>Status</TableHead><TableHead>Login terakhir</TableHead><TableHead><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {q.data.map((p) => (
              <TableRow key={p.id}>
                <TableCell><b>{p.nama}</b>{p.id === saya.id && <Badge variant="jeruk" className="ml-2">Anda</Badge>}</TableCell>
                <TableCell><code>{p.username}</code></TableCell>
                <TableCell>{p.peran === 'ADMIN' ? 'Admin' : 'Guru'}</TableCell>
                <TableCell><Badge variant={p.aktif ? 'daun' : 'default'}>{p.aktif ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatTanggal(p.loginTerakhir)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${p.nama}`} onClick={() => setForm(p)}><PencilSimple weight="bold" /></Button>
                    {p.id !== saya.id && (
                      <Button size="icon-sm" variant="ghost" className="text-bata" aria-label={`Hapus ${p.nama}`} onClick={async () => {
                        if (await konfirmasi({ judul: `Hapus ${p.nama}?`, pesan: 'Akun ini tidak bisa login lagi.', ya: 'Hapus', bahaya: true })) hapus.mutate(p.id);
                      }}><Trash weight="bold" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {form && <FormPengguna pengguna={form === 'baru' ? null : form} tutup={() => setForm(null)} akunBaru={setAkun} />}
      <DialogAkun akun={akun} judul="Akun pengguna baru" tutup={() => setAkun(null)} />
      {dialog}
    </>
  );
}

function FormPengguna({ pengguna, tutup, akunBaru }: { pengguna: Pengguna | null; tutup: () => void; akunBaru: (a: Akun[]) => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ nama: pengguna?.nama ?? '', username: pengguna?.username ?? '', peran: pengguna?.peran ?? 'GURU', aktif: pengguna?.aktif ?? true, password: '' });
  const [galat, setGalat] = useState('');
  const simpan = useMutation({
    mutationFn: () => pengguna ? api.put<{ pesan: string; akun?: Akun[] }>(`/admin/pengguna/${pengguna.id}`, d) : api.post<{ pesan: string; akun?: Akun[] }>('/admin/pengguna', d),
    onSuccess: (r) => {
      toast.success(r.pesan);
      qc.invalidateQueries({ queryKey: ['pengguna'] });
      tutup();
      if (r.akun) akunBaru(r.akun);
    },
    onError: (e) => setGalat(pesanGalat(e)),
  });
  return (
    <Dialog open onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); setGalat(''); simpan.mutate(); }} className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>{pengguna ? 'Ubah pengguna' : 'Tambah pengguna'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="g-nama">Nama</Label><Input id="g-nama" value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="g-user">Username</Label><Input id="g-user" autoCapitalize="none" value={d.username} disabled={!!pengguna} onChange={(e) => setD({ ...d, username: e.target.value })} required /></div>
              <div className="space-y-1.5">
                <Label>Peran</Label>
                <Select value={d.peran} onValueChange={(v) => setD({ ...d, peran: v as 'ADMIN' | 'GURU' })}>
                  <SelectTrigger aria-label="Peran"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="GURU">Guru</SelectItem><SelectItem value="ADMIN">Admin</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="g-pass">{pengguna ? 'Kata sandi baru' : 'Kata sandi'}</Label><Input id="g-pass" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} placeholder={pengguna ? 'Kosongkan bila tidak diganti' : 'Kosongkan untuk dibuat otomatis'} /></div>
            <Label className="font-semibold"><Switch checked={d.aktif} onCheckedChange={(v) => setD({ ...d, aktif: v })} /> Akun aktif</Label>
            {galat && <p role="alert" className="rounded-md bg-bata-muda px-3 py-2 text-sm font-bold text-bata">{galat}</p>}
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
