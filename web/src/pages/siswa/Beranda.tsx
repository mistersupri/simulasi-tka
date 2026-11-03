import {
  ArrowsOut, Camera, CheckCircle, Clock, Desktop, Key, ListNumbers, Megaphone, Monitor, Power, SignOut,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { InputSandi } from '@/components/InputSandi';
import { GantiSandi } from '@/components/GantiSandi';
import { PersiapanAplikasi, sudahSiap, tandaSiap } from '@/components/PersiapanAplikasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { BilahKepala } from '@/components/Merek';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfilSiswa } from '@/hooks/useProfil';
import { keluarLayarPenuh, layarPenuhDidukung, masukLayarPenuh } from '@/hooks/usePengawasan';
import { rekamLayarDidukung } from '@/hooks/useRekamLayar';
import { api, ApiError, pesanGalat } from '@/lib/api';
import { aplikasi } from '@/lib/aplikasi';
import { jelaskanGalatKamera } from '@/lib/kamera';
import { bukaKamera, daftarKamera } from '@/lib/kameraPerangkat';
import { formatTanggal } from '@/lib/format';
import type { PaketUjian, ProfilSiswa, Riwayat, StatusUjian, UjianSiswa } from '@/lib/tipe';

export function HalamanBeranda() {
  // Di aplikasi ujian, layar persiapan (koneksi, versi, kamera) tampil dulu sekali per menjalankan aplikasi.
  const [siap, setSiap] = useState(() => !aplikasi || sudahSiap());
  const profil = useProfilSiswa();
  if (!siap) return <PersiapanAplikasi onLanjut={() => { tandaSiap(); setSiap(true); }} />;
  if (profil.isPending) return <Memuat className="min-h-dvh" />;
  if (profil.error && !(profil.error instanceof ApiError && profil.error.status === 401)) {
    return <main className="mx-auto max-w-md px-4 py-20"><Galat galat={profil.error} ulangi={() => profil.refetch()} /></main>;
  }
  return profil.data ? <Beranda profil={profil.data} /> : <LoginSiswa />;
}

// ------------------------------------------------------------------
// Login
// ------------------------------------------------------------------

// Sekolah terakhir diingat per perangkat: komputer lab biasanya dipakai siswa dari sekolah yang sama.
const KUNCI_SEKOLAH = 'tka_sekolah';
const bacaSekolahTersimpan = () => {
  try { return localStorage.getItem(KUNCI_SEKOLAH) ?? ''; } catch { return ''; }
};

function LoginSiswa() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sekolahId, setSekolahId] = useState(bacaSekolahTersimpan);
  const sekolah = useQuery({ queryKey: ['sekolah-login'], queryFn: () => api.get<{ id: string; nama: string }[]>('/sekolah'), staleTime: 5 * 60_000 });
  // Pilihan sekolah hanya tampil bila ada lebih dari satu sekolah.
  const perluSekolah = (sekolah.data?.length ?? 0) > 1;
  const sekolahSah = sekolah.data?.some((s) => s.id === sekolahId) ? sekolahId : '';
  const masuk = useMutation({
    mutationFn: () => {
      if (perluSekolah && !sekolahSah) throw new Error('Pilih sekolah Anda terlebih dahulu.');
      return api.post<{ profil: ProfilSiswa }>('/auth/siswa/login', { username, password, sekolahId: perluSekolah ? sekolahSah : null });
    },
    onSuccess: (r) => {
      try { if (sekolahSah) localStorage.setItem(KUNCI_SEKOLAH, sekolahSah); } catch { /* penyimpanan diblokir: abaikan */ }
      qc.setQueryData(['profil', 'siswa'], r.profil);
    },
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <BilahKepala />
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
        <div className="w-full max-w-sm">
          <form
            className="rounded-xl border border-garis bg-white p-6 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              masuk.mutate();
            }}
          >
            <h1 className="text-xl">Masuk peserta ujian</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gunakan {perluSekolah ? 'sekolah, username, dan kata sandi' : 'username dan kata sandi'} yang tercantum pada kartu login.</p>
            {perluSekolah && (
              <div className="mt-6 space-y-1.5">
                <Label htmlFor="sekolah">Sekolah</Label>
                <Select value={sekolahSah} onValueChange={setSekolahId}>
                  <SelectTrigger id="sekolah" aria-label="Sekolah"><SelectValue placeholder="Pilih sekolah" /></SelectTrigger>
                  <SelectContent>{sekolah.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className={perluSekolah ? 'mt-4 space-y-1.5' : 'mt-6 space-y-1.5'}>
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="password">Kata sandi</Label>
              <InputSandi id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {masuk.error && <p role="alert" className="mt-4 rounded-md border border-merah/30 bg-merah-muda px-3 py-2 text-sm text-merah">{pesanGalat(masuk.error)}</p>}
            <Button type="submit" size="lg" className="mt-6 w-full" disabled={masuk.isPending}>
              {masuk.isPending ? 'Memeriksa akun...' : 'Masuk'}
            </Button>
            <p className="mt-4 text-center text-sm text-muted-foreground">Lupa kata sandi? Hubungi operator sekolah.</p>
          </form>
          {aplikasi ? (
            // Aplikasi ujian dipakai siswa di lab: tidak ada tautan ke ruang guru.
            <Button variant="ghost" className="mt-4 w-full" onClick={() => aplikasi?.keluar()}><Power /> Tutup aplikasi</Button>
          ) : (
            <p className="mt-6 text-center text-sm">
              <Link to="/admin" className="text-biru underline-offset-4 hover:underline">Masuk sebagai petugas (operator, guru, admin)</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------
// Beranda
// ------------------------------------------------------------------

type DataBeranda = { pengumuman: string; diAplikasi: boolean; ujian: UjianSiswa[]; riwayat: Riwayat[] };

const STATUS: Record<StatusUjian, { label: string; varian: 'hijau' | 'kuning' | 'default' | 'merah' | 'biru' }> = {
  TERSEDIA: { label: 'Dapat dikerjakan', varian: 'hijau' },
  BERLANGSUNG: { label: 'Sedang dikerjakan', varian: 'kuning' },
  SELESAI: { label: 'Selesai', varian: 'default' },
  BELUM_DIBUKA: { label: 'Belum dibuka', varian: 'biru' },
  DITUTUP: { label: 'Sudah ditutup', varian: 'merah' },
};

function Beranda({ profil }: { profil: ProfilSiswa }) {
  const qc = useQueryClient();
  const [gantiSandi, setGantiSandi] = useState(false);
  const [dipilih, setDipilih] = useState<UjianSiswa | null>(null);
  const data = useQuery({ queryKey: ['beranda'], queryFn: () => api.get<DataBeranda>('/siswa/beranda') });
  const keluar = useMutation({
    mutationFn: () => api.post('/auth/keluar', { jenis: 'siswa' }),
    onSettled: () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'profil' && q.queryKey[0] !== 'info' });
      qc.setQueryData(['profil', 'siswa'], null);
    },
  });

  return (
    <div className="min-h-dvh">
      <BilahKepala>
        {profil.bolehGantiPassword && (
          <Button variant="kepala" size="sm" onClick={() => setGantiSandi(true)}>
            <Key /> <span className="hidden sm:inline">Ganti kata sandi</span>
          </Button>
        )}
        <Button variant="kepalaGaris" size="sm" onClick={() => keluar.mutate()} disabled={keluar.isPending}>
          <SignOut /> Keluar
        </Button>
        {aplikasi && (
          <Button variant="kepala" size="sm" onClick={() => aplikasi?.keluar()} aria-label="Tutup aplikasi">
            <Power /> <span className="hidden sm:inline">Tutup aplikasi</span>
          </Button>
        )}
      </BilahKepala>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16">
        <h1 className="text-2xl">Selamat datang, {profil.nama}</h1>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {profil.namaSekolah && <div className="flex gap-1.5"><dt className="text-muted-foreground">Sekolah</dt><dd className="font-medium">{profil.namaSekolah}</dd></div>}
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Kelas</dt><dd className="font-medium">{profil.kelas}</dd></div>
          {profil.nisn && <div className="flex gap-1.5"><dt className="text-muted-foreground">NISN</dt><dd className="font-medium">{profil.nisn}</dd></div>}
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Username</dt><dd className="font-medium">{profil.username}</dd></div>
        </dl>

        {data.data?.pengumuman && (
          <section aria-labelledby="judul-pengumuman" className="mt-6 flex gap-3 rounded-lg border border-biru/20 bg-biru-muda p-4">
            <Megaphone className="mt-0.5 size-5 shrink-0 text-biru" />
            <div>
              <h2 id="judul-pengumuman" className="text-sm font-semibold text-biru">Pengumuman</h2>
              <p className="mt-1 whitespace-pre-line">{data.data.pengumuman}</p>
            </div>
          </section>
        )}

        <h2 className="mt-10 text-lg">Daftar ujian</h2>
        <div className="mt-4">
          {data.isPending ? <Memuat teks="Memuat daftar ujian..." />
            : data.error ? <Galat galat={data.error} ulangi={() => data.refetch()} />
            : !data.data.ujian.length ? <Kosong judul="Belum ada ujian untuk kelas Anda.">Ujian akan tampil di sini setelah dijadwalkan oleh guru.</Kosong>
            : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.data.ujian.map((u) => <KartuUjian key={u.id} ujian={u} diAplikasi={data.data.diAplikasi} pilih={() => setDipilih(u)} />)}
              </div>
            )}
        </div>

        <h2 className="mt-10 text-lg">Riwayat nilai</h2>
        <div className="mt-4">
          {data.data && (data.data.riwayat.length ? <DaftarRiwayat riwayat={data.data.riwayat} /> : <Kosong judul="Belum ada riwayat.">Nilai tampil di sini setelah Anda menyelesaikan ujian.</Kosong>)}
        </div>
      </main>

      <GantiSandi jenis="siswa" buka={gantiSandi} setBuka={setGantiSandi} />
      <DialogMulai ujian={dipilih} tutup={() => setDipilih(null)} />
    </div>
  );
}

function KartuUjian({ ujian: u, diAplikasi, pilih }: { ujian: UjianSiswa; diAplikasi: boolean; pilih: () => void }) {
  const perluAplikasi = u.wajibAplikasi && !diAplikasi;
  // HP/tablet tidak bisa membagikan layar.
  const perluKomputer = !perluAplikasi && u.rekamLayar && !rekamLayarDidukung();
  const s = perluAplikasi && u.status === 'TERSEDIA' ? { label: 'Khusus komputer lab', varian: 'biru' as const } : STATUS[u.status];
  const bisa = (u.status === 'TERSEDIA' || u.status === 'BERLANGSUNG') && !perluAplikasi && !perluKomputer;
  return (
    <article className="flex flex-col rounded-lg border border-garis bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={s.varian}>{s.label}</Badge>
        <span className="truncate text-sm font-semibold text-muted-foreground">{u.mataPelajaran}</span>
      </div>
      <h3 className="mt-3 text-lg">{u.nama}</h3>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center gap-2"><ListNumbers className="size-4" /> {u.jumlahSoal} soal</li>
        <li className="flex items-center gap-2"><Clock className="size-4" /> {u.durasiMenit ? `${u.durasiMenit} menit` : 'Tanpa batas waktu'}</li>
        {u.wajibLayarPenuh && <li className="flex items-center gap-2"><ArrowsOut className="size-4" /> Layar penuh</li>}
        {u.wajibKamera && <li className="flex items-center gap-2"><Camera className="size-4" /> Diawasi kamera</li>}
        {u.wajibAplikasi && <li className="flex items-center gap-2"><Desktop className="size-4" /> Hanya lewat aplikasi ujian</li>}
        {u.rekamLayar && <li className="flex items-center gap-2"><Monitor className="size-4" /> Layar direkam</li>}
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
        <p className="flex items-center gap-2 font-semibold text-hijau"><CheckCircle weight="fill" className="size-5" /> Sudah dikerjakan</p>
      ) : perluKomputer ? (
        <p className="flex items-start gap-2 rounded-md bg-biru-muda px-3 py-2.5 text-sm font-semibold text-biru-tua">
          <Monitor className="mt-0.5 size-5 shrink-0" /> Ujian ini merekam layar dan hanya dapat dikerjakan di komputer atau laptop.
        </p>
      ) : perluAplikasi ? (
        <p className="flex items-start gap-2 rounded-md bg-biru-muda px-3 py-2.5 text-sm font-semibold text-biru-tua">
          <Desktop className="mt-0.5 size-5 shrink-0" /> Ujian ini dikerjakan di komputer lab sekolah melalui aplikasi Ujian TKA.
        </p>
      ) : (
        <Button variant={u.status === 'BERLANGSUNG' ? 'kuning' : 'default'} size="lg" disabled={!bisa} onClick={pilih}>
          {u.status === 'BERLANGSUNG' ? 'Lanjutkan ujian' : bisa ? 'Mulai ujian' : s.label}
        </Button>
      )}
    </article>
  );
}

function DaftarRiwayat({ riwayat }: { riwayat: Riwayat[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
      {riwayat.map((h) => (
        <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{h.namaUjian}</p>
            <p className="text-sm text-muted-foreground">{formatTanggal(h.tanggal)}</p>
          </div>
          {h.nilai === null ? <span className="text-sm text-muted-foreground">Nilai diumumkan guru</span> : (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums">{h.nilai}</span>
              {h.tuntas !== null && <Badge variant={h.tuntas ? 'hijau' : 'merah'}>{h.tuntas ? 'Tuntas' : 'Belum tuntas'}</Badge>}
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
      // Kamera dicek SEBELUM ujian dimulai: bila bermasalah, waktu ujian belum berjalan dan penyebabnya jelas.
      if (u.wajibKamera) {
        try {
          // Lolos bila salah satu kamera bisa dibuka (kamera bawaan bisa saja kamera inframerah yang gagal).
          let galatKamera: unknown;
          let terbuka = false;
          const id: (string | undefined)[] = [undefined];
          for (let i = 0; i < id.length && !terbuka; i++) {
            try {
              const tes = await bukaKamera({ deviceId: id[i] });
              if (i === 0) id.push(...(await daftarKamera(tes.getVideoTracks()[0]?.getSettings().deviceId)).map((d) => d.id));
              tes.getTracks().forEach((t) => t.stop());
              terbuka = true;
            } catch (e) {
              galatKamera ??= e;
              if (i === 0) id.push(...(await daftarKamera()).map((d) => d.id));
            }
          }
          if (!terbuka) throw galatKamera;
        } catch (err) {
          keluarLayarPenuh();
          const statusOs = await aplikasi?.statusKamera?.().catch(() => null);
          const p = jelaskanGalatKamera(err as Error, { diAplikasi: !!aplikasi, statusOs });
          throw new Error(`${p.judul}. ${p.isi} (Kode: ${p.detail})`);
        }
      }
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
              <p className="font-semibold">Tata tertib ujian:</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                <li>Waktu mulai berjalan setelah Anda menekan tombol di bawah.</li>
                <li>Jawaban tersimpan otomatis. Bila koneksi terputus, masuk kembali lalu pilih <b>Lanjutkan ujian</b>.</li>
                {u.wajibLayarPenuh && (
                  <li>
                    Ujian tampil <b>layar penuh</b>. Keluar dari layar penuh atau membuka aplikasi lain dicatat sebagai pelanggaran.
                    {!layarPenuhDidukung() && <span className="text-merah"> Perangkat Anda tidak mendukung layar penuh; berpindah aplikasi tetap dicatat.</span>}
                  </li>
                )}
                {u.rekamLayar && (
                  <li>
                    <b>Layar Anda direkam</b> secara berkala selama ujian dan saat terjadi pelanggaran.
                    {!aplikasi && ' Anda akan diminta membagikan "Seluruh layar". Menghentikan berbagi layar dicatat sebagai pelanggaran.'}
                    {' '}Tutup aplikasi dan tab lain yang bersifat pribadi sebelum mulai.
                  </li>
                )}
                {u.wajibKamera && <li><b>Kamera</b> akan menyala untuk memastikan wajah Anda terlihat. Video tidak direkam; hanya foto saat ada pelanggaran.</li>}
                <li>Teks soal tidak bisa disalin.</li>
              </ul>
              {u.perluToken && !lanjut && (
                <div className="mt-5 space-y-1.5">
                  <Label htmlFor="token">Token ujian</Label>
                  <Input id="token" value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="Minta token dari pengawas"
                    autoComplete="off" className="text-lg font-semibold tracking-[0.2em] uppercase" required />
                </div>
              )}
              {mulai.error && <p role="alert" className="mt-4 rounded-md bg-merah-muda px-3 py-2 text-sm font-semibold text-merah">{pesanGalat(mulai.error)}</p>}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={tutup}>Batal</Button>
              <Button type="submit" variant={lanjut ? 'kuning' : 'default'} disabled={mulai.isPending}>
                {mulai.isPending ? 'Menyiapkan soal...' : lanjut ? 'Lanjutkan ujian' : 'Mulai ujian'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
