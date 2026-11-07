import { Printer, DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useInfo } from '@/hooks/useProfil';
import { api } from '@/lib/api';
import { parseTabel, tabelKeObjek, unduhCsv, type KolomImpor } from '@/lib/tabel';
import type { Akun, ProfilStaf, SekolahPilihan } from '@/lib/tipe';

export const useStaf = () => useOutletContext<ProfilStaf>();

/** Daftar sekolah untuk filter & form. Operator/guru hanya menerima sekolahnya sendiri. */
export const useDaftarSekolah = () =>
  useQuery({ queryKey: ['sekolah', 'pilihan'], queryFn: () => api.get<SekolahPilihan[]>('/admin/sekolah/pilihan'), staleTime: 60_000 });

export const SEMUA_SEKOLAH = 'semua';

/** Pilihan sekolah. Dengan `semua`, ada opsi "Semua sekolah" bernilai SEMUA_SEKOLAH. */
export function PilihSekolah({ nilai, ubah, semua, id, label = 'Sekolah' }: {
  nilai: string; ubah: (v: string) => void; semua?: boolean; id?: string; label?: string;
}) {
  const q = useDaftarSekolah();
  return (
    <Select value={nilai} onValueChange={ubah}>
      <SelectTrigger id={id} aria-label={label}><SelectValue placeholder={q.isPending ? 'Memuat sekolah...' : 'Pilih sekolah'} /></SelectTrigger>
      <SelectContent>
        {semua && <SelectItem value={SEMUA_SEKOLAH}>Semua sekolah</SelectItem>}
        {q.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.nama}{s.aktif ? '' : ' (nonaktif)'}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Parameter ?sekolahId= untuk API; kosong bila "semua". */
export const paramSekolah = (nilai: string, awal = '?') => (nilai && nilai !== SEMUA_SEKOLAH ? `${awal}sekolahId=${encodeURIComponent(nilai)}` : '');

export function KepalaHalaman({ judul, keterangan, children }: { judul: string; keterangan?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl">{judul}</h1>
        {keterangan && <p className="mt-1 text-muted-foreground">{keterangan}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Bilah aksi massal: muncul bila ada baris yang dipilih. */
export function BilahPilihan({ jumlah, children }: { jumlah: number; children: ReactNode }) {
  if (!jumlah) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-kuning-muda px-3 py-2">
      <span className="mr-2 font-semibold">{jumlah} dipilih</span>
      {children}
    </div>
  );
}

export function usePilihan(semuaId: string[]) {
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  // Buang pilihan yang barisnya hilang (dihapus atau tersaring).
  useEffect(() => {
    setDipilih((lama) => {
      const ada = new Set(semuaId);
      const baru = new Set([...lama].filter((id) => ada.has(id)));
      return baru.size === lama.size ? lama : baru;
    });
  }, [semuaId]);
  return {
    dipilih,
    ids: [...dipilih],
    semua: semuaId.length > 0 && semuaId.every((id) => dipilih.has(id)),
    ubah: (id: string, v: boolean) => setDipilih((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; }),
    ubahSemua: (v: boolean) => setDipilih(v ? new Set(semuaId) : new Set()),
    kosongkan: () => setDipilih(new Set()),
  };
}

/** Akun baru/reset: kata sandi hanya terlihat sekali, jadi tawarkan cetak & unduh. */
/** petugas: akun guru/operator/admin, sehingga kartu menampilkan "Peran" dan alamat halaman petugas. */
export function DialogAkun({ akun, judul, tutup, ditolak, petugas }: {
  akun: Akun[] | null; judul: string; tutup: () => void; ditolak?: Ditolak[]; petugas?: boolean;
}) {
  const { data: info } = useInfo();
  const labelKelas = petugas ? 'Peran' : 'Kelas';
  const alamat = window.location.origin + (petugas ? '/admin' : '');
  const adaSekolah = !!akun?.some((a) => a.sekolah);
  const cetak = () => {
    document.body.classList.add('mode-cetak');
    window.print();
    document.body.classList.remove('mode-cetak');
  };
  return (
    <Dialog open={!!akun?.length} onOpenChange={(b) => !b && tutup()}>
      <DialogContent lebar>
        <DialogHeader>
          <DialogTitle>{judul}</DialogTitle>
          <DialogDescription className="font-semibold text-merah">Kata sandi hanya ditampilkan sekali ini. Cetak atau unduh sekarang.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!!ditolak?.length && (
            <div role="alert" className="mb-4 rounded-md bg-merah-muda px-3 py-2 text-sm">
              <p className="font-semibold text-merah">{ditolak.length} baris dilewati:</p>
              <ul className="mt-1 list-disc pl-5">
                {ditolak.map((d, i) => <li key={i}>Baris {d.nomor}{d.nama ? ` (${d.nama})` : ''}: {d.alasan}</li>)}
              </ul>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {adaSekolah && <TableHead>Sekolah</TableHead>}<TableHead>Nama</TableHead><TableHead>{labelKelas}</TableHead><TableHead>Username</TableHead><TableHead>Kata sandi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {akun?.map((a) => (
                <TableRow key={a.username}>
                  {adaSekolah && <TableCell className="text-sm">{a.sekolah}</TableCell>}
                  <TableCell className="font-semibold">{a.nama}</TableCell><TableCell>{a.kelas}</TableCell>
                  <TableCell><code>{a.username}</code></TableCell><TableCell><code className="text-base font-semibold">{a.password}</code></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => unduhCsv('akun.csv', [['Sekolah', 'Nama', labelKelas, 'Username', 'Kata sandi', 'Alamat'], ...(akun ?? []).map((a) => [a.sekolah ?? '', a.nama, a.kelas, a.username, a.password, alamat])])}>
            <DownloadSimple /> Unduh CSV
          </Button>
          <Button onClick={cetak}><Printer /> Cetak kartu login</Button>
        </DialogFooter>
      </DialogContent>
      {akun?.length ? createPortal(
        <div className="area-cetak">
          <div className="grid grid-cols-2 gap-3">
            {akun.map((a) => (
              <div key={a.username} className="break-inside-avoid rounded-lg border border-dashed border-garis p-3 text-sm">
                <p className="font-semibold">Kartu login {info?.namaAplikasi ?? 'Simulasi TKA'}</p>
                <p className="text-xs">{a.sekolah || info?.namaInstansi}</p>
                <table className="mt-2"><tbody>
                  <tr><td className="pr-3">Nama</td><td className="font-semibold">{a.nama}</td></tr>
                  <tr><td className="pr-3">{labelKelas}</td><td>{a.kelas}</td></tr>
                  <tr><td className="pr-3">Username</td><td className="text-base font-semibold">{a.username}</td></tr>
                  <tr><td className="pr-3">Kata sandi</td><td className="text-base font-semibold">{a.password}</td></tr>
                </tbody></table>
                <p className="mt-2 text-xs break-all">{alamat}</p>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </Dialog>
  );
}

/** Impor dari tempelan Excel/Sheets atau berkas CSV, dengan pratinjau. */
export function DialogImpor({ buka, setBuka, judul, petunjuk, atas, kolom, template, kirim }: {
  buka: boolean; setBuka: (b: boolean) => void; judul: string; petunjuk: ReactNode; atas?: ReactNode; kolom: KolomImpor[];
  template: string[][]; kirim: (baris: Record<string, string | number>[], progres: (n: number) => void) => Promise<void>;
}) {
  const [teks, setTeks] = useState('');
  const [progres, setProgres] = useState<number | null>(null);
  const baris = useMemo(() => tabelKeObjek(parseTabel(teks), kolom), [teks, kolom]);
  const jalan = async () => {
    setProgres(0);
    try {
      await kirim(baris, (n) => setProgres(Math.round((n / baris.length) * 100)));
      setTeks('');
      setBuka(false);
    } finally {
      setProgres(null);
    }
  };
  return (
    <Dialog open={buka} onOpenChange={(b) => progres === null && setBuka(b)}>
      <DialogContent lebar>
        <DialogHeader>
          <DialogTitle>{judul}</DialogTitle>
          <DialogDescription>{petunjuk}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {atas}
          <p className="text-sm">Urutan kolom: <b>{kolom.map((k) => k.header[0]).join(' · ')}</b>. Baris judul kolom boleh ikut ditempel.</p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-3 text-[13px] font-semibold hover:bg-muted focus-within:outline-3 focus-within:outline-biru">
              <UploadSimple className="size-4" /> Pilih berkas CSV
              <input type="file" accept=".csv,.tsv,.txt" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setTeks(await f.text()); }} />
            </label>
            <Button variant="outline" size="sm" onClick={() => unduhCsv('template.csv', template)}><DownloadSimple /> Unduh template</Button>
          </div>
          <Textarea rows={8} value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="Salin baris dari Excel atau Google Sheets, lalu tempel (Ctrl+V) di sini." aria-label="Data yang ditempel" />
          {baris.length > 0 && (
            <div>
              <Badge variant="hijau">{baris.length} baris terbaca</Badge>
              <Table className="mt-2">
                <TableHeader><TableRow>{kolom.slice(0, 5).map((k) => <TableHead key={k.kunci}>{k.header[0]}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {baris.slice(0, 4).map((b) => (
                    <TableRow key={b.nomor}>{kolom.slice(0, 5).map((k) => <TableCell key={k.kunci} className="max-w-56 truncate">{b[k.kunci]}</TableCell>)}</TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {progres !== null && <p role="status" className="font-semibold">Mengimpor... {progres}%</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={progres !== null} onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={!baris.length || progres !== null} onClick={jalan}>Impor {baris.length || ''} baris</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type Ditolak = { nomor: number; alasan: string; nama?: string };

export function DialogDitolak({ ditolak, tutup }: { ditolak: Ditolak[] | null; tutup: () => void }) {
  return (
    <Dialog open={!!ditolak?.length} onOpenChange={(b) => !b && tutup()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{ditolak?.length} baris dilewati</DialogTitle><DialogDescription>Perbaiki baris berikut lalu impor ulang.</DialogDescription></DialogHeader>
        <DialogBody>
          <ul className="space-y-2 text-sm">
            {ditolak?.map((d, i) => <li key={i}><b>Baris {d.nomor}</b>{d.nama ? ` (${d.nama})` : ''}: {d.alasan}</li>)}
          </ul>
        </DialogBody>
        <DialogFooter><Button onClick={tutup}>Tutup</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Teks status ujian/hasil yang konsisten di seluruh halaman admin. */
export const LABEL_STATUS_HASIL = {
  SELESAI: { label: 'Selesai', varian: 'hijau' },
  WAKTU_HABIS: { label: 'Waktu habis', varian: 'kuning' },
  DIHENTIKAN: { label: 'Dihentikan pengawas', varian: 'biru' },
  PELANGGARAN: { label: 'Pelanggaran', varian: 'merah' },
} as const;
