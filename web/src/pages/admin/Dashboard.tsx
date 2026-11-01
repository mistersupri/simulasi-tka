import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { KepalaHalaman, useStaf } from '@/components/admin';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatTanggal } from '@/lib/format';

type Data = {
  jumlahSiswa: number; siswaAktif: number; jumlahSoal: number; jumlahUjian: number; ujianDibuka: number;
  jumlahHasil: number; rataRata: number | null; sedangUjian: number;
  perKelas: { label: string; jumlah: number }[]; perMapel: { label: string; jumlah: number }[];
  hasilTerbaru: { id: string; namaSiswa: string; kelas: string; namaUjian: string; nilai: number; tanggal: string }[];
};

export default function Dashboard() {
  const staf = useStaf();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Data>('/admin/dashboard') });
  if (q.isPending) return <Memuat />;
  if (q.error) return <Galat galat={q.error} ulangi={() => q.refetch()} />;
  const d = q.data;

  const langkah = [
    !d.jumlahSiswa && staf.peran === 'ADMIN' && { teks: 'Daftarkan siswa (bisa impor dari Excel) lalu cetak kartu login.', ke: '/admin/siswa', tombol: 'Buka data siswa' },
    !d.jumlahSoal && { teks: 'Isi bank soal, atau impor dari Excel.', ke: '/admin/soal', tombol: 'Buka bank soal' },
    !d.jumlahUjian && { teks: 'Buat jadwal ujian beserta tokennya.', ke: '/admin/ujian', tombol: 'Buat jadwal' },
  ].filter(Boolean) as { teks: string; ke: string; tombol: string }[];

  return (
    <>
      <KepalaHalaman judul={`Selamat datang, ${staf.nama.split(' ')[0]}`} keterangan={formatTanggal(new Date(), true)} />

      {/* Titik fokus: ujian yang sedang berjalan sekarang. */}
      <section className="stiker flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-6">
        <div>
          <p className="text-sm font-bold text-muted-foreground">Sedang mengerjakan sekarang</p>
          <p className="text-5xl font-extrabold tabular-nums">{d.sedangUjian} <span className="text-xl text-muted-foreground">siswa</span></p>
          <p className="mt-1 text-sm text-muted-foreground">{d.ujianDibuka} ujian sedang dibuka</p>
        </div>
        <Link to="/admin/monitor" className={buttonVariants({ size: 'lg' })}>Pantau ujian</Link>
      </section>

      {langkah.length > 0 && (
        <Card className="mt-6 border-tinta bg-matahari-muda">
          <CardTitle>Langkah awal</CardTitle>
          <ol className="mt-3 space-y-3">
            {langkah.map((l, i) => (
              <li key={l.ke} className="flex flex-wrap items-center justify-between gap-3">
                <span><b>{i + 1}.</b> {l.teks}</span>
                <Link to={l.ke} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{l.tombol}</Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Siswa', d.jumlahSiswa, `${d.siswaAktif} aktif`],
          ['Soal', d.jumlahSoal, 'di bank soal'],
          ['Hasil masuk', d.jumlahHasil, 'semua ujian'],
          ['Rata-rata nilai', d.rataRata ?? '-', d.rataRata === null ? 'belum ada hasil' : 'semua ujian'],
        ].map(([label, nilai, ket]) => (
          <div key={label as string} className="rounded-lg border-2 border-border bg-white p-4">
            <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
            <dd className="text-3xl font-extrabold tabular-nums">{nilai}</dd>
            <dd className="text-xs text-muted-foreground">{ket}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-xl">Hasil terbaru</h2>
          <div className="mt-3">
            {d.hasilTerbaru.length ? (
              <Table>
                <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Ujian</TableHead><TableHead className="text-right">Nilai</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.hasilTerbaru.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell><b>{h.namaSiswa}</b><div className="text-xs text-muted-foreground">Kelas {h.kelas} · {formatTanggal(h.tanggal)}</div></TableCell>
                      <TableCell>{h.namaUjian}</TableCell>
                      <TableCell className="text-right text-lg font-extrabold tabular-nums">{h.nilai}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Kosong judul="Belum ada siswa yang mengerjakan ujian." />}
          </div>
        </section>
        <section className="space-y-6">
          <Batang judul="Soal per mapel" data={d.perMapel} />
          <Batang judul="Siswa per kelas" data={d.perKelas} />
        </section>
      </div>
    </>
  );
}

function Batang({ judul, data }: { judul: string; data: { label: string; jumlah: number }[] }) {
  const maks = Math.max(1, ...data.map((x) => x.jumlah));
  return (
    <div>
      <h2 className="text-xl">{judul}</h2>
      {data.length ? (
        <ul className="mt-3 space-y-2">
          {data.map((x) => (
            <li key={x.label} className="grid grid-cols-[minmax(0,1fr)_2fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate font-bold" title={x.label}>{x.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-jeruk" style={{ width: `${(x.jumlah / maks) * 100}%` }} /></span>
              <span className="text-right font-extrabold tabular-nums">{x.jumlah}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-muted-foreground">Belum ada data.</p>}
    </div>
  );
}
