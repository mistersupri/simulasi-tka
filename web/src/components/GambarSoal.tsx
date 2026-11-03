import { useState } from 'react';
import { urlGambar } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Gambar soal atau gambar pilihan jawaban. `alt` menjelaskan gambar bagi pembaca layar. */
export function GambarSoal({ nama, className, alt = 'Gambar pendukung soal' }: { nama: string | null | undefined; className?: string; alt?: string }) {
  const [gagal, setGagal] = useState(false);
  if (!nama) return null;
  if (gagal) return <span className="my-3 block text-sm text-merah">Gambar gagal dimuat. Beri tahu pengawas.</span>;
  return (
    <img
      src={urlGambar(nama)}
      alt={alt}
      draggable={false}
      onError={() => setGagal(true)}
      className={cn('my-3 max-h-80 max-w-full rounded-md border border-border bg-white object-contain', className)}
    />
  );
}
