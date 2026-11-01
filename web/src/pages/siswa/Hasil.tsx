import { ArrowLeft, Check, X } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { GambarSoal } from '@/components/GambarSoal';
import { Galat, Memuat } from '@/components/Keadaan';
import { BilahKepala } from '@/components/Merek';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDurasi } from '@/lib/format';
import type { HasilSiswa, ItemPembahasan } from '@/lib/tipe';
import { cn } from '@/lib/utils';

const JUDUL: Record<HasilSiswa['status'], string> = {
  SELESAI: 'Ujian selesai',
  WAKTU_HABIS: 'Waktu habis, jawaban terkirim',
  DIHENTIKAN: 'Ujian dihentikan pengawas',
  PELANGGARAN: 'Ujian dikirim otomatis karena pelanggaran',
};

export function HalamanHasil() {
  const { id = '' } = useParams();
  const hasil = useQuery({ queryKey: ['hasil', id], queryFn: () => api.get<HasilSiswa>(`/siswa/hasil/${id}`) });

  return (
    <div className="min-h-dvh">
      <BilahKepala lebar="max-w-3xl" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ArrowLeft /> Kembali ke beranda</Link>
        {hasil.isPending ? <Memuat /> : hasil.error ? <Galat className="mt-6" galat={hasil.error} ulangi={() => hasil.refetch()} /> : <IsiHasil h={hasil.data} />}
      </main>
    </div>
  );
}

function IsiHasil({ h }: { h: HasilSiswa }) {
  return (
    <>
      <section className="mt-4 rounded-lg border border-garis bg-white p-6 sm:p-8">
        <p className="text-sm text-muted-foreground">{h.namaUjian} · {h.mataPelajaran}</p>
        <h1 className="mt-1 text-2xl">{JUDUL[h.status]}</h1>

        {h.tampilkanNilai ? (
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Nilai akhir</div>
              <div className={cn('text-6xl leading-none font-semibold tabular-nums', h.tuntas === false ? 'text-tinta' : 'text-hijau')}>{h.nilai}</div>
              {h.tuntas !== null && (
                <Badge variant={h.tuntas ? 'hijau' : 'merah'} className="mt-2">{h.tuntas ? 'Tuntas' : 'Belum tuntas'} · KKM {h.kkm}</Badge>
              )}
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Angka label="Benar" nilai={h.benar ?? 0} kelas="text-hijau" />
              <Angka label="Salah" nilai={h.salah ?? 0} kelas="text-merah" />
              <Angka label="Tidak dijawab" nilai={h.kosong} />
              <div className="rounded-md bg-muted px-3 py-2"><dt className="text-muted-foreground">Waktu</dt><dd className="font-semibold">{formatDurasi(h.durasiDetik)}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="mt-4 text-lg">Jawaban Anda telah tersimpan. Nilai akan diumumkan oleh guru.</p>
        )}
        {h.jumlahPelanggaran > 0 && <p className="mt-5 text-sm font-semibold text-merah">Tercatat {h.jumlahPelanggaran} pelanggaran selama ujian.</p>}
      </section>

      {h.pembahasan && (
        <section className="mt-10">
          <h2 className="text-lg">Pembahasan</h2>
          <ol className="mt-4 space-y-4">{h.pembahasan.map((p) => <ItemBahas key={p.id} p={p} />)}</ol>
        </section>
      )}
    </>
  );
}

function Angka({ label, nilai, kelas }: { label: string; nilai: number; kelas?: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-2xl font-semibold tabular-nums', kelas)}>{nilai}</dd>
    </div>
  );
}

function ItemBahas({ p }: { p: ItemPembahasan }) {
  const kunci = p.kunci.split(',');
  const jawab = p.jawaban.split(',');
  return (
    <li className="rounded-lg border border-garis bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Soal nomor {p.nomor}</span>
        <Badge variant={p.benar ? 'hijau' : p.jawaban ? 'merah' : 'default'}>{p.benar ? 'Benar' : p.jawaban ? 'Salah' : 'Tidak dijawab'}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-line">{p.pertanyaan}</p>
      <GambarSoal nama={p.gambar} />
      <ul className="mt-3 space-y-1.5">
        {p.opsi.map((o, i) => {
          const h = 'ABCD'[i];
          const isKunci = kunci.includes(h);
          const isJawab = jawab.includes(h);
          return (
            <li key={h} className={cn('flex items-start gap-2 rounded-md px-3 py-2', isKunci ? 'bg-hijau-muda' : isJawab ? 'bg-merah-muda' : '')}>
              <b>{h}.</b>
              <span className="flex-1 whitespace-pre-line">{o}</span>
              {isKunci && <Check className="size-5 text-hijau" aria-label="kunci jawaban" />}
              {isJawab && !isKunci && <X className="size-5 text-merah" aria-label="jawaban Anda" />}
              {isJawab && <span className="text-xs text-muted-foreground">jawaban Anda</span>}
            </li>
          );
        })}
      </ul>
      {p.pembahasan && <p className="mt-3 rounded-md bg-kuning-muda px-3 py-2 whitespace-pre-line"><b>Pembahasan:</b> {p.pembahasan}</p>}
    </li>
  );
}
