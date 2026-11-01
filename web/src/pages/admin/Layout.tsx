import {
  Broadcast, CalendarCheck, ChartBar, ClipboardText, GearSix, House, Key, List, ListChecks, SignOut, Student, UsersThree, X,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { GantiSandi } from '@/components/GantiSandi';
import { Galat, Memuat } from '@/components/Keadaan';
import { Merek } from '@/components/Merek';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfilStaf } from '@/hooks/useProfil';
import { api, ApiError, pesanGalat } from '@/lib/api';
import type { ProfilStaf } from '@/lib/tipe';
import { cn } from '@/lib/utils';

const MENU = [
  { ke: '/admin', label: 'Beranda', ikon: House, akhir: true },
  { ke: '/admin/monitor', label: 'Monitor ujian', ikon: Broadcast },
  { ke: '/admin/soal', label: 'Bank soal', ikon: ClipboardText },
  { ke: '/admin/ujian', label: 'Jadwal ujian', ikon: CalendarCheck },
  { ke: '/admin/hasil', label: 'Hasil & analisis', ikon: ChartBar },
  { ke: '/admin/siswa', label: 'Data siswa', ikon: Student, admin: true },
  { ke: '/admin/pengguna', label: 'Guru & admin', ikon: UsersThree, admin: true },
  { ke: '/admin/pengaturan', label: 'Pengaturan', ikon: GearSix, admin: true },
  { ke: '/admin/log', label: 'Log aktivitas', ikon: ListChecks, admin: true },
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Merek />
      <form className="stiker mt-8 rounded-xl bg-white p-6 sm:p-8" onSubmit={(e) => { e.preventDefault(); masuk.mutate(); }}>
        <h1 className="text-2xl">Ruang guru</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kelola soal, jadwal, dan pantau ujian.</p>
        <div className="mt-6 space-y-1.5"><Label htmlFor="u">Username</Label><Input id="u" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
        <div className="mt-4 space-y-1.5"><Label htmlFor="p">Kata sandi</Label><Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {masuk.error && <p role="alert" className="mt-4 rounded-md bg-bata-muda px-3 py-2 text-sm font-bold text-bata">{pesanGalat(masuk.error)}</p>}
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={masuk.isPending}>{masuk.isPending ? 'Memeriksa...' : 'Masuk ke ruang guru'}</Button>
      </form>
      <Link to="/" className="mt-6 text-center text-sm font-bold text-jeruk-tua hover:underline">Ke halaman siswa</Link>
    </main>
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
  const menu = MENU.filter((m) => !m.admin || profil.peran === 'ADMIN');
  const bolehHalaman = menu.some((m) => (m.akhir ? lokasi.pathname === m.ke : lokasi.pathname.startsWith(m.ke)));

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Menu admin">
      {menu.map(({ ke, label, ikon: Ikon, akhir }) => (
        <NavLink
          key={ke} to={ke} end={akhir}
          onClick={() => setMenuTerbuka(false)}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-md px-3 py-2.5 font-bold transition-colors',
            isActive ? 'stiker-kecil bg-jeruk-muda text-tinta' : 'text-tinta hover:bg-muted',
          )}
        >
          <Ikon weight="bold" className="size-5" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r-2 border-tinta bg-kertas p-4 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0',
        menuTerbuka ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="mb-6 flex items-center justify-between gap-2">
          <Merek kecil />
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Tutup menu" onClick={() => setMenuTerbuka(false)}><X weight="bold" /></Button>
        </div>
        {nav}
        <div className="mt-6 border-t-2 border-border pt-4">
          <p className="px-3 font-bold">{profil.nama}</p>
          <p className="px-3 text-xs text-muted-foreground">{profil.peran === 'ADMIN' ? 'Admin' : 'Guru'} · {profil.username}</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => setGantiSandi(true)}><Key weight="bold" /> Ganti kata sandi</Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => keluar.mutate()}><SignOut weight="bold" /> Keluar</Button>
        </div>
      </aside>
      {menuTerbuka && <button aria-label="Tutup menu" className="fixed inset-0 z-30 bg-tinta/40 lg:hidden" onClick={() => setMenuTerbuka(false)} />}

      <div className="min-w-0">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-tinta bg-white px-4 py-2 lg:hidden">
          <Button variant="outline" size="icon-sm" aria-label="Buka menu" aria-expanded={menuTerbuka} onClick={() => setMenuTerbuka(true)}><List weight="bold" /></Button>
          <Merek kecil />
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {bolehHalaman ? <Outlet context={profil} /> : <Galat galat={new Error('Halaman ini hanya untuk admin.')} />}
        </main>
      </div>
      <GantiSandi jenis="staf" buka={gantiSandi} setBuka={setGantiSandi} />
    </div>
  );
}
