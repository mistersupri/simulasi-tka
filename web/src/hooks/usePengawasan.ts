/**
 * Pengawasan ujian di browser.
 *
 * Batasan yang perlu diketahui sekolah: browser tidak bisa sepenuhnya mencegah
 * kecurangan (mis. HP kedua, kamera ditutup tangan). Fitur ini membuat
 * kecurangan lebih sulit dan meninggalkan jejak untuk pengawas, bukan mustahil.
 *
 * Yang diawasi:
 *  - layar penuh: keluar = pelanggaran, soal ditutup sampai kembali layar penuh
 *  - teks tidak bisa diblok, disalin, ditempel; klik kanan & pintasan dimatikan
 *  - pindah tab / aplikasi (visibilitychange & blur)
 *  - wajah lewat kamera (MediaPipe, di perangkat siswa; video tidak dikirim):
 *    tidak ada wajah atau lebih dari satu wajah beberapa detik berturut-turut
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { aplikasi } from '@/lib/aplikasi';
import { jelaskanGalatKamera, type PenjelasanKamera } from '@/lib/kamera';
import { bukaKameraDenganBatas, daftarKamera, jedaKamera, videoHitam } from '@/lib/kameraPerangkat';
import type { JenisPelanggaran } from '@/lib/tipe';

export type Lapor = (jenis: JenisPelanggaran, detail?: string, foto?: Blob | null) => void;

/** Satu jenis pelanggaran tidak dihitung ulang dalam jeda ini (mis. tombol ditahan). */
const JEDA_JENIS_MS = 10_000;
/** Keluar layar penuh biasanya juga memicu blur/pindah tab: hitung sekali saja. */
const JEDA_SEMUA_MS = 2_000;

let jedaSampai = 0;
/** Abaikan pelanggaran mulai sekarang selama sekian ms (dialog bawaan browser membuat halaman kehilangan fokus). */
export function jedaPengawasan(ms: number) {
  jedaSampai = Date.now() + ms;
}

export function usePencatatPelanggaran(lapor: Lapor) {
  const terakhir = useRef<Record<string, number>>({});
  const terakhirApaSaja = useRef(0);
  return useCallback<Lapor>((jenis, detail, foto) => {
    // Pengawas sedang membuka jendela izin keluar di aplikasi Windows.
    if (aplikasi?.jeda() || Date.now() < jedaSampai) return;
    const sekarang = Date.now();
    if (sekarang - (terakhir.current[jenis] ?? 0) < JEDA_JENIS_MS) return;
    if (sekarang - terakhirApaSaja.current < JEDA_SEMUA_MS) return;
    terakhir.current[jenis] = sekarang;
    terakhirApaSaja.current = sekarang;
    lapor(jenis, detail, foto);
  }, [lapor]);
}

// ------------------------------------------------------------------
// Layar penuh
// ------------------------------------------------------------------

/** Di aplikasi Windows jendelanya sudah mode kiosk, jadi layar penuh HTML tidak dipakai. */
export const layarPenuhDidukung = () => !aplikasi && typeof document !== 'undefined' && !!document.fullscreenEnabled;

export async function masukLayarPenuh() {
  if (!layarPenuhDidukung() || document.fullscreenElement) return true;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export function keluarLayarPenuh() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/** diLayarPenuh = true juga bila perangkat tidak mendukung (mis. iPhone), agar siswa tidak terkunci. */
export function useLayarPenuh(aktif: boolean, lapor: Lapor) {
  const [diLayarPenuh, setDiLayarPenuh] = useState(() => !layarPenuhDidukung() || !!document.fullscreenElement);
  useEffect(() => {
    if (!aktif || !layarPenuhDidukung()) return;
    const ubah = () => {
      const penuh = !!document.fullscreenElement;
      setDiLayarPenuh(penuh);
      if (!penuh) lapor('KELUAR_LAYAR_PENUH');
    };
    setDiLayarPenuh(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', ubah);
    return () => document.removeEventListener('fullscreenchange', ubah);
  }, [aktif, lapor]);
  return diLayarPenuh;
}

// ------------------------------------------------------------------
// Anti salin/blok & pindah tab
// ------------------------------------------------------------------

/** Kotak jawaban isian (lihat KotakIsian di pages/siswa/Ujian.tsx): tempat siswa mengetik. */
const diKotakIsian = (t: EventTarget | null) => t instanceof Node && !!(t instanceof Element ? t : t.parentElement)?.closest('[data-isian]');

function pintasanTerlarang(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  if (k === 'f12' || k === 'printscreen') return true;
  // AltGr (Ctrl+Alt di Windows) dipakai keyboard Eropa untuk mengetik huruf; bukan pintasan.
  if (e.getModifierState?.('AltGraph')) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  // Memilih/membatalkan di dalam kotak jawaban tidak menyentuh teks soal.
  if (ctrl && !e.shiftKey && ['a', 'z', 'y'].includes(k) && diKotakIsian(e.target)) return false;
  if (ctrl && e.shiftKey && ['i', 'j', 'c', 's'].includes(k)) return true; // alat pengembang, tangkapan layar
  return ctrl && ['c', 'x', 'v', 'a', 'p', 's', 'u', 'f'].includes(k);
}

export function useAntiContek(aktif: boolean, lapor: Lapor) {
  useEffect(() => {
    if (!aktif) return;
    const tolakSalin = (e: Event) => {
      e.preventDefault();
      lapor('SALIN_TEMPEL', e.type);
    };
    const tolakDiam = (e: Event) => e.preventDefault();
    // Memilih teks di kotak jawaban dibiarkan (kursor dan penyuntingan ketikan sendiri).
    const tolakPilih = (e: Event) => { if (!diKotakIsian(e.target)) e.preventDefault(); };
    const tombol = (e: KeyboardEvent) => {
      if (e.isComposing) return; // sedang menyusun huruf lewat IME (Mandarin, Jepang, Korea): bukan pintasan
      if (!pintasanTerlarang(e)) return;
      e.preventDefault();
      e.stopPropagation();
      lapor('PINTASAN_TERLARANG', [e.ctrlKey || e.metaKey ? 'Ctrl+' : '', e.shiftKey ? 'Shift+' : '', e.key].join(''));
    };
    // PrintScreen di Windows hanya memicu keyup.
    const tombolLepas = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') lapor('PINTASAN_TERLARANG', 'PrintScreen');
    };
    const tersembunyi = () => {
      if (document.visibilityState === 'hidden') lapor('PINDAH_TAB', 'Halaman disembunyikan');
    };
    const kehilanganFokus = () => lapor('PINDAH_TAB', 'Jendela kehilangan fokus');

    document.addEventListener('copy', tolakSalin);
    document.addEventListener('cut', tolakSalin);
    document.addEventListener('paste', tolakSalin);
    document.addEventListener('contextmenu', tolakDiam);
    document.addEventListener('selectstart', tolakPilih);
    document.addEventListener('dragstart', tolakDiam);
    document.addEventListener('keydown', tombol, true);
    document.addEventListener('keyup', tombolLepas, true);
    document.addEventListener('visibilitychange', tersembunyi);
    window.addEventListener('blur', kehilanganFokus);
    return () => {
      document.removeEventListener('copy', tolakSalin);
      document.removeEventListener('cut', tolakSalin);
      document.removeEventListener('paste', tolakSalin);
      document.removeEventListener('contextmenu', tolakDiam);
      document.removeEventListener('selectstart', tolakPilih);
      document.removeEventListener('dragstart', tolakDiam);
      document.removeEventListener('keydown', tombol, true);
      document.removeEventListener('keyup', tombolLepas, true);
      document.removeEventListener('visibilitychange', tersembunyi);
      window.removeEventListener('blur', kehilanganFokus);
    };
  }, [aktif, lapor]);
}

// ------------------------------------------------------------------
// Deteksi wajah
// ------------------------------------------------------------------

export type StatusKamera = 'mati' | 'meminta' | 'memuat' | 'siap' | 'ditolak' | 'galat';

const INTERVAL_DETEKSI_MS = 1000;
/** Berapa deteksi berturut-turut sebelum dihitung pelanggaran (± detik). */
const BATAS_TANPA_WAJAH = 4;
const BATAS_BANYAK_WAJAH = 3;

/** Foto kecil dari video sebagai bukti untuk pengawas. */
function ambilFoto(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  const lebar = 320;
  const kanvas = document.createElement('canvas');
  kanvas.width = lebar;
  kanvas.height = Math.round((video.videoHeight * lebar) / video.videoWidth);
  kanvas.getContext('2d')!.drawImage(video, 0, 0, kanvas.width, kanvas.height);
  return new Promise((r) => kanvas.toBlob(r, 'image/jpeg', 0.7));
}

export function useDeteksiWajah(aktif: boolean, lapor: Lapor) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<StatusKamera>('mati');
  const [jumlahWajah, setJumlahWajah] = useState<number | null>(null);
  const [percobaan, setPercobaan] = useState(0);
  const [alasan, setAlasan] = useState<PenjelasanKamera | null>(null);
  // Gagal menyalakan kamera dicatat sekali per ujian: menekan "Nyalakan kamera" berulang kali tidak boleh
  // menambah pelanggaran (dan akhirnya mengirim ujian otomatis) hanya karena kameranya bermasalah.
  const gagalDilaporkan = useRef(false);
  const laporRef = useRef(lapor);
  laporRef.current = lapor;

  /** Meminta izin kamera lagi (dipanggil dari tombol "Nyalakan kamera"). */
  const cobaLagi = useCallback(() => setPercobaan((n) => n + 1), []);

  useEffect(() => {
    if (!aktif) return;
    let berhenti = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let detektor: { detectForVideo: (v: HTMLVideoElement, t: number) => { detections: unknown[] }; close: () => void } | null = null;

    (async () => {
      setStatus('meminta');
      // Kamera baru saja dites/dilepas (halaman mulai ujian): beri Windows waktu melepasnya.
      await jedaKamera();
      if (berhenti) return;

      const gagalKamera = async (err: Error | null, penjelasanLangsung?: PenjelasanKamera) => {
        if (berhenti) return;
        const statusOs = await aplikasi?.statusKamera?.().catch(() => null);
        const penjelasan = penjelasanLangsung ?? jelaskanGalatKamera(err, { diAplikasi: !!aplikasi, statusOs });
        setAlasan(penjelasan);
        setStatus('ditolak');
        if (!gagalDilaporkan.current) {
          gagalDilaporkan.current = true;
          // Detail memuat nama galat asli dan status Windows agar pengawas tahu penyebabnya.
          laporRef.current('KAMERA_TIDAK_AKTIF', `Gagal menyalakan kamera: ${penjelasan.detail}`);
        }
      };

      const tampilkan = async (s: MediaStream) => {
        // Elemen video bisa belum terpasang saat kamera selesai dibuka; tunggu sebentar, jangan menyerah diam-diam.
        for (let i = 0; i < 20 && !videoRef.current && !berhenti; i++) await jedaKamera(100);
        const v = videoRef.current;
        if (!v || berhenti) return null;
        v.srcObject = s;
        await v.play().catch(() => {});
        return v;
      };

      /** Hitam dua kali berturut-turut (jeda 1,5 detik) dianggap benar-benar hitam. */
      const hitamTerus = async (v: HTMLVideoElement) => {
        for (let i = 0; i < 2; i++) {
          await jedaKamera(1500);
          if (berhenti || !videoHitam(v)) return false;
        }
        return true;
      };

      // Coba kamera bawaan dulu; bila gagal atau hitam, coba kamera lain (mis. kamera warna di samping kamera inframerah).
      let video: HTMLVideoElement | null = null;
      const kandidat: (string | undefined)[] = [undefined];
      const namaDicoba: string[] = [];
      let diperluas = false;
      let galatPertama: Error | null = null;
      let pernahHitam = false;
      let berhasil = false;
      for (let i = 0; i < kandidat.length && !berhasil; i++) {
        try {
          stream = await bukaKameraDenganBatas({ deviceId: kandidat[i] });
          if (!diperluas) {
            diperluas = true;
            const label = stream.getVideoTracks()[0]?.label ?? '';
            namaDicoba.push(label || 'kamera bawaan');
            kandidat.push(...(await daftarKamera(stream.getVideoTracks()[0]?.getSettings().deviceId)).map((d) => d.id));
          }
          video = await tampilkan(stream);
          if (video && (await hitamTerus(video))) {
            pernahHitam = true;
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
            await jedaKamera(800);
            continue;
          }
          berhasil = true;
        } catch (err) {
          galatPertama ??= err as Error;
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          if (berhenti) return;
          if (!diperluas) {
            diperluas = true;
            kandidat.push(...(await daftarKamera()).map((d) => d.id));
          }
          await jedaKamera(800);
        }
      }
      if (berhenti) return;
      if (!berhasil) {
        if (pernahHitam) {
          await gagalKamera(null, {
            jenis: 'hitam', judul: 'Gambar kamera hitam',
            isi: 'Kamera menyala tetapi tidak mengirim gambar. Buka penutup lensa atau tombol privasi webcam (laptop Lenovo: tombol F8 atau kunci privasi di bingkai layar), '
              + 'pastikan tidak ada aplikasi lain yang memakai kamera, lalu coba lagi. Bila tetap hitam, cabut dan colok ulang webcam atau mulai ulang komputer.',
            detail: `Gambar kamera hitam pada ${kandidat.length} kamera yang dicoba${namaDicoba.length ? ` (${namaDicoba.join(', ')})` : ''}${galatPertama ? `; galat: ${galatPertama.name}` : ''}`.slice(0, 280),
          });
        } else {
          await gagalKamera(galatPertama);
        }
        return;
      }
      if (berhenti || !stream || !video) return;
      gagalDilaporkan.current = false;
      setAlasan(null);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (berhenti) return;
        setStatus('ditolak');
        setAlasan({
          jenis: 'dipakai', judul: 'Kamera terputus',
          isi: 'Kamera berhenti: kabelnya terlepas atau aplikasi lain mengambil alih. Sambungkan kembali, tutup aplikasi lain yang memakai kamera, lalu coba lagi.',
          detail: 'Kamera terputus',
        });
        laporRef.current('KAMERA_TIDAK_AKTIF', 'Kamera terputus');
      });

      setStatus('memuat');
      try {
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        detektor = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/mediapipe/blaze_face_short_range.tflite' },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
      } catch (err) {
        console.error('Deteksi wajah gagal dimuat', err);
        if (!berhenti) setStatus('galat');
        return;
      }
      if (berhenti) return;
      setStatus('siap');

      let tanpaWajah = 0;
      let banyakWajah = 0;
      let gagalBeruntun = 0;
      timer = window.setInterval(async () => {
        if (!detektor || video.readyState < 2) return;
        let n: number;
        try {
          n = detektor.detectForVideo(video, performance.now()).detections.length;
          gagalBeruntun = 0;
        } catch (err) {
          // Mis. WebGL tidak tersedia di perangkat ini: hentikan, tampilkan status gagal.
          if (++gagalBeruntun >= 5) {
            console.error('Deteksi wajah berhenti', err);
            window.clearInterval(timer);
            setStatus('galat');
          }
          return;
        }
        setJumlahWajah(n);
        tanpaWajah = n === 0 ? tanpaWajah + 1 : 0;
        banyakWajah = n > 1 ? banyakWajah + 1 : 0;
        if (tanpaWajah >= BATAS_TANPA_WAJAH) {
          tanpaWajah = 0;
          laporRef.current('WAJAH_TIDAK_TERLIHAT', `Tidak ada wajah ± ${BATAS_TANPA_WAJAH} detik`, await ambilFoto(video));
        }
        if (banyakWajah >= BATAS_BANYAK_WAJAH) {
          banyakWajah = 0;
          laporRef.current('WAJAH_LEBIH_DARI_SATU', `${n} wajah terdeteksi`, await ambilFoto(video));
        }
      }, INTERVAL_DETEKSI_MS);
    })();

    return () => {
      berhenti = true;
      window.clearInterval(timer);
      detektor?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [aktif, percobaan]);

  return { videoRef, status, jumlahWajah, cobaLagi, alasan };
}
