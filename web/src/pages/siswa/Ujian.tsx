import {
  ArrowLeft, ArrowRight, ArrowsOut, Camera, CheckCircle, Flag, GridFour, Minus, Plus, WarningOctagon,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { GambarSoal } from '@/components/GambarSoal';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Memuat } from '@/components/Keadaan';
import { Button } from '@/components/ui/button';
import {
  keluarLayarPenuh, masukLayarPenuh, useAntiContek, useDeteksiWajah, useLayarPenuh, usePencatatPelanggaran,
  type Lapor, type StatusKamera,
} from '@/hooks/usePengawasan';
import { api, ApiError, pesanGalat } from '@/lib/api';
import { formatJam } from '@/lib/format';
import { LABEL_PELANGGARAN, type HasilSiswa, type JenisPelanggaran, type PaketUjian } from '@/lib/tipe';
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
      if (!tanganiGalatSesi(err)) toast.error(`${pesanGalat(err)} Jawabanmu aman di perangkat ini, coba kirim lagi.`);
    },
  });

  const mintaKirim = async () => {
    const kosong = paket.soal.length - terjawab;
    const pesan = [
      kosong ? `Masih ada ${kosong} dari ${paket.soal.length} soal yang belum dijawab.` : 'Semua soal sudah dijawab.',
      ragu.length ? `Ada ${ragu.length} soal yang kamu tandai ragu-ragu.` : '',
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
        toast.warning('Sisa waktu 5 menit. Periksa lagi jawabanmu.');
      }
      if (s <= 0 && !kirim.isPending) {
        window.clearInterval(id);
        toast.info('Waktu habis. Jawabanmu dikirim otomatis.');
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

  const tandaiRagu = () => {
    const baru = ragu.includes(soal.id) ? ragu.filter((r) => r !== soal.id) : [...ragu, soal.id];
    setRagu(baru);
    ubahJawaban(jawaban, baru);
  };

  // ---------------- Pengawasan ----------------
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
        toast.error('Batas pelanggaran tercapai. Ujianmu dikirim otomatis.');
        akhiri(r.hasil);
      } else {
        setPeringatan({ jenis, jumlah: r.jumlah, maks: r.maks });
      }
    } catch (err) {
      tanganiGalatSesi(err);
    }
  }, [akhiri, paket.sesiId, tanganiGalatSesi]);

  const lapor = usePencatatPelanggaran(laporKeServer);
  useAntiContek(pengawasanAktif, lapor);
  const diLayarPenuh = useLayarPenuh(pengawasanAktif && paket.ujian.wajibLayarPenuh, lapor);
  const kamera = useDeteksiWajah(pengawasanAktif && paket.ujian.wajibKamera, lapor);

  useEffect(() => {
    if (selesai) return;
    const cegah = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', cegah);
    return () => window.removeEventListener('beforeunload', cegah);
  }, [selesai]);

  const terkunciLayar = paket.ujian.wajibLayarPenuh && !diLayarPenuh;
  const terkunciKamera = paket.ujian.wajibKamera && kamera.status === 'ditolak';
  const terkunci = terkunciLayar || terkunciKamera;

  const daftarNomor = useMemo(() => paket.soal.map((s, i) => ({
    i, id: s.id, terjawab: !!jawaban[s.id], ragu: ragu.includes(s.id),
  })), [paket.soal, jawaban, ragu]);

  const pilihan = (jawaban[soal.id] ?? '').split(',');
  const terakhir = indeks === paket.soal.length - 1;

  return (
    <div className="tanpa-blok min-h-dvh" style={{ '--ukuran-soal': `${ukuranHuruf}px` } as React.CSSProperties}>
      <header className="sticky top-0 z-30 border-b-2 border-tinta bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base sm:text-lg">{paket.ujian.nama}</h1>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {paket.ujian.mataPelajaran} · {terjawab}/{paket.soal.length} dijawab
              {paket.ujian.maksPelanggaran > 0 && jumlahPelanggaran > 0 && (
                <span className="font-bold text-bata"> · Pelanggaran {jumlahPelanggaran}/{paket.ujian.maksPelanggaran}</span>
              )}
            </p>
          </div>
          <div className="hidden items-center sm:flex" role="group" aria-label="Ukuran huruf">
            <Button variant="ghost" size="icon-sm" aria-label="Perkecil huruf" onClick={() => setUkuranHuruf((u) => Math.max(14, u - 2))}><Minus weight="bold" /></Button>
            <span className="w-6 text-center text-xs font-bold" aria-hidden>Aa</span>
            <Button variant="ghost" size="icon-sm" aria-label="Perbesar huruf" onClick={() => setUkuranHuruf((u) => Math.min(28, u + 2))}><Plus weight="bold" /></Button>
          </div>
          {paket.ujian.wajibKamera && <PratinjauKamera videoRef={kamera.videoRef} status={kamera.status} jumlahWajah={kamera.jumlahWajah} />}
          <div
            role="timer"
            aria-label="Sisa waktu"
            className={cn('stiker-kecil rounded-md px-3 py-1.5 text-xl font-extrabold tabular-nums sm:text-2xl',
              sisa !== null && sisa <= 300 ? 'animate-pulse bg-matahari' : 'bg-white')}
          >
            {sisa === null ? 'Bebas' : formatJam(sisa)}
          </div>
          <Button variant="outline" size="icon" className="lg:hidden" aria-label="Daftar nomor soal" aria-expanded={panelTerbuka} onClick={() => setPanelTerbuka((b) => !b)}>
            <GridFour weight="bold" />
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[1fr_280px]">
        <main className="min-w-0">
          {terkunci ? (
            <PenguncianLayar
              kamera={terkunciKamera}
              nyalakanKamera={kamera.cobaLagi}
              jumlahPelanggaran={jumlahPelanggaran}
              maks={paket.ujian.maksPelanggaran}
            />
          ) : (
            <section className="rounded-xl border-2 border-tinta bg-white p-5 sm:p-7" aria-labelledby="nomor-soal">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="nomor-soal" className="rounded-md bg-tinta px-3 py-1 text-base text-white">Soal {indeks + 1}</h2>
                {soal.tipe === 'PGK' && <span className="rounded-md bg-jeruk-muda px-3 py-1 text-sm font-bold text-jeruk-tua">Pilih lebih dari satu jawaban</span>}
              </div>
              <p className="mt-4 leading-relaxed whitespace-pre-line" style={{ fontSize: 'var(--ukuran-soal)' }}>{soal.pertanyaan}</p>
              <GambarSoal nama={soal.gambar} />

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
                        'flex w-full items-start gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors',
                        dipilih ? 'border-jeruk bg-jeruk-muda' : 'border-border bg-white hover:border-tinta',
                      )}
                      style={{ fontSize: 'var(--ukuran-soal)' }}
                    >
                      <span className={cn(
                        'grid size-9 shrink-0 place-content-center border-2 text-base font-extrabold',
                        soal.tipe === 'PGK' ? 'rounded-md' : 'rounded-full',
                        dipilih ? 'border-jeruk bg-jeruk text-white' : 'border-tinta',
                      )}>{huruf}</span>
                      <span className="pt-1 whitespace-pre-line">{teks}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Button variant="outline" size="lg" disabled={indeks === 0} onClick={() => setIndeks((i) => i - 1)}>
                  <ArrowLeft weight="bold" /> Sebelumnya
                </Button>
                <Button variant="matahari" size="lg" aria-pressed={ragu.includes(soal.id)} onClick={tandaiRagu} className="order-last col-span-2 sm:order-none sm:col-span-1">
                  <Flag weight={ragu.includes(soal.id) ? 'fill' : 'bold'} /> {ragu.includes(soal.id) ? 'Ditandai ragu' : 'Ragu-ragu'}
                </Button>
                {terakhir ? (
                  <Button variant="daun" size="lg" onClick={mintaKirim} disabled={kirim.isPending}>
                    <CheckCircle weight="bold" /> Selesai
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => { setIndeks((i) => i + 1); window.scrollTo({ top: 0 }); }}>
                    Berikutnya <ArrowRight weight="bold" />
                  </Button>
                )}
              </div>
              <p role="status" className="mt-4 text-sm text-muted-foreground">{statusSimpan}</p>
            </section>
          )}
        </main>

        <aside
          className={cn(
            'h-fit rounded-xl border-2 border-tinta bg-white p-4',
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
                  'h-11 rounded-md border-2 text-sm font-extrabold transition-colors disabled:opacity-50',
                  n.ragu ? 'border-tinta bg-matahari' : n.terjawab ? 'border-daun bg-daun text-white' : 'border-input bg-white',
                  n.i === indeks && 'ring-3 ring-jeruk ring-offset-2',
                )}
              >
                {n.i + 1}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span className="size-3.5 rounded-sm bg-daun" /> Sudah dijawab</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded-sm border border-tinta bg-matahari" /> Ragu-ragu</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded-sm border-2 border-input bg-white" /> Belum dijawab</li>
          </ul>
          <Button variant="daun" className="mt-5 w-full" onClick={mintaKirim} disabled={kirim.isPending || terkunci}>
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
      <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera" className={cn('h-11 w-14 rounded-md border-2 bg-tinta object-cover -scale-x-100', baik ? 'border-daun' : 'border-bata')} />
      <span className={cn('absolute -right-1 -bottom-1 grid size-5 place-content-center rounded-full border-2 border-white', baik ? 'bg-daun' : 'bg-bata')}>
        <Camera weight="fill" className="size-3 text-white" />
      </span>
      <span className="sr-only" role="status">{label}</span>
    </div>
  );
}

function PenguncianLayar({ kamera, nyalakanKamera, jumlahPelanggaran, maks }: {
  kamera: boolean; nyalakanKamera: () => void; jumlahPelanggaran: number; maks: number;
}) {
  return (
    <section className="stiker rounded-xl bg-white p-6 text-center sm:p-10" role="alert">
      {kamera ? <Camera weight="bold" className="mx-auto size-12 text-bata" /> : <ArrowsOut weight="bold" className="mx-auto size-12 text-jeruk" />}
      <h2 className="mt-4 text-2xl">{kamera ? 'Kamera harus menyala' : 'Kembali ke layar penuh'}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        {kamera
          ? 'Ujian ini diawasi kamera. Izinkan akses kamera di browser, lalu tekan tombol di bawah.'
          : 'Soal disembunyikan selama kamu tidak berada di layar penuh. Waktu ujian tetap berjalan.'}
      </p>
      {maks > 0 && <p className="mt-3 font-bold text-bata">Pelanggaran tercatat: {jumlahPelanggaran} dari {maks}</p>}
      <Button size="lg" className="mt-6" onClick={kamera ? nyalakanKamera : () => masukLayarPenuh()}>
        {kamera ? 'Nyalakan kamera' : 'Kembali ke layar penuh'}
      </Button>
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
      <div className="stiker w-full max-w-md rounded-xl bg-white p-6 text-center">
        <WarningOctagon weight="fill" className="mx-auto size-12 text-bata" />
        <h2 id="judul-peringatan" className="mt-3 text-xl">Pelanggaran tercatat</h2>
        <p className="mt-2 font-bold">{LABEL_PELANGGARAN[peringatan.jenis]}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Pengawas dapat melihat catatan ini.
          {sisa !== null && (sisa > 0
            ? ` Jika terjadi ${sisa} kali lagi, ujianmu dikirim otomatis.`
            : '')}
        </p>
        <Button size="lg" className="mt-6 w-full" autoFocus onClick={tutup}>Saya mengerti, lanjutkan</Button>
      </div>
    </div>
  );
}
