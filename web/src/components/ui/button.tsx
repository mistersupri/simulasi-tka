import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Tombol datar dengan sudut kecil; warna menandai tingkat aksi (utama, positif, peringatan, bahaya).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-biru-tua',
        hijau: 'bg-hijau text-white hover:brightness-110',
        kuning: 'bg-kuning text-tinta hover:brightness-95',
        destructive: 'bg-destructive text-white hover:brightness-110',
        outline: 'border border-input bg-white text-tinta hover:bg-muted',
        ghost: 'text-tinta hover:bg-muted',
        link: 'text-biru underline-offset-4 hover:underline',
        // Untuk tombol di atas bilah kepala biru tua; garis fokus putih agar tetap terlihat.
        kepala: 'text-white hover:bg-white/10 focus-visible:outline-white',
        kepalaGaris: 'border border-white/60 text-white hover:bg-white/10 focus-visible:outline-white',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-10',
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
