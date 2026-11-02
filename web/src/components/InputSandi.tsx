import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Kolom kata sandi dengan tombol tampilkan/sembunyikan. */
export function InputSandi({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [tampil, setTampil] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={tampil ? 'text' : 'password'} autoCapitalize="none" spellCheck={false} className={cn('pr-11', className)} />
      <button
        type="button"
        onClick={() => setTampil((v) => !v)}
        aria-label={tampil ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        aria-pressed={tampil}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-tinta"
      >
        {tampil ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
