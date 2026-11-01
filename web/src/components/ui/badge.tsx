import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Lencana hanya untuk status nyata (aktif, tuntas, pelanggaran, dsb.).
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap [&_svg]:size-3.5', {
  variants: {
    variant: {
      default: 'bg-muted text-tinta',
      daun: 'bg-daun-muda text-daun',
      bata: 'bg-bata-muda text-bata',
      matahari: 'bg-matahari-muda text-tinta',
      jeruk: 'bg-jeruk-muda text-jeruk-tua',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
