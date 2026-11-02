import {
  Broadcast, Buildings, CalendarCheck, ChartBar, ClipboardText, GearSix, House, Key, List, ListChecks, SignOut, Student, UsersThree, X,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { GantiSandi } from '@/components/GantiSandi';
import { Galat, Memuat } from '@/components/Keadaan';
import { BilahKepala, Merek } from '@/components/Merek';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfilStaf } from '@/hooks/useProfil';
import { api, ApiError, pesanGalat } from '@/lib/api';
import { LABEL_PERAN, type Peran, type ProfilStaf } from '@/lib/tipe';
import { cn } from '@/lib/utils';

const SEMUA: Peran[] = ['ADMIN', 'OPERATOR', 'GURU'];
const PENGAWAS: Peran[] = ['ADMIN', 'OPERATOR'];

// Hak akses tiap menu sama dengan pembatasan di server (server/routes/admin).
const MENU: { ke: string; label: string | Partial<Record<Peran, string>>; ikon: typeof House; peran: Peran[]; akhir?: boolean }[] = [
  { ke: '/admin', label: 'Beranda', ikon: House, akhir: true, peran: SEMUA },
  { ke: '/admin/monitor', label: 'Monitor ujian', ikon: Broadcast, peran: PENGAWAS },
  { ke: '/admin/hasil', label: 'Hasil & analisis', ikon: ChartBar, peran: SEMUA },
  { ke: '/admin/ujian', label: 'Jadwal ujian', ikon: CalendarCheck, peran: PENGAWAS },
  { ke: '/admin/soal', label: { ADMIN: 'Bank soal', OPERATOR: 'Bank soal sekolah' }, ikon: ClipboardText, peran: PENGAWAS },
  { ke: '/admin/sekolah', label: 'Sekolah', ikon: Buildings, peran: ['ADMIN'] },
  { ke: '/admin/siswa', label: 'Data siswa', ikon: Student, peran: PENGAWAS },
  { ke: '/admin/pengguna', label: { ADMIN: 'Pengguna', OPERATOR: 'Akun guru' }, ikon: UsersThree, peran: PENGAWAS },
  { ke: '/admin/pengaturan', label: 'Pengaturan', ikon: GearSix, peran: ['ADMIN'] },
  { ke: '/admin/log', label: 'Log aktivitas', ikon: ListChecks, peran: PENGAWAS },
];

export function LayoutAdmin() {
  const profil = useProfilStaf();
  if (profil.isPending) return <Memuat className="min-h-dvh" />;
  if (profil.error && !(profil.error instanceof ApiError && profil.error.status === 401)) {
    return <main className="mx-auto max-w-md px-4 py-20"><Galat galat={profil.error} ulangi={() => profil.refetch()} /></main>;
  }
  return profil.data ? <Kerangka profil={profil.data} /> : <LoginStaf />;
}

function LoginStaf() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const masuk = useMutation({
    mutationFn: () => api.post<{ profil: ProfilStaf }>('/auth/staf/login', { username, password }),
    onSuccess: (r) => qc.setQueryData(['profil', 'staf'], r.profil),
  });
  return (
    <div className="flex min-h-dvh flex-col">
      <BilahKepala />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <form className="rounded-xl border border-garis bg-white p-6 sm:p-8" onSubmit={(e) => { e.preventDefault(); masuk.mutate(); }}>
        <h1 className="text-xl">Masuk petugas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Untuk admin Suku Dinas, operator sekolah, dan guru.</p>
        <div className="mt-6 space-y-1.5"><Label htmlFor="u">Username</Label><Input id="u" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
        <div className="mt-4 space-y-1.5"><Label htmlFor="p">Kata sandi</Label><Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {masuk.error && <p role="alert" className="mt-4 rounded-md border border-merah/30 bg-merah-muda px-3 py-2 text-sm text-merah">{pesanGalat(masuk.error)}</p>}
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={masuk.isPending}>{masuk.isPending ? 'Memeriksa...' : 'Masuk'}</Button>
      </form>
      <Link to="/" className="mt-6 text-center text-sm text-biru underline-offset-4 hover:underline">Ke halaman siswa</Link>
      </main>
    </div>
  );
}

function Kerangka({ profil }: { profil: ProfilStaf }) {
  const qc = useQueryClient();
  const lokasi = useLocation();
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [gantiSandi, setGantiSandi] = useState(false);
  const keluar = useMutation({
    mutationFn: () => api.post('/auth/keluar', { jenis: 'staf' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(['profil', 'staf'], null);
    },
  });
  const menu = MENU.filter((m) => m.peran.includes(profil.peran))
    .map((m) => ({ ...m, label: typeof m.label === 'string' ? m.label : (m.label[profil.peran] ?? '') }));
  const bolehHalaman = menu.some((m) => (m.akhir ? lokasi.pathname === m.ke : lokasi.pathname.startsWith(m.ke)));

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Menu admin">
      {menu.map(({ ke, label, ikon: Ikon, akhir }) => (
        <NavLink
          key={ke} to={ke} end={akhir}
          onClick={() => setMenuTerbuka(false)}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors',
            isActive ? 'bg-biru font-semibold text-white' : 'text-tinta hover:bg-muted',
          )}
        >
          <Ikon className="size-[18px]" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto border-r border-garis bg-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0',
        menuTerbuka ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex items-center justify-between gap-2 bg-biru px-4 py-3 text-white">
          <Merek kecil terang />
          <Button variant="kepala" size="icon-sm" className="lg:hidden" aria-label="Tutup menu" onClick={() => setMenuTerbuka(false)}><X /></Button>
        </div>
        <div className="p-3">{nav}</div>
        <div className="mt-auto border-t border-border p-3">
          <p className="px-3 font-semibold">{profil.nama}</p>
          <p className="px-3 text-xs text-muted-foreground">{LABEL_PERAN[profil.peran]} · {profil.username}</p>
          {profil.namaSekolah && <p className="px-3 text-xs font-semibold text-biru">{profil.namaSekolah}</p>}
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => setGantiSandi(true)}><Key /> Ganti kata sandi</Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => keluar.mutate()}><SignOut /> Keluar</Button>
        </div>
      </aside>
      {menuTerbuka && <button aria-label="Tutup menu" className="fixed inset-0 z-30 bg-tinta/40 lg:hidden" onClick={() => setMenuTerbuka(false)} />}

      <div className="min-w-0">
        <div className="sticky top-0 z-20 flex items-center gap-3 bg-biru px-4 py-2 text-white lg:hidden">
          <Button variant="kepalaGaris" size="icon-sm" aria-label="Buka menu" aria-expanded={menuTerbuka} onClick={() => setMenuTerbuka(true)}><List /></Button>
          <Merek kecil terang />
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {bolehHalaman ? <Outlet context={profil} /> : <Galat galat={new Error('Anda tidak punya akses ke halaman ini.')} />}
        </main>
      </div>
      <GantiSandi jenis="staf" buka={gantiSandi} setBuka={setGantiSandi} />
    </div>
  );
}
