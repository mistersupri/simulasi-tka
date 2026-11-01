import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-base text-tinta transition-colors placeholder:text-muted-foreground focus-visible:border-biru disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm file:font-semibold',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
