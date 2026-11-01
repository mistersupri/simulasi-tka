import {
  ArrowsOut, Camera, CheckCircle, Clock, Desktop, Key, ListNumbers, Megaphone, Power, SignOut,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { GantiSandi } from '@/components/GantiSandi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Merek } from '@/components/Merek';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfilSiswa } from '@/hooks/useProfil';
import { layarPenuhDidukung, masukLayarPenuh } from '@/hooks/usePengawasan';
import { api, ApiError, pesanGalat } from '@/lib/api';
import { aplikasi } from '@/lib/aplikasi';
import { formatTanggal } from '@/lib/format';
import type { PaketUjian, ProfilSiswa, Riwayat, StatusUjian, UjianSiswa } from '@/lib/tipe';
import { cn } from '@/lib/utils';

export function HalamanBeranda() {
  const profil = useProfilSiswa();
  if (profil.isPending) return <Memuat className="min-h-dvh" />;
  if (profil.error && !(profil.error instanceof ApiError && profil.error.status === 401)) {
    return <main className="mx-auto max-w-md px-4 py-20"><Galat galat={profil.error} ulangi={() => profil.refetch()} /></main>;
  }
  return profil.data ? <Beranda profil={profil.data} /> : <LoginSiswa />;
}

// ------------------------------------------------------------------
// Login
// ------------------------------------------------------------------

function LoginSiswa() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const masuk = useMutation({
    mutationFn: () => api.post<{ profil: ProfilSiswa }>('/auth/siswa/login', { username, password }),
    onSuccess: (r) => qc.setQueryData(['profil', 'siswa'], r.profil),
  });

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:px-8">
      <section>
        <Merek />
        <h1 className="mt-8 text-4xl leading-[1.1] sm:text-5xl">
          Latihan TKA,<br />
          <span className="text-jeruk">siap ujian!</span>
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">
          Masuk dengan username dan kata sandi dari kartu login yang dibagikan gurumu.
        </p>
      </section>

      <section className="relative">
        {/* Selotip kuning: gestur "ditempel di buku kerja", motif identitas aplikasi. */}
        <div aria-hidden className="absolute -top-3 left-1/2 z-10 h-6 w-28 -translate-x-1/2 -rotate-3 rounded-sm bg-matahari/90" />
        <form
          className="stiker relative rounded-xl bg-white p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            masuk.mutate();
          }}
        >
          <h2 className="text-2xl">Masuk</h2>
          <div className="mt-6 space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="password">Kata sandi</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {masuk.error && <p role="alert" className="mt-4 rounded-md bg-bata-muda px-3 py-2 text-sm font-bold text-bata">{pesanGalat(masuk.error)}</p>}
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={masuk.isPending}>
            {masuk.isPending ? 'Memeriksa akun...' : 'Masuk ke ujian'}
          </Button>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Lupa kata sandi? Minta guru mengatur ulang.
          </p>
        </form>
        {aplikasi ? (
          // Aplikasi ujian dipakai siswa di lab: tidak ada tautan ke ruang guru.
          <Button variant="ghost" className="mt-4 w-full" onClick={() => aplikasi?.keluar()}><Power weight="bold" /> Tutup aplikasi</Button>
        ) : (
          <p className="mt-6 text-center text-sm">
            <Link to="/admin" className="font-bold text-jeruk-tua underline-offset-4 hover:underline">Masuk sebagai guru atau admin</Link>
          </p>
        )}
      </section>
    </main>
  );
}

// ------------------------------------------------------------------
// Beranda
// ------------------------------------------------------------------

type DataBeranda = { pengumuman: string; diAplikasi: boolean; ujian: UjianSiswa[]; riwayat: Riwayat[] };

const STATUS: Record<StatusUjian, { label: string; varian: 'daun' | 'matahari' | 'default' | 'bata' | 'jeruk' }> = {
  TERSEDIA: { label: 'Bisa dikerjakan', varian: 'daun' },
  BERLANGSUNG: { label: 'Sedang dikerjakan', varian: 'matahari' },
  SELESAI: { label: 'Selesai', varian: 'default' },
  BELUM_DIBUKA: { label: 'Belum dibuka', varian: 'jeruk' },
  DITUTUP: { label: 'Sudah ditutup', varian: 'bata' },
};

function Beranda({ profil }: { profil: ProfilSiswa }) {
  const qc = useQueryClient();
  const [gantiSandi, setGantiSandi] = useState(false);
  const [dipilih, setDipilih] = useState<UjianSiswa | null>(null);
  const data = useQuery({ queryKey: ['beranda'], queryFn: () => api.get<DataBeranda>('/siswa/beranda') });
  const keluar = useMutation({
    mutationFn: () => api.post('/auth/keluar', { jenis: 'siswa' }),
    onSettled: () => {
      qc.setQueryData(['profil', 'siswa'], null);
      qc.removeQueries({ queryKey: ['beranda'] });
    },
  });
  const namaDepan = profil.nama.split(' ')[0];

  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-tinta bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Merek kecil />
          <div className="flex shrink-0 gap-2">
            {profil.bolehGantiPassword && (
              <Button variant="ghost" size="sm" onClick={() => setGantiSandi(true)}>
                <Key weight="bold" /> <span className="hidden sm:inline">Ganti sandi</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => keluar.mutate()} disabled={keluar.isPending}>
              <SignOut weight="bold" /> Keluar
            </Button>
            {aplikasi && (
              <Button variant="ghost" size="sm" onClick={() => aplikasi?.keluar()} aria-label="Tutup aplikasi">
                <Power weight="bold" /> <span className="hidden sm:inline">Tutup aplikasi</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16">
        <h1 className="text-3xl sm:text-4xl">Halo, {namaDepan}!</h1>
        <p className="mt-1 text-muted-foreground">Kelas {profil.kelas} · {profil.username}</p>

        {data.data?.pengumuman && (
          <div className="mt-6 flex gap-3 rounded-lg border-2 border-tinta bg-matahari-muda p-4">
            <Megaphone weight="bold" className="mt-0.5 size-6 shrink-0" />
            <p className="whitespace-pre-line">{data.data.pengumuman}</p>
          </div>
        )}

        <h2 className="mt-10 text-2xl">Ujian untukmu</h2>
        <div className="mt-4">
          {data.isPending ? <Memuat teks="Memuat daftar ujian..." />
            : data.error ? <Galat galat={data.error} ulangi={() => data.refetch()} />
            : !data.data.ujian.length ? <Kosong judul="Belum ada ujian untuk kelasmu.">Tunggu informasi dari gurumu, lalu tekan muat ulang.</Kosong>
            : (
              <div className="grid gap-5 sm:grid-cols-2">
                {data.data.ujian.map((u) => <KartuUjian key={u.id} ujian={u} diAplikasi={data.data.diAplikasi} pilih={() => setDipilih(u)} />)}
              </div>
            )}
        </div>

        <h2 className="mt-12 text-2xl">Riwayat nilai</h2>
        <div className="mt-4">
          {data.data && (data.data.riwayat.length ? <DaftarRiwayat riwayat={data.data.riwayat} /> : <Kosong judul="Belum ada riwayat.">Nilai muncul di sini setelah kamu menyelesaikan ujian.</Kosong>)}
        </div>
      </main>

      <GantiSandi jenis="siswa" buka={gantiSandi} setBuka={setGantiSandi} />
      <DialogMulai ujian={dipilih} tutup={() => setDipilih(null)} />
    </div>
  );
}

function KartuUjian({ ujian: u, diAplikasi, pilih }: { ujian: UjianSiswa; diAplikasi: boolean; pilih: () => void }) {
  const perluAplikasi = u.wajibAplikasi && !diAplikasi;
  const s = perluAplikasi && u.status === 'TERSEDIA' ? { label: 'Khusus komputer lab', varian: 'jeruk' as const } : STATUS[u.status];
  const bisa = (u.status === 'TERSEDIA' || u.status === 'BERLANGSUNG') && !perluAplikasi;
  return (
    <article className={cn('flex flex-col rounded-xl bg-white p-5', bisa ? 'stiker' : 'border-2 border-border')}>
      <div className="flex items-center justify-between gap-2">
        <Badge variant={s.varian}>{s.label}</Badge>
        <span className="truncate text-sm font-bold text-muted-foreground">{u.mataPelajaran}</span>
      </div>
      <h3 className="mt-3 text-xl">{u.nama}</h3>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center gap-2"><ListNumbers weight="bold" className="size-4" /> {u.jumlahSoal} soal</li>
        <li className="flex items-center gap-2"><Clock weight="bold" className="size-4" /> {u.durasiMenit ? `${u.durasiMenit} menit` : 'Tanpa batas waktu'}</li>
        {u.wajibLayarPenuh && <li className="flex items-center gap-2"><ArrowsOut weight="bold" className="size-4" /> Layar penuh</li>}
        {u.wajibKamera && <li className="flex items-center gap-2"><Camera weight="bold" className="size-4" /> Diawasi kamera</li>}
        {u.wajibAplikasi && <li className="flex items-center gap-2"><Desktop weight="bold" className="size-4" /> Hanya lewat aplikasi ujian</li>}
        {(u.waktuMulai || u.waktuSelesai) && (
          <li className="text-muted-foreground">
            {u.waktuMulai && <>Dibuka {formatTanggal(u.waktuMulai)}</>}
            {u.waktuMulai && u.waktuSelesai && <br />}
            {u.waktuSelesai && <>Ditutup {formatTanggal(u.waktuSelesai)}</>}
          </li>
        )}
      </ul>
      <div className="mt-5 flex-1" />
      {u.status === 'SELESAI' ? (
        <p className="flex items-center gap-2 font-bold text-daun"><CheckCircle weight="fill" className="size-5" /> Sudah kamu kerjakan</p>
      ) : perluAplikasi ? (
        <p className="flex items-start gap-2 rounded-md bg-jeruk-muda px-3 py-2.5 text-sm font-bold text-jeruk-tua">
          <Desktop weight="bold" className="mt-0.5 size-5 shrink-0" /> Kerjakan di komputer lab sekolah lewat aplikasi Ujian TKA.
        </p>
      ) : (
        <Button variant={u.status === 'BERLANGSUNG' ? 'matahari' : 'default'} size="lg" disabled={!bisa} onClick={pilih}>
          {u.status === 'BERLANGSUNG' ? 'Lanjutkan ujian' : bisa ? 'Mulai ujian' : s.label}
        </Button>
      )}
    </article>
  );
}

function DaftarRiwayat({ riwayat }: { riwayat: Riwayat[] }) {
  return (
    <ul className="divide-y-2 divide-border overflow-hidden rounded-lg border-2 border-border bg-white">
      {riwayat.map((h) => (
        <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{h.namaUjian}</p>
            <p className="text-sm text-muted-foreground">{formatTanggal(h.tanggal)}</p>
          </div>
          {h.nilai === null ? <span className="text-sm text-muted-foreground">Nilai diumumkan guru</span> : (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold tabular-nums">{h.nilai}</span>
              {h.tuntas !== null && <Badge variant={h.tuntas ? 'daun' : 'bata'}>{h.tuntas ? 'Tuntas' : 'Belum tuntas'}</Badge>}
            </div>
          )}
          {h.adaPembahasan && <Link to={`/hasil/${h.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Lihat pembahasan</Link>}
        </li>
      ))}
    </ul>
  );
}

function DialogMulai({ ujian, tutup }: { ujian: UjianSiswa | null; tutup: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const mulai = useMutation({
    mutationFn: async (u: UjianSiswa) => {
      // Layar penuh harus diminta langsung dari klik tombol (aturan browser).
      if (u.wajibLayarPenuh) await masukLayarPenuh();
      return api.post<PaketUjian>(`/siswa/ujian/${u.id}/mulai`, { token });
    },
    onSuccess: (paket) => {
      qc.setQueryData(['sesi', paket.sesiId], paket);
      setToken('');
      tutup();
      navigate(`/ujian/${paket.sesiId}`);
    },
  });
  const u = ujian;
  const lanjut = u?.status === 'BERLANGSUNG';

  return (
    <Dialog open={!!u} onOpenChange={(b) => !b && (mulai.reset(), tutup())}>
      <DialogContent>
        {u && (
          <form onSubmit={(e) => { e.preventDefault(); mulai.mutate(u); }}>
            <DialogHeader>
              <DialogTitle>{u.nama}</DialogTitle>
              <DialogDescription>{u.mataPelajaran} · {u.jumlahSoal} soal · {u.durasiMenit ? `${u.durasiMenit} menit` : 'tanpa batas waktu'}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p className="font-bold">Sebelum mulai, baca dulu:</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                <li>Waktu berjalan setelah kamu menekan tombol di bawah.</li>
                <li>Jawaban tersimpan otomatis. Bila koneksi putus, masuk lagi lalu pilih <b>Lanjutkan ujian</b>.</li>
                {u.wajibLayarPenuh && (
                  <li>
                    Ujian tampil <b>layar penuh</b>. Keluar dari layar penuh atau membuka aplikasi lain dicatat sebagai pelanggaran.
                    {!layarPenuhDidukung() && <span className="text-bata"> Perangkatmu tidak mendukung layar penuh; pindah aplikasi tetap dicatat.</span>}
                  </li>
                )}
                {u.wajibKamera && <li><b>Kamera</b> akan menyala untuk memastikan wajahmu terlihat. Video tidak direkam; hanya foto saat ada pelanggaran.</li>}
                <li>Teks soal tidak bisa disalin.</li>
              </ul>
              {u.perluToken && !lanjut && (
                <div className="mt-5 space-y-1.5">
                  <Label htmlFor="token">Token ujian</Label>
                  <Input id="token" value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="Minta token dari pengawas"
                    autoComplete="off" className="text-lg font-extrabold tracking-[0.2em] uppercase" required />
                </div>
              )}
              {mulai.error && <p role="alert" className="mt-4 rounded-md bg-bata-muda px-3 py-2 text-sm font-bold text-bata">{pesanGalat(mulai.error)}</p>}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={tutup}>Batal</Button>
              <Button type="submit" variant={lanjut ? 'matahari' : 'default'} disabled={mulai.isPending}>
                {mulai.isPending ? 'Menyiapkan soal...' : lanjut ? 'Lanjutkan ujian' : 'Mulai sekarang'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
