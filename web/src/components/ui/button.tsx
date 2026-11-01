import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Tombol utama memakai motif stiker: tepi tinta + bayangan padat yang "turun" saat ditekan.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-bold whitespace-nowrap transition-[transform,box-shadow,background-color] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'stiker-kecil bg-primary text-primary-foreground hover:bg-jeruk-tua active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        daun: 'stiker-kecil bg-daun text-white hover:brightness-95 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        matahari: 'stiker-kecil bg-matahari text-tinta hover:brightness-95 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        destructive: 'stiker-kecil bg-destructive text-white hover:brightness-95 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        outline: 'border-2 border-tinta bg-white text-tinta hover:bg-muted',
        ghost: 'text-tinta hover:bg-muted',
        link: 'text-jeruk underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-13 px-6 text-base',
        icon: 'size-11',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
