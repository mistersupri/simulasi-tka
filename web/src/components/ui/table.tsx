import * as React from 'react';
import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto rounded-lg border border-border bg-white">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
const TableHeader = ({ className, ...p }: React.ComponentProps<'thead'>) => <thead className={cn('bg-muted/60', className)} {...p} />;
const TableBody = ({ className, ...p }: React.ComponentProps<'tbody'>) => <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />;
const TableRow = ({ className, ...p }: React.ComponentProps<'tr'>) => (
  <tr className={cn('border-b border-border transition-colors hover:bg-latar data-[state=selected]:bg-biru-muda', className)} {...p} />
);
const TableHead = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('h-10 px-3 text-left align-middle text-xs font-bold whitespace-nowrap text-muted-foreground', className)} {...p} />
);
const TableCell = ({ className, ...p }: React.ComponentProps<'td'>) => <td className={cn('px-3 py-2.5 align-middle', className)} {...p} />;

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
