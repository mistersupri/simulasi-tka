import { DownloadSimple, FileXls, UploadSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KepalaHalaman } from '@/components/admin';
import { Galat, Memuat } from '@/components/Keadaan';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, pesanGalat } from '@/lib/api';
import { perkecilGambar } from '@/lib/gambar';

type Data = {
  pengaturan: { NAMA_SEKOLAH: string; TAHUN_AJARAN: string; PENGUMUMAN: string; KKM: string; SISWA_BOLEH_GANTI_PASSWORD: string; SIMPAN_TANGKAPAN_HARI: string };
  adaLogo: boolean;
};
type LaporanImpor = { siswa: number; soal: number; ujian: number; dilewati: { lembar: string; baris: number; alasan: string }[] };

export default function HalamanPengaturan() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pengaturan'], queryFn: () => api.get<Data>('/admin/pengaturan') });
  const [d, setD] = useState({ NAMA_SEKOLAH: '', TAHUN_AJARAN: '', PENGUMUMAN: '', KKM: '70', SISWA_BOLEH_GANTI_PASSWORD: true, SIMPAN_TANGKAPAN_HARI: '30' });
  const [laporan, setLaporan] = useState<LaporanImpor | null>(null);
  const [versiLogo, setVersiLogo] = useState(0);

  useEffect(() => {
    if (q.data) setD({ ...q.data.pengaturan, SISWA_BOLEH_GANTI_PASSWORD: q.data.pengaturan.SISWA_BOLEH_GANTI_PASSWORD === 'YA' });
  }, [q.data]);

  const segarkanInfo = () => {
    qc.invalidateQueries({ queryKey: ['pengaturan'] });
    qc.invalidateQueries({ queryKey: ['info'] });
  };
  const simpan = useMutation({
    mutationFn: () => api.put<{ pesan: string }>('/admin/pengaturan', d),
    onSuccess: (r) => { toast.success(r.pesan); segarkanInfo(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const logo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('logo', await perkecilGambar(file, 400), file.name);
      return api.post<{ pesan: string }>('/admin/logo', form);
    },
    onSuccess: (r) => { toast.success(r.pesan); setVersiLogo((v) => v + 1); segarkanInfo(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const hapusLogo = useMutation({
    mutationFn: () => api.delete<{ pesan: string }>('/admin/logo'),
    onSuccess: (r) => { toast.success(r.pesan); segarkanInfo(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const impor = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('berkas', file);
      return api.post<LaporanImpor>('/admin/impor-excel', form);
    },
    onSuccess: (r) => { setLaporan(r); qc.invalidateQueries(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  if (q.isPending) return <Memuat />;
  if (q.error) return <Galat galat={q.error} ulangi={() => q.refetch()} />;

  return (
    <>
      <KepalaHalaman judul="Pengaturan" />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); simpan.mutate(); }} className="space-y-4">
            <CardTitle>Identitas sekolah</CardTitle>
            <div className="space-y-1.5"><Label htmlFor="p-nama">Nama sekolah</Label><Input id="p-nama" value={d.NAMA_SEKOLAH} onChange={(e) => setD({ ...d, NAMA_SEKOLAH: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="p-tahun">Tahun ajaran</Label><Input id="p-tahun" value={d.TAHUN_AJARAN} onChange={(e) => setD({ ...d, TAHUN_AJARAN: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-kkm">KKM</Label><Input id="p-kkm" type="number" min={0} max={100} value={d.KKM} onChange={(e) => setD({ ...d, KKM: e.target.value })} /><p className="text-xs text-muted-foreground">0 = tanpa KKM</p></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="p-umum">Pengumuman untuk siswa</Label><Textarea id="p-umum" rows={3} value={d.PENGUMUMAN} onChange={(e) => setD({ ...d, PENGUMUMAN: e.target.value })} placeholder="Tampil di beranda siswa" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="p-simpan">Simpan tangkapan layar ujian (hari)</Label>
              <Input id="p-simpan" type="number" min={1} max={365} className="max-w-32" value={d.SIMPAN_TANGKAPAN_HARI} onChange={(e) => setD({ ...d, SIMPAN_TANGKAPAN_HARI: e.target.value })} />
              <p className="text-xs text-muted-foreground">Tangkapan yang lebih lama dihapus otomatis untuk menjaga privasi siswa dan ruang penyimpanan.</p>
            </div>
            <Label className="font-semibold"><Switch checked={d.SISWA_BOLEH_GANTI_PASSWORD} onCheckedChange={(v) => setD({ ...d, SISWA_BOLEH_GANTI_PASSWORD: v })} /> Siswa boleh mengganti kata sandi sendiri</Label>
            <Button type="submit" disabled={simpan.isPending}>{simpan.isPending ? 'Menyimpan...' : 'Simpan pengaturan'}</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>Logo sekolah</CardTitle>
            <CardDescription>Tampil di halaman login dan kartu ujian. Tanpa logo, nama sekolah dipakai sebagai teks.</CardDescription>
            {q.data.adaLogo && <img src={`/api/logo?v=${versiLogo}`} alt="Logo sekolah" className="mt-3 size-24 rounded-md border border-border object-contain" />}
            <div className="mt-3 flex flex-wrap gap-2">
              <label className={buttonVariants({ variant: 'outline', size: 'sm', className: 'cursor-pointer focus-within:outline-3 focus-within:outline-biru' })}>
                <UploadSimple /> {logo.isPending ? 'Mengunggah...' : q.data.adaLogo ? 'Ganti logo' : 'Unggah logo'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) logo.mutate(f); e.target.value = ''; }} />
              </label>
              {q.data.adaLogo && <Button size="sm" variant="ghost" onClick={() => hapusLogo.mutate()}>Hapus logo</Button>}
            </div>
          </Card>

          <Card>
            <CardTitle>Pindahkan data dari versi Google Sheets</CardTitle>
            <CardDescription>
              Unduh spreadsheet lama sebagai .xlsx (File, Download, Microsoft Excel), lalu unggah di sini.
              Siswa tetap bisa login dengan kata sandi lama.
            </CardDescription>
            <label className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3 cursor-pointer focus-within:outline-3 focus-within:outline-biru' })}>
              <FileXls /> {impor.isPending ? 'Mengimpor...' : 'Pilih berkas .xlsx'}
              <input type="file" accept=".xlsx" className="sr-only" disabled={impor.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) impor.mutate(f); e.target.value = ''; }} />
            </label>
            {laporan && (
              <div role="status" className="mt-3 rounded-md bg-hijau-muda p-3 text-sm">
                <p className="font-semibold">Berhasil: {laporan.siswa} siswa, {laporan.soal} soal, {laporan.ujian} ujian.</p>
                {laporan.dilewati.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-merah">
                    {laporan.dilewati.slice(0, 20).map((x, i) => <li key={i}>{x.lembar} baris {x.baris}: {x.alasan}</li>)}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Cadangan data</CardTitle>
            <CardDescription>Unduh seluruh data (siswa, soal, ujian, hasil) sebagai berkas JSON. Simpan di tempat aman; berisi hash kata sandi.</CardDescription>
            <a href="/api/admin/backup.json" download className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })}><DownloadSimple /> Unduh cadangan</a>
          </Card>
        </div>
      </div>
    </>
  );
}
