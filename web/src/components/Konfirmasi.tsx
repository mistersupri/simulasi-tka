import { useCallback, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

type Opsi = { judul: string; pesan: string; ya?: string; bahaya?: boolean };

/** const [konfirmasi, dialog] = useKonfirmasi(); if (await konfirmasi({...})) ... ; render {dialog} */
export function useKonfirmasi() {
  const [aktif, setAktif] = useState<(Opsi & { selesai: (ya: boolean) => void }) | null>(null);
  const konfirmasi = useCallback((opsi: Opsi) => new Promise<boolean>((selesai) => setAktif({ ...opsi, selesai })), []);
  const tutup = (ya: boolean) => {
    aktif?.selesai(ya);
    setAktif(null);
  };
  const dialog = (
    <AlertDialog open={!!aktif} onOpenChange={(buka) => !buka && tutup(false)}>
      <AlertDialogContent>
        <AlertDialogTitle>{aktif?.judul}</AlertDialogTitle>
        <AlertDialogDescription>{aktif?.pesan}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => tutup(false)}>Batal</AlertDialogCancel>
          <AlertDialogAction className={aktif?.bahaya ? buttonVariants({ variant: 'destructive' }) : undefined} onClick={() => tutup(true)}>
            {aktif?.ya ?? 'Ya'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return [konfirmasi, dialog] as const;
}
