import { X } from '@phosphor-icons/react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, lebar, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { lebar?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-tinta/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'stiker fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white outline-none',
          lebar ? 'max-w-4xl' : 'max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-3 right-3 rounded-md p-2 text-tinta hover:bg-muted" aria-label="Tutup">
          <X weight="bold" className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

const DialogHeader = ({ className, ...p }: React.ComponentProps<'div'>) => <div className={cn('border-b-2 border-border px-5 py-4 pr-14', className)} {...p} />;
const DialogBody = ({ className, ...p }: React.ComponentProps<'div'>) => <div className={cn('overflow-y-auto px-5 py-4', className)} {...p} />;
const DialogFooter = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col-reverse gap-2 border-t-2 border-border px-5 py-3 sm:flex-row sm:justify-end', className)} {...p} />
);
const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={cn('text-lg font-extrabold', className)} {...p} />
);
const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description className={cn('mt-1 text-sm text-muted-foreground', className)} {...p} />
);

export { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
