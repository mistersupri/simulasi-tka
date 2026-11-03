/** Bagian kamera yang memakai API browser (getUserMedia). Penjelasan galatnya ada di kamera.ts. */
import { galatBisaDilonggarkan } from './kamera';

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JEDA_ULANG_MS = [800, 1800];

async function bukaSekali(polos = false): Promise<MediaStream> {
  if (polos) return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
export async function bukaKamera(opsi: { polos?: boolean } = {}): Promise<MediaStream> {
  let galat: unknown;
  for (let i = 0; i <= JEDA_ULANG_MS.length; i++) {
    try {
      return await bukaSekali(opsi.polos);
    } catch (err) {
      galat = err;
      const nama = (err as { name?: string })?.name ?? '';
      if (!['AbortError', 'NotReadableError', 'TrackStartError'].includes(nama) || i === JEDA_ULANG_MS.length) break;
      await tunggu(JEDA_ULANG_MS[i]);
    }
  }
  throw galat;
}

/** Jeda pendek agar Windows sempat melepas kamera yang baru dimatikan sebelum dibuka lagi. */
export const jedaKamera = (ms = 600) => tunggu(ms);

/**
 * Benar-benar hitam? Sebagian webcam/driver menyalakan lampu dan mengirim bingkai kosong.
 * Sampel kecil dari video; hitam bila tidak ada piksel yang lebih terang dari ambang kecil.
 * Ruangan gelap tetap menghasilkan noise sehingga tidak dianggap hitam.
 */
export function videoHitam(video: HTMLVideoElement): boolean {
  if (!video.videoWidth || !video.videoHeight) return true;
  const kanvas = document.createElement('canvas');
  kanvas.width = 32;
  kanvas.height = 24;
  const ctx = kanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0, kanvas.width, kanvas.height);
  const { data } = ctx.getImageData(0, 0, kanvas.width, kanvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 6 || data[i + 1] > 6 || data[i + 2] > 6) return false;
  }
  return true;
}
