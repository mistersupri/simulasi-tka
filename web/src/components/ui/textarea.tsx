import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-base text-tinta placeholder:text-muted-foreground focus-visible:border-biru disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
