/** Bagian kamera yang memakai API browser (getUserMedia). Penjelasan galatnya ada di kamera.ts. */
import { galatBisaDilonggarkan } from './kamera';

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JEDA_ULANG_MS = [800, 1800];

async function bukaSekali(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    if (!galatBisaDilonggarkan(err as { name?: string })) throw err;
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      throw err; // galat pertama lebih informatif
    }
  }
}

/**
 * Membuka kamera depan 640x480; bila ditolak karena syaratnya, coba lagi dengan kamera apa saja.
 * Webcam di Windows sering gagal "Timeout starting video source" pada pembukaan pertama padahal
 * tidak dipakai aplikasi lain, jadi galat sementara dicoba ulang dua kali dengan jeda.
 */
export async function bukaKamera(): Promise<MediaStream> {
  let galat: unknown;
  for (let i = 0; i <= JEDA_ULANG_MS.length; i++) {
    try {
      return await bukaSekali();
    } catch (err) {
      galat = err;
      const nama = (err as { name?: string })?.name ?? '';
      if (!['AbortError', 'NotReadableError', 'TrackStartError'].includes(nama) || i === JEDA_ULANG_MS.length) break;
      await tunggu(JEDA_ULANG_MS[i]);
    }
  }
  throw galat;
}
