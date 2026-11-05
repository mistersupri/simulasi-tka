import { ArrowClockwise, ArrowRight, CheckCircle, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BilahKepala } from '@/components/Merek';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { aplikasi } from '@/lib/aplikasi';
import { jelaskanGalatKamera } from '@/lib/kamera';
import { bukaKameraDenganBatas, daftarKamera, jedaKamera, kameraInframerah, kameraPilihan, simpanKameraPilihan, videoHitam } from '@/lib/kameraPerangkat';

const KUNCI_SIAP = 'tka_siap';

/** Layar persiapan cukup sekali per menjalankan aplikasi; sessionStorage kosong lagi saat aplikasi ditutup. */
export function sudahSiap() {
  try { return sessionStorage.getItem(KUNCI_SIAP) === '1'; } catch { return false; }
}
export function tandaSiap() {
  try { sessionStorage.setItem(KUNCI_SIAP, '1'); } catch { /* tidak tersedia: layar muncul lagi */ }
}

type InfoServer = { namaInstansi: string; versi?: string };
type StatusPratinjau = 'mati' | 'memuat' | 'ok' | 'hitam' | 'gagal';
type StatusPembaruan =
  | { tahap: 'diam' | 'cek' | 'pasang' | 'tidak-didukung' }
  | { tahap: 'unduh'; persen: number }
  | { tahap: 'gagal'; pesan: string };

async function pesanGalatKamera(err: unknown) {
  const statusOs = await aplikasi?.statusKamera?.().catch(() => null);
  const p = jelaskanGalatKamera(err as Error, { diAplikasi: !!aplikasi, statusOs });
  return `${p.judul}. ${p.isi} (Kode: ${p.detail})`;
}

/** Layar pertama aplikasi ujian: koneksi ke server, kecocokan versi, dan kamera yang dipakai beserta pratinjaunya. */
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

  // ---------------- Pembaruan otomatis ----------------
  // Versi berbeda dengan server: unduh installer dari server sekolah, pasang diam-diam, aplikasi mulai ulang.
  const [pembaruan, setPembaruan] = useState<StatusPembaruan>({ tahap: 'diam' });
  const [ulangPembaruan, setUlangPembaruan] = useState(0);
  const perluPembaruan = info.isSuccess && !!versiServer && !versiCocok;
  useEffect(() => {
    if (!perluPembaruan) return;
    const p = aplikasi?.pembaruan;
    if (!p) {
      setPembaruan({ tahap: 'tidak-didukung' });
      return;
    }
    let batal = false;
    const lepas = p.padaProgres((persen) => {
      if (!batal) setPembaruan((s) => (s.tahap === 'unduh' ? { tahap: 'unduh', persen } : s));
    });
    (async () => {
      setPembaruan({ tahap: 'cek' });
      const cek = await p.cek().catch((e: unknown) => ({ didukung: true, galat: String(e), versi: null, ada: false }));
      if (batal) return;
      if (!cek.didukung) return setPembaruan({ tahap: 'tidak-didukung' });
      if (cek.galat || !cek.versi) return setPembaruan({ tahap: 'gagal', pesan: 'Installer aplikasi belum tersedia di server.' });
      if (cek.versi !== versiServer) {
        return setPembaruan({ tahap: 'gagal', pesan: `Server menyediakan installer ${cek.versi}, bukan ${versiServer}.` });
      }
      setPembaruan({ tahap: 'unduh', persen: 0 });
      const u = await p.unduh().catch((e: unknown) => ({ ok: false, galat: String(e) }));
      if (batal) return;
      if (!u.ok) return setPembaruan({ tahap: 'gagal', pesan: `Pembaruan gagal diunduh${u.galat ? `: ${u.galat}` : '.'}` });
      setPembaruan({ tahap: 'pasang' });
      await new Promise((r) => setTimeout(r, 1500));
      if (!batal && !(await p.pasang().catch(() => false))) {
        setPembaruan({ tahap: 'gagal', pesan: 'Pembaruan tidak bisa dipasang sekarang.' });
      }
    })();
    return () => {
      batal = true;
      lepas();
    };
  }, [perluPembaruan, versiServer, ulangPembaruan]);

  // ---------------- Kamera ----------------
  const [kamera, setKamera] = useState<{ id: string; nama: string }[]>([]);
  const [pilih, setPilih] = useState(() => kameraPilihan() ?? '');
  const [memuatDaftar, setMemuatDaftar] = useState(true);
  const [galatDaftar, setGalatDaftar] = useState('');
  const [pratinjau, setPratinjau] = useState<StatusPratinjau>('mati');
  const [galatPratinjau, setGalatPratinjau] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /** Izin kamera diminta sekali agar nama kamera terbaca, lalu daftar kamera dimuat. */
  const muatDaftar = useCallback(async () => {
    setMemuatDaftar(true);
    setGalatDaftar('');
    try {
      const izin = await bukaKameraDenganBatas();
      izin.getTracks().forEach((t) => t.stop());
      await jedaKamera();
      const daftar = await daftarKamera();
      setKamera(daftar);
      if (!daftar.length) {
        setGalatDaftar('Tidak ada kamera yang terdeteksi. Periksa kabel USB atau Device Manager.');
        return;
      }
      const tersimpan = kameraPilihan();
      const awal = tersimpan && daftar.some((d) => d.id === tersimpan) ? tersimpan : daftar[0].id;
      setPilih(awal);
      simpanKameraPilihan(awal);
    } catch (err) {
      setGalatDaftar(await pesanGalatKamera(err));
    } finally {
      setMemuatDaftar(false);
    }
  }, []);

  useEffect(() => {
    void muatDaftar();
  }, [muatDaftar]);

  // Pratinjau langsung untuk kamera yang dipilih; berganti saat pilihan berganti, mati saat layar ditinggalkan.
  const [ulangPratinjau, setUlangPratinjau] = useState(0);
  const adaPilihan = kamera.some((k) => k.id === pilih);
  useEffect(() => {
    if (!adaPilihan) return;
    let berhenti = false;
    let stream: MediaStream | null = null;
    (async () => {
      setPratinjau('memuat');
      setGalatPratinjau('');
      try {
        stream = await bukaKameraDenganBatas({ deviceId: pilih });
        if (berhenti) return;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => {});
        await jedaKamera(2000);
        if (!berhenti) setPratinjau(videoHitam(v) ? 'hitam' : 'ok');
      } catch (err) {
        if (berhenti) return;
        setPratinjau('gagal');
        setGalatPratinjau(await pesanGalatKamera(err));
      }
    })();
    return () => {
      berhenti = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [pilih, adaPilihan, ulangPratinjau]);

  function pilihKamera(id: string) {
    setPilih(id);
    simpanKameraPilihan(id);
  }

  const okKamera = pratinjau === 'ok' ? true : pratinjau === 'hitam' || pratinjau === 'gagal' || !!galatDaftar ? false : null;

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
          {info.isSuccess && !versiCocok && !versiServer && (
            <p className="text-merah">Server belum memberi tahu versinya. Perbarui server ke versi terbaru.</p>
          )}
          {perluPembaruan && (
            <div className="space-y-2">
              <p>Aplikasi {versiApp || '(tidak diketahui)'} berbeda dengan server {versiServer}.</p>
              {pembaruan.tahap === 'cek' && <p className="text-muted-foreground">Memeriksa pembaruan di server...</p>}
              {pembaruan.tahap === 'unduh' && (
                <div>
                  <p>Mengunduh pembaruan versi {versiServer}... {pembaruan.persen}%</p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-garis" role="progressbar" aria-valuenow={pembaruan.persen} aria-valuemin={0} aria-valuemax={100} aria-label="Unduhan pembaruan">
                    <div className="h-full bg-biru transition-[width]" style={{ width: `${pembaruan.persen}%` }} />
                  </div>
                </div>
              )}
              {pembaruan.tahap === 'pasang' && (
                <p className="font-semibold">
                  Memasang pembaruan. Aplikasi akan ditutup dan dibuka lagi. Bila Windows meminta izin administrator, minta pengawas menyetujuinya.
                </p>
              )}
              {pembaruan.tahap === 'gagal' && (
                <>
                  <p className="text-merah">{pembaruan.pesan} Pasang aplikasi versi {versiServer} secara manual, atau coba lagi.</p>
                  <Button variant="outline" size="sm" onClick={() => setUlangPembaruan((n) => n + 1)}><ArrowClockwise /> Coba lagi</Button>
                </>
              )}
              {pembaruan.tahap === 'tidak-didukung' && (
                <p className="text-merah">Aplikasi ini belum bisa memperbarui diri. Pasang aplikasi versi {versiServer} secara manual.</p>
              )}
            </div>
          )}
        </Baris>

        <Baris judul="Kamera" ok={okKamera}>
          {memuatDaftar && <p className="text-muted-foreground">Mencari kamera...</p>}
          {!memuatDaftar && galatDaftar && (
            <>
              <p role="alert" className="rounded-md border border-merah/30 bg-merah-muda px-3 py-2 text-merah">{galatDaftar}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void muatDaftar()}><ArrowClockwise /> Cari lagi</Button>
            </>
          )}
          {!memuatDaftar && kamera.length > 0 && (
            <div className="space-y-3">
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
              <div className="relative h-44 w-full max-w-60 overflow-hidden rounded-md bg-tinta">
                <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera" className="size-full object-cover -scale-x-100" />
                {pratinjau === 'memuat' && (
                  <span className="absolute inset-0 grid place-items-center text-sm text-white"><CircleNotch className="size-6 animate-spin" /></span>
                )}
              </div>
              {pratinjau === 'ok' && <p className="text-sm font-semibold text-hijau">Gambar terlihat.</p>}
              {pratinjau === 'hitam' && <p className="text-sm font-semibold text-merah">Gambar hitam. Pilih kamera lain, atau periksa penutup lensa webcam.</p>}
              {pratinjau === 'gagal' && <p role="alert" className="rounded-md border border-merah/30 bg-merah-muda px-3 py-2 text-sm text-merah">{galatPratinjau}</p>}
              {(pratinjau === 'hitam' || pratinjau === 'gagal') && (
                <Button variant="outline" size="sm" onClick={() => setUlangPratinjau((n) => n + 1)}><ArrowClockwise /> Coba lagi</Button>
              )}
            </div>
          )}
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
