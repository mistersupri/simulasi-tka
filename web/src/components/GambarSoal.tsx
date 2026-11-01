import { useState } from 'react';
import { urlGambar } from '@/lib/api';
import { cn } from '@/lib/utils';

export function GambarSoal({ nama, className }: { nama: string | null; className?: string }) {
  const [gagal, setGagal] = useState(false);
  if (!nama) return null;
  if (gagal) return <p className="my-3 text-sm text-bata">Gambar soal gagal dimuat. Beri tahu pengawas.</p>;
  return (
    <img
      src={urlGambar(nama)}
      alt="Gambar pendukung soal"
      draggable={false}
      onError={() => setGagal(true)}
      className={cn('my-3 max-h-80 max-w-full rounded-md border-2 border-border bg-white object-contain', className)}
    />
  );
}
