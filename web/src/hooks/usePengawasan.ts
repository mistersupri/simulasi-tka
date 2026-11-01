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
import type { JenisPelanggaran } from '@/lib/tipe';

export type Lapor = (jenis: JenisPelanggaran, detail?: string, foto?: Blob | null) => void;

/** Satu jenis pelanggaran tidak dihitung ulang dalam jeda ini (mis. tombol ditahan). */
const JEDA_JENIS_MS = 10_000;
/** Keluar layar penuh biasanya juga memicu blur/pindah tab: hitung sekali saja. */
const JEDA_SEMUA_MS = 2_000;

export function usePencatatPelanggaran(lapor: Lapor) {
  const terakhir = useRef<Record<string, number>>({});
  const terakhirApaSaja = useRef(0);
  return useCallback<Lapor>((jenis, detail, foto) => {
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

export const layarPenuhDidukung = () => typeof document !== 'undefined' && !!document.fullscreenEnabled;

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

function pintasanTerlarang(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  if (k === 'f12' || k === 'printscreen') return true;
  const ctrl = e.ctrlKey || e.metaKey;
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
    const tombol = (e: KeyboardEvent) => {
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
    document.addEventListener('selectstart', tolakDiam);
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
      document.removeEventListener('selectstart', tolakDiam);
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
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      } catch {
        if (!berhenti) {
          setStatus('ditolak');
          laporRef.current('KAMERA_TIDAK_AKTIF', 'Izin kamera ditolak atau kamera tidak ada');
        }
        return;
      }
      if (berhenti) return;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (berhenti) return;
        setStatus('ditolak');
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
      timer = window.setInterval(async () => {
        if (!detektor || video.readyState < 2) return;
        const n = detektor.detectForVideo(video, performance.now()).detections.length;
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

  return { videoRef, status, jumlahWajah, cobaLagi };
}
