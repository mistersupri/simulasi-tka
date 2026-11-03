import {
  ArrowLeft, ArrowRight, ArrowsOut, Camera, CheckCircle, Flag, GridFour, Minus, Monitor, Plus, WarningOctagon,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { GambarSoal } from '@/components/GambarSoal';
import { Teks } from '@/components/TeksKaya';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Memuat } from '@/components/Keadaan';
import { Button } from '@/components/ui/button';
import {
  keluarLayarPenuh, masukLayarPenuh, useAntiContek, useDeteksiWajah, useLayarPenuh, usePencatatPelanggaran,
  type Lapor, type StatusKamera,
} from '@/hooks/usePengawasan';
import { useRekamLayar } from '@/hooks/useRekamLayar';
import { api, ApiError, pesanGalat } from '@/lib/api';
import { formatJam } from '@/lib/format';
import { LABEL_PELANGGARAN, type HasilSiswa, type JenisPelanggaran, type PaketUjian, type SoalTampil } from '@/lib/tipe';
import { atributLang } from '@/lib/bahasa';
import { cn } from '@/lib/utils';

const HURUF = ['A', 'B', 'C', 'D'];
const INTERVAL_SIMPAN_MS = 15_000;

export function HalamanUjian() {
  const { sesiId = '' } = useParams();
  const paket = useQuery({
    queryKey: ['sesi', sesiId],
    queryFn: () => api.get<PaketUjian>(`/siswa/sesi/${sesiId}`),
    staleTime: Infinity,
    retry: false,
  });
  if (paket.isPending) return <Memuat className="min-h-dvh" teks="Menyiapkan soal..." />;
  if (paket.error) {
    if (paket.error instanceof ApiError && [401, 404, 409].includes(paket.error.status)) return <Navigate to="/" replace />;
    return <main className="mx-auto max-w-md px-4 py-20"><Galat galat={paket.error} ulangi={() => paket.refetch()} /></main>;
  }
  return <RuangUjian paket={paket.data} />;
}

type Peringatan = { jenis: JenisPelanggaran; jumlah: number; maks: number };

function RuangUjian({ paket }: { paket: PaketUjian }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [konfirmasi, dialogKonfirmasi] = useKonfirmasi();
  const kunciCadangan = `tka-jawaban-${paket.sesiId}`;

  // Jawaban dari server digabung cadangan di perangkat (bisa lebih baru dari simpanan terakhir).
  const [jawaban, setJawaban] = useState<Record<string, string>>(() => {
    try {
      return { ...paket.jawaban, ...JSON.parse(localStorage.getItem(kunciCadangan) ?? '{}').jawaban };
    } catch {
      return paket.jawaban;
    }
  });
  const [ragu, setRagu] = useState<string[]>(paket.ragu);
  const [indeks, setIndeks] = useState(0);
  const [panelTerbuka, setPanelTerbuka] = useState(false);
  const [ukuranHuruf, setUkuranHuruf] = useState(18);
  const [statusSimpan, setStatusSimpan] = useState('Jawaban tersimpan otomatis.');
  const [jumlahPelanggaran, setJumlahPelanggaran] = useState(paket.jumlahPelanggaran);
  const [peringatan, setPeringatan] = useState<Peringatan | null>(null);
  const [selesai, setSelesai] = useState(false);

  const kotor = useRef(false);
  const jawabanRef = useRef(jawaban);
  jawabanRef.current = jawaban;
  const raguRef = useRef(ragu);
  raguRef.current = ragu;

  const [batasWaktu, setBatasWaktu] = useState(() => (paket.sisaDetik === null ? null : Date.now() + paket.sisaDetik * 1000));
  const [sisa, setSisa] = useState(paket.sisaDetik);

  const soal = paket.soal[indeks];
  const terjawab = paket.soal.filter((s) => jawaban[s.id]).length;
  const pengawasanAktif = !selesai;

  const akhiri = useCallback((hasil: HasilSiswa) => {
    setSelesai(true);
    localStorage.removeItem(kunciCadangan);
    keluarLayarPenuh();
    qc.setQueryData(['hasil', hasil.id], hasil);
    qc.removeQueries({ queryKey: ['sesi', paket.sesiId] });
    qc.invalidateQueries({ queryKey: ['beranda'] });
    navigate(`/hasil/${hasil.id}`, { replace: true });
  }, [kunciCadangan, navigate, paket.sesiId, qc]);

  const tanganiGalatSesi = useCallback((err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
      setSelesai(true);
      keluarLayarPenuh();
      toast.error(err.message);
      navigate('/', { replace: true });
      return true;
    }
    return false;
  }, [navigate]);

  // ---------------- Kirim ----------------
  const kirim = useMutation({
    mutationFn: () => api.post<HasilSiswa>(`/siswa/sesi/${paket.sesiId}/kirim`, { jawaban: jawabanRef.current, ragu: raguRef.current }),
    onSuccess: akhiri,
    onError: (err) => {
      if (!tanganiGalatSesi(err)) toast.error(`${pesanGalat(err)} Jawaban Anda tersimpan di perangkat ini. Silakan kirim ulang.`);
    },
  });

  const mintaKirim = async () => {
    const kosong = paket.soal.length - terjawab;
    const pesan = [
      kosong ? `Masih ada ${kosong} dari ${paket.soal.length} soal yang belum dijawab.` : 'Semua soal sudah dijawab.',
      ragu.length ? `Ada ${ragu.length} soal yang Anda tandai ragu-ragu.` : '',
      'Setelah dikirim, jawaban tidak bisa diubah lagi.',
    ].filter(Boolean).join('\n');
    if (await konfirmasi({ judul: 'Kirim jawaban sekarang?', pesan, ya: 'Ya, kirim' })) kirim.mutate();
  };

  // ---------------- Timer ----------------
  useEffect(() => {
    if (batasWaktu === null || selesai) return;
    let sudahDiingatkan = false;
    const detak = () => {
      const s = Math.ceil((batasWaktu - Date.now()) / 1000);
      setSisa(s);
      if (s <= 300 && !sudahDiingatkan) {
        sudahDiingatkan = true;
        toast.warning('Sisa waktu 5 menit. Periksa kembali jawaban Anda.');
      }
      if (s <= 0 && !kirim.isPending) {
        window.clearInterval(id);
        toast.info('Waktu habis. Jawaban Anda dikirim otomatis.');
        kirim.mutate();
      }
    };
    detak();
    const id = window.setInterval(detak, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batasWaktu, selesai]);

  // ---------------- Simpan otomatis ----------------
  const simpan = useCallback(async () => {
    if (!kotor.current || selesai) return;
    kotor.current = false;
    setStatusSimpan('Menyimpan...');
    try {
      const r = await api.put<{ sisaDetik: number | null }>(`/siswa/sesi/${paket.sesiId}/jawaban`, { jawaban: jawabanRef.current, ragu: raguRef.current });
      const jam = new Date();
      setStatusSimpan(`Tersimpan pukul ${String(jam.getHours()).padStart(2, '0')}.${String(jam.getMinutes()).padStart(2, '0')}`);
      // Sinkronkan bila pengawas menambah waktu.
      if (r.sisaDetik !== null) {
        const baru = Date.now() + r.sisaDetik * 1000;
        setBatasWaktu((lama) => (lama === null || Math.abs(baru - lama) > 5000 ? baru : lama));
      }
    } catch (err) {
      kotor.current = true;
      if (!tanganiGalatSesi(err)) setStatusSimpan('Belum tersimpan ke server. Jawaban aman di perangkat ini.');
    }
  }, [paket.sesiId, selesai, tanganiGalatSesi]);

  useEffect(() => {
    const id = window.setInterval(simpan, INTERVAL_SIMPAN_MS);
    return () => window.clearInterval(id);
  }, [simpan]);

  const ubahJawaban = (berikut: Record<string, string>, raguBaru = raguRef.current) => {
    setJawaban(berikut);
    kotor.current = true;
    setStatusSimpan('Menunggu disimpan...');
    try {
      localStorage.setItem(kunciCadangan, JSON.stringify({ jawaban: berikut, ragu: raguBaru }));
    } catch {
      // Penyimpanan perangkat penuh/diblokir: tetap lanjut, server tetap menyimpan berkala.
    }
  };

  const pilih = (huruf: string) => {
    const lama = (jawaban[soal.id] ?? '').split(',').filter(Boolean);
    const baru = soal.tipe === 'PGK'
      ? (lama.includes(huruf) ? lama.filter((h) => h !== huruf) : [...lama, huruf]).sort()
      : [huruf];
    const berikut = { ...jawaban };
    if (baru.length) berikut[soal.id] = baru.join(',');
    else delete berikut[soal.id];
    ubahJawaban(berikut);
  };

  const isiJawabanIsian = (nilai: string) => {
    const berikut = { ...jawaban };
    if (nilai.trim()) berikut[soal.id] = nilai;
    else delete berikut[soal.id];
    ubahJawaban(berikut);
  };

  const tandaiRagu = () => {
    const baru = ragu.includes(soal.id) ? ragu.filter((r) => r !== soal.id) : [...ragu, soal.id];
    setRagu(baru);
    ubahJawaban(jawaban, baru);
  };

  // ---------------- Pengawasan ----------------
  // Diisi setelah useRekamLayar: ambil tangkapan layar sesaat setelah pelanggaran.
  const tangkapLayarRef = useRef<(keterangan: string) => void>(() => {});
  const laporKeServer = useCallback<Lapor>(async (jenis, detail, foto) => {
    const form = new FormData();
    form.append('jenis', jenis);
    if (detail) form.append('detail', detail);
    form.append('jawaban', JSON.stringify(jawabanRef.current));
    if (foto) form.append('foto', foto, 'bukti.jpg');
    try {
      const r = await api.post<{ jumlah: number; maks: number; dihentikan: boolean; hasil?: HasilSiswa }>(`/siswa/sesi/${paket.sesiId}/pelanggaran`, form);
      setJumlahPelanggaran(r.jumlah);
      if (r.dihentikan && r.hasil) {
        toast.error('Batas pelanggaran tercapai. Ujian Anda dikirim otomatis.');
        akhiri(r.hasil);
      } else {
        setPeringatan({ jenis, jumlah: r.jumlah, maks: r.maks });
        tangkapLayarRef.current(LABEL_PELANGGARAN[jenis]);
      }
    } catch (err) {
      tanganiGalatSesi(err);
    }
  }, [akhiri, paket.sesiId, tanganiGalatSesi]);

  const lapor = usePencatatPelanggaran(laporKeServer);
  useAntiContek(pengawasanAktif, lapor);
  const diLayarPenuh = useLayarPenuh(pengawasanAktif && paket.ujian.wajibLayarPenuh, lapor);
  const kamera = useDeteksiWajah(pengawasanAktif && paket.ujian.wajibKamera, lapor);
  const rekamLayar = paket.ujian.intervalRekamLayar > 0;
  const layar = useRekamLayar({ aktif: pengawasanAktif && rekamLayar, intervalDetik: paket.ujian.intervalRekamLayar, sesiId: paket.sesiId, lapor });
  tangkapLayarRef.current = layar.tangkapPelanggaran;

  useEffect(() => {
    if (selesai) return;
    const cegah = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', cegah);
    return () => window.removeEventListener('beforeunload', cegah);
  }, [selesai]);

  // Urutan prioritas layar kunci: kamera, berbagi layar, layar penuh.
  const kunci: JenisKunci | null =
    paket.ujian.wajibKamera && kamera.status === 'ditolak' ? 'kamera'
    : rekamLayar && layar.status === 'perlu-izin' ? 'bagikan-layar'
    : rekamLayar && layar.status === 'salah-pilih' ? 'salah-pilih'
    : paket.ujian.wajibLayarPenuh && !diLayarPenuh ? 'layar-penuh'
    : null;
  const terkunci = kunci !== null;

  const daftarNomor = useMemo(() => paket.soal.map((s, i) => ({
    i, id: s.id, terjawab: !!jawaban[s.id], ragu: ragu.includes(s.id),
  })), [paket.soal, jawaban, ragu]);

  const pilihan = (jawaban[soal.id] ?? '').split(',');
  const terakhir = indeks === paket.soal.length - 1;

  return (
    <div className="tanpa-blok min-h-dvh" style={{ '--ukuran-soal': `${ukuranHuruf}px` } as React.CSSProperties}>
      <header className="sticky top-0 z-30 bg-biru text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base sm:text-lg">{paket.ujian.nama}</h1>
            <p className="line-clamp-2 text-xs text-biru-pucat">
              {paket.ujian.mataPelajaran} · {terjawab}/{paket.soal.length} dijawab
              {paket.ujian.maksPelanggaran > 0 && jumlahPelanggaran > 0 && (
                <span className="font-semibold text-kuning"> · Pelanggaran {jumlahPelanggaran}/{paket.ujian.maksPelanggaran}</span>
              )}
            </p>
          </div>
          <div className="hidden items-center sm:flex" role="group" aria-label="Ukuran huruf">
            <Button variant="kepala" size="icon-sm" aria-label="Perkecil huruf" onClick={() => setUkuranHuruf((u) => Math.max(14, u - 2))}><Minus /></Button>
            <span className="w-6 text-center text-xs font-semibold" aria-hidden>Aa</span>
            <Button variant="kepala" size="icon-sm" aria-label="Perbesar huruf" onClick={() => setUkuranHuruf((u) => Math.min(28, u + 2))}><Plus /></Button>
          </div>
          {rekamLayar && layar.status === 'aktif' && (
            // Transparansi: siswa selalu tahu layarnya sedang direkam.
            <span className="hidden items-center gap-1.5 rounded-sm bg-white/10 px-2 py-1 text-xs sm:flex" role="status">
              <span className="size-2 rounded-full bg-merah ring-2 ring-white/70" aria-hidden /> <Monitor className="size-4" /> Layar direkam
            </span>
          )}
          {paket.ujian.wajibKamera && <PratinjauKamera videoRef={kamera.videoRef} status={kamera.status} jumlahWajah={kamera.jumlahWajah} />}
          <div
            role="timer"
            aria-label="Sisa waktu"
            className={cn('rounded-md px-3 py-1 text-lg font-semibold tabular-nums text-tinta sm:text-xl',
              sisa !== null && sisa <= 300 ? 'animate-pulse bg-kuning' : 'bg-white')}
          >
            {sisa === null ? 'Bebas' : formatJam(sisa)}
          </div>
          <Button variant="kepalaGaris" size="icon" className="lg:hidden" aria-label="Daftar nomor soal" aria-expanded={panelTerbuka} onClick={() => setPanelTerbuka((b) => !b)}>
            <GridFour />
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[1fr_280px]">
        <main className="min-w-0">
          {terkunci ? (
            <PenguncianLayar
              jenis={kunci}
              aksi={kunci === 'kamera' ? kamera.cobaLagi : kunci === 'layar-penuh' ? () => masukLayarPenuh() : layar.mulaiBerbagi}
              jumlahPelanggaran={jumlahPelanggaran}
              maks={paket.ujian.maksPelanggaran}
            />
          ) : (
            <section className="rounded-lg border border-garis bg-white p-5 sm:p-7" aria-labelledby="nomor-soal" lang={atributLang(soal.bahasa)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="nomor-soal" className="rounded-sm bg-biru px-3 py-1 text-[15px] text-white">Soal nomor {indeks + 1}</h2>
                {soal.tipe === 'PGK' && <span className="rounded-sm bg-biru-muda px-3 py-1 text-sm font-medium text-biru-tua">Pilih lebih dari satu jawaban</span>}
                {soal.tipe === 'ISIAN' && <span className="rounded-sm bg-biru-muda px-3 py-1 text-sm font-medium text-biru-tua">Ketik jawaban</span>}
              </div>
              {soal.pertanyaan && <Teks className="mt-4 leading-relaxed" style={{ fontSize: 'var(--ukuran-soal)' }}>{soal.pertanyaan}</Teks>}
              <GambarSoal nama={soal.gambar} />

              {soal.tipe === 'ISIAN' ? (
                <KotakIsian soal={soal} nilai={jawaban[soal.id] ?? ''} ubah={isiJawabanIsian} />
              ) : (
              <div className="mt-5 space-y-3" role={soal.tipe === 'PGK' ? 'group' : 'radiogroup'} aria-label="Pilihan jawaban">
                {soal.opsi.map((teks, i) => {
                  const huruf = HURUF[i];
                  const dipilih = pilihan.includes(huruf);
                  return (
                    <button
                      key={huruf}
                      type="button"
                      role={soal.tipe === 'PGK' ? 'checkbox' : 'radio'}
                      aria-checked={dipilih}
                      onClick={() => pilih(huruf)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                        dipilih ? 'border-biru bg-biru-muda' : 'border-garis bg-white hover:border-input hover:bg-latar',
                      )}
                      style={{ fontSize: 'var(--ukuran-soal)' }}
                    >
                      <span className={cn(
                        'grid size-8 shrink-0 place-content-center border text-[15px] font-semibold',
                        soal.tipe === 'PGK' ? 'rounded-md' : 'rounded-full',
                        dipilih ? 'border-biru bg-biru text-white' : 'border-input',
                      )}>{huruf}</span>
                      <span className="min-w-0 flex-1 pt-1">
                        {teks && <Teks sebaris className="block">{teks}</Teks>}
                        <GambarSoal nama={soal.opsiGambar?.[i]} alt={`Gambar pilihan ${huruf}`} className="max-h-52" />
                      </span>
                    </button>
                  );
                })}
              </div>
              )}

              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Button variant="outline" size="lg" disabled={indeks === 0} onClick={() => setIndeks((i) => i - 1)}>
                  <ArrowLeft /> Sebelumnya
                </Button>
                <Button variant="kuning" size="lg" aria-pressed={ragu.includes(soal.id)} onClick={tandaiRagu} className="order-last col-span-2 sm:order-none sm:col-span-1">
                  <Flag weight={ragu.includes(soal.id) ? 'fill' : 'bold'} /> {ragu.includes(soal.id) ? 'Ditandai ragu' : 'Ragu-ragu'}
                </Button>
                {terakhir ? (
                  <Button variant="hijau" size="lg" onClick={mintaKirim} disabled={kirim.isPending}>
                    <CheckCircle /> Selesai
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => { setIndeks((i) => i + 1); window.scrollTo({ top: 0 }); }}>
                    Berikutnya <ArrowRight />
                  </Button>
                )}
              </div>
              <p role="status" className="mt-4 text-sm text-muted-foreground">{statusSimpan}</p>
            </section>
          )}
        </main>

        <aside
          className={cn(
            'h-fit rounded-lg border border-garis bg-white p-4',
            panelTerbuka ? 'fixed inset-x-3 top-[68px] z-20 max-h-[75dvh] overflow-y-auto lg:static' : 'hidden lg:block',
          )}
          aria-label="Navigasi soal"
        >
          <h2 className="text-base">Nomor soal</h2>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {daftarNomor.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={terkunci}
                onClick={() => { setIndeks(n.i); setPanelTerbuka(false); }}
                aria-label={`Soal ${n.i + 1}${n.terjawab ? ', sudah dijawab' : ''}${n.ragu ? ', ragu-ragu' : ''}`}
                aria-current={n.i === indeks ? 'step' : undefined}
                className={cn(
                  'h-10 rounded-sm border text-sm font-semibold transition-colors disabled:opacity-50',
                  n.ragu ? 'border-kuning bg-kuning' : n.terjawab ? 'border-hijau bg-hijau text-white' : 'border-input bg-white',
                  n.i === indeks && 'ring-2 ring-biru ring-offset-2',
                )}
              >
                {n.i + 1}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span className="size-3.5 rounded-sm bg-hijau" /> Sudah dijawab</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded-sm border border-garis bg-kuning" /> Ragu-ragu</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded-sm border border-input bg-white" /> Belum dijawab</li>
          </ul>
          <Button variant="hijau" className="mt-5 w-full" onClick={mintaKirim} disabled={kirim.isPending || terkunci}>
            {kirim.isPending ? 'Mengirim...' : 'Selesai & kirim'}
          </Button>
        </aside>
      </div>

      <DialogPeringatan peringatan={peringatan} tutup={() => {
        setPeringatan(null);
        if (paket.ujian.wajibLayarPenuh) masukLayarPenuh();
      }} />
      {dialogKonfirmasi}
    </div>
  );
}

function PratinjauKamera({ videoRef, status, jumlahWajah }: {
  videoRef: React.RefObject<HTMLVideoElement | null>; status: StatusKamera; jumlahWajah: number | null;
}) {
  const baik = status === 'siap' && jumlahWajah === 1;
  const label = status === 'siap'
    ? jumlahWajah === 1 ? 'Wajah terlihat' : jumlahWajah === 0 ? 'Wajah tidak terlihat' : `${jumlahWajah ?? 0} wajah terlihat`
    : status === 'ditolak' ? 'Kamera mati' : status === 'galat' ? 'Deteksi wajah gagal dimuat' : 'Menyiapkan kamera';
  return (
    <div className="relative shrink-0" title={label}>
      <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera" className={cn('h-11 w-14 rounded-md border bg-tinta object-cover -scale-x-100', baik ? 'border-hijau' : 'border-merah')} />
      <span className={cn('absolute -right-1 -bottom-1 grid size-5 place-content-center rounded-full border border-white', baik ? 'bg-hijau' : 'bg-merah')}>
        <Camera weight="fill" className="size-3 text-white" />
      </span>
      <span className="sr-only" role="status">{label}</span>
    </div>
  );
}

type JenisKunci = 'kamera' | 'bagikan-layar' | 'salah-pilih' | 'layar-penuh';

const PESAN_KUNCI: Record<JenisKunci, { judul: string; isi: string; tombol: string }> = {
  'kamera': {
    judul: 'Kamera harus menyala',
    isi: 'Ujian ini diawasi kamera. Izinkan akses kamera di browser, lalu tekan tombol di bawah.',
    tombol: 'Nyalakan kamera',
  },
  'bagikan-layar': {
    judul: 'Bagikan seluruh layar',
    isi: 'Ujian ini merekam layar secara berkala. Tekan tombol di bawah, pilih "Seluruh layar" (Entire screen), lalu tekan "Bagikan". Soal disembunyikan sampai layar dibagikan; waktu ujian tetap berjalan.',
    tombol: 'Bagikan seluruh layar',
  },
  'salah-pilih': {
    judul: 'Pilih "Seluruh layar"',
    isi: 'Yang Anda bagikan hanya satu tab atau jendela. Ujian ini memerlukan seluruh layar. Tekan tombol di bawah dan pilih "Seluruh layar" (Entire screen).',
    tombol: 'Pilih ulang',
  },
  'layar-penuh': {
    judul: 'Kembali ke layar penuh',
    isi: 'Soal disembunyikan selama Anda tidak berada di layar penuh. Waktu ujian tetap berjalan.',
    tombol: 'Kembali ke layar penuh',
  },
};

function PenguncianLayar({ jenis, aksi, jumlahPelanggaran, maks }: {
  jenis: JenisKunci; aksi: () => void; jumlahPelanggaran: number; maks: number;
}) {
  const pesan = PESAN_KUNCI[jenis];
  const Ikon = jenis === 'kamera' ? Camera : jenis === 'layar-penuh' ? ArrowsOut : Monitor;
  return (
    <section className="rounded-lg border border-garis bg-white p-6 text-center sm:p-10" role="alert">
      <Ikon className={cn('mx-auto size-12', jenis === 'kamera' || jenis === 'salah-pilih' ? 'text-merah' : 'text-biru')} />
      <h2 className="mt-4 text-xl">{pesan.judul}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">{pesan.isi}</p>
      {maks > 0 && <p className="mt-3 font-semibold text-merah">Pelanggaran tercatat: {jumlahPelanggaran} dari {maks}</p>}
      <Button size="lg" className="mt-6" onClick={aksi}>{pesan.tombol}</Button>
    </section>
  );
}

function DialogPeringatan({ peringatan, tutup }: { peringatan: Peringatan | null; tutup: () => void }) {
  if (!peringatan) return null;
  const sisa = peringatan.maks > 0 ? peringatan.maks - peringatan.jumlah : null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/60 p-4"
      role="alertdialog" aria-modal="true" aria-labelledby="judul-peringatan"
      onKeyDown={(e) => e.key === 'Escape' && tutup()}
    >
      <div className="w-full max-w-md rounded-xl border border-garis bg-white p-6 text-center shadow-xl">
        <WarningOctagon weight="fill" className="mx-auto size-12 text-merah" />
        <h2 id="judul-peringatan" className="mt-3 text-xl">Pelanggaran tercatat</h2>
        <p className="mt-2 font-semibold">{LABEL_PELANGGARAN[peringatan.jenis]}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Pengawas dapat melihat catatan ini.
          {sisa !== null && (sisa > 0
            ? ` Jika terjadi ${sisa} kali lagi, ujian Anda dikirim otomatis.`
            : '')}
        </p>
        <Button size="lg" className="mt-6 w-full" autoFocus onClick={tutup}>Saya mengerti, lanjutkan</Button>
      </div>
    </div>
  );
}

/**
 * Jawaban isian: siswa mengetik. Tempel (Ctrl+V) tetap ditolak oleh pengawasan; Ctrl+A di kotak ini diizinkan.
 * Kotak ikut bahasa soal (huruf dan arah tulisan) sehingga jawaban Arab/Mandarin/Rusia bisa diketik dengan keyboard bahasa itu.
 */
function KotakIsian({ soal, nilai, ubah }: { soal: SoalTampil; nilai: string; ubah: (v: string) => void }) {
  const umum = {
    id: 'jawaban-isian',
    'data-isian': true,
    value: nilai,
    maxLength: 500,
    dir: 'auto' as const,
    lang: atributLang(soal.bahasa),
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    'aria-describedby': 'petunjuk-isian',
    className: cn(
      'w-full rounded-md border border-input bg-white px-3 py-2 text-tinta select-text focus-visible:border-biru',
      soal.kode && 'font-mono',
    ),
    style: { fontSize: 'var(--ukuran-soal)' },
  };
  return (
    <div className="mt-5">
      <label htmlFor="jawaban-isian" className="mb-1.5 block text-sm font-semibold">Jawaban Anda</label>
      {soal.kode
        ? <textarea {...umum} rows={4} onChange={(e) => ubah(e.target.value)} />
        : <input {...umum} type="text" onChange={(e) => ubah(e.target.value)} />}
      <p id="petunjuk-isian" className="mt-1.5 text-sm text-muted-foreground">
        Ketik jawabannya langsung. Tersimpan otomatis{soal.kode ? '; huruf besar dan kecil dibedakan' : ''}.
      </p>
    </div>
  );
}
