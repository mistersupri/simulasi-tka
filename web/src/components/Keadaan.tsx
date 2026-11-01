import { CircleNotch, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { pesanGalat } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Memuat({ teks = 'Memuat...', className }: { teks?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-12 text-muted-foreground', className)}>
      <CircleNotch className="size-5 animate-spin" /> {teks}
    </div>
  );
}

export function Kosong({ judul, children, className }: { judul: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-dashed border-input bg-white/60 px-5 py-10 text-center', className)}>
      <p className="font-semibold">{judul}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Galat({ galat, ulangi, className }: { galat: unknown; ulangi?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-lg border border-merah bg-merah-muda px-5 py-8 text-center', className)}>
      <WarningCircle className="size-7 text-merah" />
      <p className="font-semibold text-merah">{pesanGalat(galat)}</p>
      {ulangi && <Button variant="outline" size="sm" onClick={ulangi}>Coba lagi</Button>}
    </div>
  );
}
