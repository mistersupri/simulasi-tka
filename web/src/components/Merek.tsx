import { useEffect, type ReactNode } from 'react';
import { useInfo } from '@/hooks/useProfil';
import { cn } from '@/lib/utils';

export const NAMA_APLIKASI_BAWAAN = 'Simulasi Tes Kemampuan Akademik';

/** Judul tab/jendela mengikuti nama aplikasi di Pengaturan (juga judul jendela aplikasi ujian Windows). */
export function JudulDokumen() {
  const { data: info } = useInfo();
  useEffect(() => {
    if (info?.namaAplikasi) document.title = info.namaAplikasi;
  }, [info?.namaAplikasi]);
  return null;
}

/** Identitas sekolah: logo unggahan bila ada, selain itu nama sekolah sebagai teks. */
export function Merek({ className, kecil, terang }: { className?: string; kecil?: boolean; terang?: boolean }) {
  const { data: info } = useInfo();
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {info?.adaLogo && (
        <img src="/api/logo" alt="" className={cn('shrink-0 rounded-sm bg-white object-contain p-0.5', kecil ? 'size-9' : 'size-11')} />
      )}
      <div className="min-w-0 leading-tight">
        <div className={cn('truncate font-semibold', kecil ? 'text-[15px]' : 'text-lg')}>{info?.namaInstansi ?? NAMA_APLIKASI_BAWAAN}</div>
        <div className={cn('truncate text-xs', terang ? 'text-biru-pucat' : 'text-muted-foreground')}>
          {info?.namaAplikasi ?? NAMA_APLIKASI_BAWAAN}{info?.tahunAjaran ? ` · Tahun Ajaran ${info.tahunAjaran}` : ''}
        </div>
      </div>
    </div>
  );
}

/**
 * Bilah kepala resmi (motif identitas, lihat DESIGN.md): biru tua dengan nama sekolah,
 * seperti kop surat. Dipakai di semua halaman siswa.
 */
export function BilahKepala({ children, className, lebar = 'max-w-5xl' }: { children?: ReactNode; className?: string; lebar?: string }) {
  return (
    <header className={cn('bg-biru text-white', className)}>
      <div className={cn('mx-auto flex items-center justify-between gap-3 px-4 py-3', lebar)}>
        <Merek kecil terang />
        {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
      </div>
    </header>
  );
}
