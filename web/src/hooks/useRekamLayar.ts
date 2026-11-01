/**
 * Rekam layar ujian: tangkapan layar berkala + tangkapan sesaat setelah pelanggaran.
 *
 * - Aplikasi Windows: layar diambil langsung oleh aplikasi (desktopCapturer), tanpa dialog.
 * - Browser komputer: siswa membagikan SELURUH LAYAR lewat getDisplayMedia. Berhenti berbagi
 *   dicatat sebagai pelanggaran dan soal disembunyikan sampai layar dibagikan lagi.
 * - HP/tablet: browser tidak mendukung berbagi layar, jadi ujian ini tidak bisa dikerjakan.
 *
 * Hanya gambar diam (JPEG kecil) yang dikirim, bukan video.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { aplikasi } from '@/lib/aplikasi';
import { jedaPengawasan, masukLayarPenuh, type Lapor } from './usePengawasan';

export type StatusLayar = 'mati' | 'perlu-izin' | 'aktif' | 'salah-pilih';

const LEBAR_MAKS = 1280;
/** Jeda sebelum mengambil tangkapan setelah pelanggaran, agar yang terekam adalah layar tujuan siswa. */
const TUNDA_PELANGGARAN_MS = 1500;

export const rekamLayarDidukung = () =>
  !!aplikasi?.tangkapLayar || (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);

/** Gambar dari track layar → JPEG yang diperkecil. */
async function gambarDariTrack(track: MediaStreamTrack, video: HTMLVideoElement): Promise<Blob | null> {
  let sumber: CanvasImageSource | null = null;
  let lebar = 0;
  let tinggi = 0;
  // ImageCapture tetap bekerja walau tab sedang tersembunyi (saat siswa pindah tab).
  const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
  if (IC) {
    try {
      const bmp = await new IC(track).grabFrame();
      sumber = bmp;
      lebar = bmp.width;
      tinggi = bmp.height;
    } catch {
      sumber = null;
    }
  }
  if (!sumber && video.videoWidth) {
    sumber = video;
    lebar = video.videoWidth;
    tinggi = video.videoHeight;
  }
  if (!sumber || !lebar) return null;
  const skala = Math.min(1, LEBAR_MAKS / lebar);
  const kanvas = document.createElement('canvas');
  kanvas.width = Math.round(lebar * skala);
  kanvas.height = Math.round(tinggi * skala);
  kanvas.getContext('2d')!.drawImage(sumber, 0, 0, kanvas.width, kanvas.height);
  return new Promise((r) => kanvas.toBlob(r, 'image/jpeg', 0.6));
}

export function useRekamLayar({ aktif, intervalDetik, sesiId, lapor }: {
  aktif: boolean; intervalDetik: number; sesiId: string; lapor: Lapor;
}) {
  const diAplikasi = !!aplikasi?.tangkapLayar;
  const [status, setStatus] = useState<StatusLayar>(() => (!aktif ? 'mati' : diAplikasi ? 'aktif' : 'perlu-izin'));
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const laporRef = useRef(lapor);
  laporRef.current = lapor;

  const ambil = useCallback(async (): Promise<Blob | null> => {
    if (diAplikasi) {
      const data = await aplikasi!.tangkapLayar().catch(() => null);
      return data ? new Blob([data as BlobPart], { type: 'image/jpeg' }) : null;
    }
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return null;
    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.muted = true;
    }
    return gambarDariTrack(track, videoRef.current);
  }, [diAplikasi]);

  const kirim = useCallback(async (pemicu: 'BERKALA' | 'PELANGGARAN', keterangan = '') => {
    const gambar = await ambil();
    if (!gambar) return;
    const form = new FormData();
    form.append('pemicu', pemicu);
    if (keterangan) form.append('keterangan', keterangan);
    form.append('layar', gambar, 'layar.jpg');
    // Gagal kirim satu tangkapan tidak boleh mengganggu ujian.
    await api.post(`/siswa/sesi/${sesiId}/layar`, form).catch(() => {});
  }, [ambil, sesiId]);

  /** Dipanggil dari tombol "Bagikan seluruh layar" (butuh klik pengguna). */
  const mulaiBerbagi = useCallback(async () => {
    if (diAplikasi || !navigator.mediaDevices?.getDisplayMedia) return;
    // Dialog berbagi milik browser membuat halaman kehilangan fokus/layar penuh: jangan dihitung.
    jedaPengawasan(60_000);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: 1 },
        audio: false,
        // Opsi Chromium: tawarkan "seluruh layar", sembunyikan tab ini & tombol ganti sumber.
        monitorTypeSurfaces: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions);
      const track = stream.getVideoTracks()[0];
      const permukaan = track.getSettings().displaySurface;
      if (permukaan && permukaan !== 'monitor') {
        stream.getTracks().forEach((t) => t.stop());
        setStatus('salah-pilih');
        return;
      }
      track.addEventListener('ended', () => {
        streamRef.current = null;
        setStatus('perlu-izin');
        laporRef.current('LAYAR_TIDAK_DIBAGIKAN', 'Siswa menghentikan berbagi layar');
      });
      streamRef.current = stream;
      setStatus('aktif');
      // Coba kembali ke layar penuh; bila browser menolak, layar kunci "kembali ke layar penuh" muncul.
      await masukLayarPenuh();
    } catch {
      setStatus((s) => (s === 'salah-pilih' ? s : 'perlu-izin'));
    } finally {
      // Dialog sudah tertutup: pengawasan aktif lagi setelah fokus kembali.
      jedaPengawasan(2_000);
    }
  }, [diAplikasi]);

  // Tangkapan berkala.
  useEffect(() => {
    if (!aktif || status !== 'aktif' || intervalDetik <= 0) return;
    kirim('BERKALA');
    const id = window.setInterval(() => kirim('BERKALA'), intervalDetik * 1000);
    return () => window.clearInterval(id);
  }, [aktif, status, intervalDetik, kirim]);

  // Hentikan berbagi layar saat ujian selesai / halaman ditinggalkan.
  useEffect(() => {
    if (aktif) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [aktif]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  /** Tangkapan sesaat setelah pelanggaran (mis. siswa pindah tab: terekam tab tujuannya). */
  const tangkapPelanggaran = useCallback((keterangan: string) => {
    if (!aktif || status !== 'aktif') return;
    window.setTimeout(() => kirim('PELANGGARAN', keterangan), TUNDA_PELANGGARAN_MS);
  }, [aktif, status, kirim]);

  return { status, mulaiBerbagi, tangkapPelanggaran, diAplikasi };
}
