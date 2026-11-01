import { createBrowserRouter, Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { LayoutAdmin } from '@/pages/admin/Layout';
import { HalamanBeranda } from '@/pages/siswa/Beranda';
import { HalamanHasil } from '@/pages/siswa/Hasil';
import { HalamanUjian } from '@/pages/siswa/Ujian';

function TidakDitemukan() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-muted-foreground">Alamat yang Anda buka tidak ditemukan.</p>
      <Link to="/" className={buttonVariants({ className: 'mt-6' })}>Kembali ke beranda</Link>
    </main>
  );
}

// Halaman admin dimuat terpisah agar perangkat siswa tidak mengunduh kode admin.
const admin = (muat: () => Promise<{ default: React.ComponentType }>) => ({ lazy: async () => ({ Component: (await muat()).default }) });

export const router = createBrowserRouter([
  { path: '/', Component: HalamanBeranda },
  { path: '/ujian/:sesiId', Component: HalamanUjian },
  { path: '/hasil/:id', Component: HalamanHasil },
  {
    path: '/admin',
    Component: LayoutAdmin,
    children: [
      { index: true, ...admin(() => import('@/pages/admin/Dashboard')) },
      { path: 'monitor', ...admin(() => import('@/pages/admin/Monitor')) },
      { path: 'soal', ...admin(() => import('@/pages/admin/Soal')) },
      { path: 'ujian', ...admin(() => import('@/pages/admin/Ujian')) },
      { path: 'hasil', ...admin(() => import('@/pages/admin/Hasil')) },
      { path: 'siswa', ...admin(() => import('@/pages/admin/Siswa')) },
      { path: 'pengguna', ...admin(() => import('@/pages/admin/Pengguna')) },
      { path: 'pengaturan', ...admin(() => import('@/pages/admin/Pengaturan')) },
      { path: 'log', ...admin(() => import('@/pages/admin/Log')) },
    ],
  },
  { path: '*', Component: TidakDitemukan },
]);
