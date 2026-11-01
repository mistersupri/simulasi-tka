import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Lencana hanya untuk status nyata (aktif, tuntas, pelanggaran, dsb.).
const badgeVariants = cva('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5', {
  variants: {
    variant: {
      default: 'bg-muted text-tinta',
      hijau: 'bg-hijau-muda text-hijau',
      merah: 'bg-merah-muda text-merah',
      kuning: 'bg-kuning-muda text-tinta',
      biru: 'bg-biru-muda text-biru-tua',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
