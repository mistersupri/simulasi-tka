import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { KepalaHalaman } from '@/components/admin';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatTanggal } from '@/lib/format';

type Log = { id: string; waktu: string; pengguna: string; peran: string; aksi: string; detail: string };

export default function HalamanLog() {
  const q = useQuery({ queryKey: ['log'], queryFn: () => api.get<Log[]>('/admin/log') });
  const [cari, setCari] = useState('');
  const data = useMemo(() => (q.data ?? []).filter((l) => !cari || `${l.pengguna} ${l.aksi} ${l.detail}`.toLowerCase().includes(cari.toLowerCase())), [q.data, cari]);
  return (
    <>
      <KepalaHalaman judul="Log aktivitas" keterangan="500 aktivitas terakhir petugas. Operator hanya melihat aktivitas akun di sekolahnya." />
      <Input type="search" className="mb-4 max-w-md" placeholder="Cari pengguna atau aksi..." aria-label="Cari log" value={cari} onChange={(e) => setCari(e.target.value)} />
      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !data.length ? <Kosong judul="Belum ada aktivitas." /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Pengguna</TableHead><TableHead>Aksi</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-sm whitespace-nowrap">{formatTanggal(l.waktu)}</TableCell>
                <TableCell><b>{l.pengguna}</b> <span className="text-xs text-muted-foreground">{l.peran}</span></TableCell>
                <TableCell><code className="text-xs">{l.aksi}</code></TableCell>
                <TableCell className="max-w-md truncate text-sm">{l.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
