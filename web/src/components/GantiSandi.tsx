import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, pesanGalat } from '@/lib/api';

export function GantiSandi({ jenis, buka, setBuka }: { jenis: 'siswa' | 'staf'; buka: boolean; setBuka: (b: boolean) => void }) {
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState('');
  const simpan = useMutation({
    mutationFn: () => api.post<{ pesan: string }>('/auth/ganti-password', { jenis, lama, baru }),
    onSuccess: (r) => {
      toast.success(r.pesan);
      setBuka(false);
      setLama(''); setBaru(''); setUlang('');
    },
    onError: (e) => setGalat(pesanGalat(e)),
  });
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogContent>
        <form onSubmit={(e) => {
          e.preventDefault();
          setGalat('');
          if (baru !== ulang) return setGalat('Kata sandi baru tidak sama.');
          simpan.mutate();
        }}>
          <DialogHeader><DialogTitle>Ganti kata sandi</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="pw-lama">Kata sandi lama</Label><Input id="pw-lama" type="password" autoComplete="current-password" value={lama} onChange={(e) => setLama(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="pw-baru">Kata sandi baru</Label><Input id="pw-baru" type="password" autoComplete="new-password" minLength={6} value={baru} onChange={(e) => setBaru(e.target.value)} required /><p className="text-xs text-muted-foreground">Minimal 6 karakter.</p></div>
            <div className="space-y-1.5"><Label htmlFor="pw-ulang">Ulangi kata sandi baru</Label><Input id="pw-ulang" type="password" autoComplete="new-password" value={ulang} onChange={(e) => setUlang(e.target.value)} required /></div>
            {galat && <p role="alert" className="text-sm font-semibold text-merah">{galat}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBuka(false)}>Batal</Button>
            <Button type="submit" disabled={simpan.isPending}>{simpan.isPending ? 'Menyimpan...' : 'Simpan kata sandi'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
