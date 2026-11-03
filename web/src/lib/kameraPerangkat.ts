/** Bagian kamera yang memakai API browser (getUserMedia). Penjelasan galatnya ada di kamera.ts. */
import { galatBisaDilonggarkan } from './kamera';

/** Membuka kamera depan 640x480; bila ditolak karena syaratnya, coba lagi dengan kamera apa saja. */
export async function bukaKamera(): Promise<MediaStream> {
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
