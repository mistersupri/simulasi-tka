import { Progress as ProgressPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

function Progress({ className, value, warna = 'bg-hijau', ...props }: React.ComponentProps<typeof ProgressPrimitive.Root> & { warna?: string }) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
      <ProgressPrimitive.Indicator className={cn('h-full transition-all', warna)} style={{ width: `${value ?? 0}%` }} />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
