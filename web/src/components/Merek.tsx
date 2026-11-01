import { useInfo } from '@/hooks/useProfil';
import { cn } from '@/lib/utils';

/** Identitas sekolah: logo unggahan bila ada, selain itu nama sekolah sebagai teks. */
export function Merek({ className, kecil }: { className?: string; kecil?: boolean }) {
  const { data: info } = useInfo();
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {info?.adaLogo && (
        <img src="/api/logo" alt="" className={cn('shrink-0 rounded-md bg-white object-contain', kecil ? 'size-9' : 'size-12')} />
      )}
      <div className="min-w-0 leading-tight">
        <div className={cn('truncate font-extrabold', kecil ? 'text-base' : 'text-lg')}>{info?.namaSekolah ?? 'Simulasi TKA'}</div>
        <div className="truncate text-xs text-muted-foreground">Simulasi TKA · {info?.tahunAjaran ?? ''}</div>
      </div>
    </div>
  );
}
