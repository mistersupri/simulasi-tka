import { ArrowClockwise, ArrowRight, Camera, CheckCircle, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { BilahKepala } from '@/components/Merek';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { aplikasi } from '@/lib/aplikasi';
import { jelaskanGalatKamera } from '@/lib/kamera';
import { bukaKameraDenganBatas, daftarKamera, jedaKamera, kameraInframerah, kameraPilihan, simpanKameraPilihan, videoHitam } from '@/lib/kameraPerangkat';
import { cn } from '@/lib/utils';

const KUNCI_SIAP = 'tka_siap';

/** Layar persiapan cukup sekali per menjalankan aplikasi; sessionStorage kosong lagi saat aplikasi ditutup. */
export function sudahSiap() {
  try { return sessionStorage.getItem(KUNCI_SIAP) === '1'; } catch { return false; }
}
export function tandaSiap() {
  try { sessionStorage.setItem(KUNCI_SIAP, '1'); } catch { /* tidak tersedia: layar muncul lagi */ }
}

type InfoServer = { namaInstansi: string; versi?: string };
type StatusTes = 'idle' | 'memuat' | 'ok' | 'hitam' | 'gagal';

const LABEL_MODE: Record<string, string> = {
  'standar': 'Standar (seperti Chrome)',
  'directshow': 'DirectShow (webcam lama)',
  'mf-tanpa-d3d11': 'Media Foundation tanpa akselerasi kamera',
  'tanpa-gpu': 'Tanpa akselerasi GPU',
};

/** Layar pertama aplikasi ujian: koneksi ke server, kecocokan versi, dan pemilihan kamera. */
export function PersiapanAplikasi({ onLanjut }: { onLanjut: () => void }) {
  const info = useQuery({
    queryKey: ['persiapan', 'server'],
    queryFn: async () => {
      const mulai = performance.now();
      const data = await api.get<InfoServer>('/info');
      return { data, ms: Math.round(performance.now() - mulai) };
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const versiApp = aplikasi?.versi ?? '';
  const versiServer = info.data?.data.versi ?? '';
  const versiCocok = !!versiApp && versiApp === versiServer;
  const siapLanjut = info.isSuccess && versiCocok;

  const [kamera, setKamera] = useState<{ id: string; nama: string }[]>([]);
  const [pilih, setPilih] = useState(() => kameraPilihan() ?? '');
  const [statusKamera, setStatusKamera] = useState<'belum' | 'memuat' | 'siap' | 'gagal'>('belum');
  const [pesanKamera, setPesanKamera] = useState('');
  const [tes, setTes] = useState<StatusTes>('idle');
  const [infoTes, setInfoTes] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mode = useQuery({
    queryKey: ['persiapan', 'mode-kamera'],
    queryFn: async () => (await aplikasi?.modeKamera?.()) ?? null,
    enabled: !!aplikasi?.modeKamera,
    staleTime: Infinity,
  });
  const [modeBaru, setModeBaru] = useState('');
  const [memulaiUlang, setMemulaiUlang] = useState(false);
  async function terapkanMode() {
    if (!modeBaru || !aplikasi?.gantiModeKamera) return;
    setMemulaiUlang(true);
    const ok = await aplikasi.gantiModeKamera(modeBaru).catch(() => false);
    if (!ok) {
      setMemulaiUlang(false);
      setPesanKamera('Mode kamera gagal disimpan. Coba lagi.');
    }
  }

  /** Izin kamera diminta sekali; setelah itu nama kamera terbaca dan bisa dipilih. */
  async function aktifkanKamera() {
    setStatusKamera('memuat');
    setPesanKamera('');
    try {
      const izin = await bukaKameraDenganBatas();
      izin.getTracks().forEach((t) => t.stop());
      await jedaKamera();
      const daftar = await daftarKamera();
      setKamera(daftar);
      if (!daftar.length) {
        setStatusKamera('gagal');
        setPesanKamera('Tidak ada kamera yang terdeteksi. Periksa kabel USB atau Device Manager.');
        return;
      }
      const tersimpan = kameraPilihan();
      const awal = tersimpan && daftar.some((d) => d.id === tersimpan) ? tersimpan : daftar[0].id;
      setPilih(awal);
      simpanKameraPilihan(awal);
      setStatusKamera('siap');
    } catch (err) {
      const statusOs = await aplikasi?.statusKamera?.().catch(() => null);
      const p = jelaskanGalatKamera(err as Error, { diAplikasi: !!aplikasi, statusOs });
      setStatusKamera('gagal');
      setPesanKamera(`${p.judul}. ${p.isi} (Kode: ${p.detail})`);
    }
  }

  function pilihKamera(id: string) {
    setPilih(id);
    simpanKameraPilihan(id);
    setTes('idle');
  }

  /** Menyalakan kamera yang dipilih selama dua detik untuk memastikan gambarnya tidak hitam. Dibatasi 12 detik. */
  async function tesKamera() {
    setTes('memuat');
    setPesanKamera('');
    setInfoTes('');
    let s: MediaStream | null = null;
    try {
      s = await bukaKameraDenganBatas({ deviceId: pilih }, 12000);
      const v = videoRef.current;
      if (!v) throw new Error('Pratinjau tidak tersedia.');
      v.srcObject = s;
      // Hitung bingkai yang benar-benar sampai ke aplikasi: 0 berarti kamera tidak mengirim gambar.
      let bingkai = 0;
      let hitungAktif = true;
      const hitung = () => {
        if (!hitungAktif) return;
        bingkai++;
        v.requestVideoFrameCallback?.(hitung);
      };
      v.requestVideoFrameCallback?.(hitung);
      await v.play().catch(() => {});
      await jedaKamera(2000);
      hitungAktif = false;
      const ukuran = s.getVideoTracks()[0]?.getSettings();
      setInfoTes(`Bingkai diterima: ${bingkai}. Ukuran: ${ukuran?.width ?? '?'}×${ukuran?.height ?? '?'}.${mode.data ? ` Mode: ${LABEL_MODE[mode.data.mode] ?? mode.data.mode}.` : ''}`);
      setTes(videoHitam(v) ? 'hitam' : 'ok');
    } catch (err) {
      setTes('gagal');
      setPesanKamera(err instanceof Error && err.message.startsWith('Timeout') ? 'Kamera tidak merespons dalam 12 detik.' : 'Kamera ini tidak bisa dibuka. Pilih kamera lain.');
    } finally {
      s?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }

  const okKamera = tes === 'ok' ? true : tes === 'hitam' || tes === 'gagal' || statusKamera === 'gagal' ? false : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <BilahKepala />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-8">
        <div>
          <h1 className="text-2xl">Persiapan ujian</h1>
          <p className="mt-1 text-sm text-muted-foreground">Periksa koneksi, versi aplikasi, dan kamera sebelum masuk.</p>
        </div>

        <Baris judul="Koneksi ke server" ok={info.isSuccess ? true : info.isError ? false : null}>
          {info.isPending && <p className="text-muted-foreground">Memeriksa koneksi...</p>}
          {info.isSuccess && <p>Terhubung ({info.data.ms} ms).</p>}
          {info.isError && (
            <>
              <p className="text-merah">
                {navigator.onLine
                  ? 'Tidak bisa menghubungi server sekolah. Pastikan server menyala dan komputer terhubung ke jaringan sekolah.'
                  : 'Komputer tidak tersambung ke jaringan.'}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => info.refetch()}><ArrowClockwise /> Periksa lagi</Button>
            </>
          )}
        </Baris>

        <Baris judul="Versi aplikasi" ok={info.isSuccess ? versiCocok : info.isError ? false : null}>
          {!info.isSuccess && <p className="text-muted-foreground">Menunggu koneksi ke server.</p>}
          {info.isSuccess && versiCocok && <p>Aplikasi {versiApp} sama dengan server.</p>}
          {info.isSuccess && !versiCocok && (
            <p className="text-merah">
              {versiServer
                ? `Aplikasi ${versiApp || '(tidak diketahui)'} berbeda dengan server ${versiServer}. Pasang aplikasi versi ${versiServer}.`
                : 'Server belum memberi tahu versinya. Perbarui server ke versi terbaru.'}
            </p>
          )}
        </Baris>

        <Baris judul="Kamera" ok={okKamera}>
          <p className="text-muted-foreground">Kamera hanya dipakai untuk ujian yang diawasi kamera. Bila belum dipilih, aplikasi memakai kamera bawaan.</p>
          {statusKamera !== 'siap' ? (
            <Button variant="outline" className="mt-3" onClick={aktifkanKamera} disabled={statusKamera === 'memuat'}>
              {statusKamera === 'memuat' ? <CircleNotch className="animate-spin" /> : <Camera />}
              {statusKamera === 'memuat' ? 'Menyiapkan kamera...' : 'Izinkan dan tampilkan daftar kamera'}
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pk-kamera">Kamera yang dipakai</Label>
                <Select value={pilih} onValueChange={pilihKamera}>
                  <SelectTrigger id="pk-kamera" className="w-full"><SelectValue placeholder="Pilih kamera" /></SelectTrigger>
                  <SelectContent>
                    {kamera.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.nama}{kameraInframerah(k.nama) ? ' (inframerah, biasanya untuk login wajah)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={tesKamera} disabled={tes === 'memuat' || !pilih}>
                  {tes === 'memuat' ? <CircleNotch className="animate-spin" /> : <Camera />} Tes kamera ini
                </Button>
                {tes === 'ok' && <span className="text-sm font-semibold text-hijau">Gambar terlihat.</span>}
                {tes === 'hitam' && <span className="text-sm font-semibold text-merah">Gambar hitam. Pilih kamera lain, atau periksa penutup lensa webcam.</span>}
                {infoTes && <span className="w-full text-xs text-muted-foreground">{infoTes}</span>}
                {tes === 'gagal' && <span className="text-sm font-semibold text-merah">{pesanKamera || 'Kamera ini tidak bisa dibuka. Pilih kamera lain.'}</span>}
              </div>
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Pratinjau kamera"
                className={cn('h-36 w-48 rounded-md bg-tinta object-cover -scale-x-100', tes === 'idle' && 'sr-only')}
              />
            </div>
          )}
          {mode.data && mode.data.daftar.length > 1 && (
            <div className="mt-4 space-y-1.5 border-t border-garis pt-4">
              <Label htmlFor="pk-mode">Mode kamera aplikasi</Label>
              <p className="text-xs text-muted-foreground">
                Bila tes menunjukkan <b>Bingkai diterima: 0</b> atau gambar hitam di semua kamera, pilih mode lain. Aplikasi akan mulai ulang; pilihan tersimpan di komputer ini.
              </p>
              <div className="flex flex-wrap gap-2">
                <Select value={modeBaru || mode.data.mode} onValueChange={setModeBaru}>
                  <SelectTrigger id="pk-mode" className="min-w-64 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mode.data.daftar.map((m) => (
                      <SelectItem key={m} value={m}>{LABEL_MODE[m] ?? m}{m === mode.data!.mode ? ' (sedang dipakai)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={terapkanMode} disabled={memulaiUlang || !modeBaru || modeBaru === mode.data.mode}>
                  {memulaiUlang ? <CircleNotch className="animate-spin" /> : <ArrowClockwise />} Terapkan & mulai ulang
                </Button>
              </div>
            </div>
          )}
          {pesanKamera && <p role="alert" className="mt-3 rounded-md border border-merah/30 bg-merah-muda px-3 py-2 text-merah">{pesanKamera}</p>}
        </Baris>

        <div className="mt-auto pt-4">
          <Button size="lg" className="w-full" disabled={!siapLanjut} onClick={onLanjut}>
            Lanjut <ArrowRight />
          </Button>
          {!siapLanjut && (
            <p className="mt-2 text-center text-sm text-muted-foreground">Tombol lanjut aktif setelah koneksi ke server dan versi aplikasi cocok.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function Baris({ judul, ok, children }: { judul: string; ok: boolean | null; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-garis bg-white p-5">
      <div className="flex items-center gap-2 font-semibold">
        {ok === null && <CircleNotch className="size-5 animate-spin text-muted-foreground" />}
        {ok === true && <CheckCircle weight="fill" className="size-5 text-hijau" />}
        {ok === false && <WarningCircle weight="fill" className="size-5 text-merah" />}
        {judul}
      </div>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}
