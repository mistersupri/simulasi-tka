/** Bagian kamera yang memakai API browser (getUserMedia). Penjelasan galatnya ada di kamera.ts. */
import { aplikasi } from './aplikasi';
import { galatBisaDilonggarkan } from './kamera';

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JEDA_ULANG_MS = [800, 1800];

async function bukaSekali(polos = false, deviceId?: string): Promise<MediaStream> {
  if (deviceId) return navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
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

const KUNCI_KAMERA = 'tka_kamera';

/** Kamera yang dipilih di layar persiapan, diingat per perangkat. */
export function kameraPilihan(): string | null {
  try { return localStorage.getItem(KUNCI_KAMERA); } catch { return null; }
}
export function simpanKameraPilihan(id: string) {
  try { localStorage.setItem(KUNCI_KAMERA, id); } catch { /* tidak tersedia: kamera bawaan dipakai */ }
}

async function cobaUlang(buka: () => Promise<MediaStream>): Promise<MediaStream> {
  let galat: unknown;
  for (let i = 0; i <= JEDA_ULANG_MS.length; i++) {
    try {
      return await buka();
    } catch (err) {
      galat = err;
      const nama = (err as { name?: string })?.name ?? '';
      if (!['AbortError', 'NotReadableError', 'TrackStartError'].includes(nama) || i === JEDA_ULANG_MS.length) break;
      await tunggu(JEDA_ULANG_MS[i]);
    }
  }
  throw galat;
}

/**
 * Membuka kamera. Kamera yang dipilih di layar persiapan dicoba dulu; bila gagal, kembali ke kamera bawaan
 * (depan 640x480, lalu kamera apa saja). Galat sementara seperti "Timeout starting video source" dicoba ulang.
 */
export async function bukaKamera(opsi: { polos?: boolean; deviceId?: string } = {}): Promise<MediaStream> {
  if (!opsi.polos && (await pakaiKameraNative())) {
    if (opsi.deviceId) return bukaKameraNative(opsi.deviceId);
    const pilihan = kameraPilihan();
    if (pilihan) {
      try {
        return await bukaKameraNative(pilihan);
      } catch {
        // Kamera pilihan tidak ada (mis. id dari mode lain) atau gagal: pakai kamera pertama.
      }
    }
    return bukaKameraNative();
  }
  if (!opsi.polos && !opsi.deviceId) {
    const pilihan = kameraPilihan();
    if (pilihan) {
      try {
        return await cobaUlang(() => bukaSekali(false, pilihan));
      } catch {
        // Kamera pilihan tidak ada atau gagal: pakai kamera bawaan.
      }
    }
  }
  return cobaUlang(() => bukaSekali(opsi.polos, opsi.deviceId));
}

/**
 * bukaKamera dengan batas waktu. Di sebagian perangkat getUserMedia menggantung tanpa pernah selesai
 * (lampu webcam bahkan bisa menyala). Galatnya bernama AbortError dengan kata "Timeout" agar penjelasannya
 * sama dengan galat timeout bawaan Chromium. Kamera yang terlambat terbuka langsung dimatikan.
 */
export function bukaKameraDenganBatas(opsi: { polos?: boolean; deviceId?: string } = {}, ms = 20000): Promise<MediaStream> {
  return new Promise((selesai, gagal) => {
    let habis = false;
    const timer = setTimeout(() => {
      habis = true;
      const err = new Error(`Timeout: kamera tidak merespons dalam ${Math.round(ms / 1000)} detik`);
      err.name = 'AbortError';
      gagal(err);
    }, ms);
    bukaKamera(opsi).then(
      (s) => {
        clearTimeout(timer);
        if (habis) s.getTracks().forEach((t) => t.stop());
        else selesai(s);
      },
      (err) => {
        clearTimeout(timer);
        if (!habis) gagal(err);
      },
    );
  });
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

const KAMERA_INFRAMERAH = /\b(ir|infra\s?red|infrared|depth|inframerah)\b/i;
export const kameraInframerah = (nama: string) => KAMERA_INFRAMERAH.test(nama);

/**
 * Kamera lain yang bisa dicoba bila kamera bawaan gagal atau hitam. Laptop (mis. Lenovo) sering punya dua kamera:
 * warna dan inframerah (Windows Hello); Chromium kadang memilih yang inframerah. Kamera inframerah dicoba terakhir.
 * Mengembalikan pasangan id + nama; daftar kosong bila perangkat belum membuka label/id.
 */
export async function daftarKamera(kecuali?: string): Promise<{ id: string; nama: string }[]> {
  if (await pakaiKameraNative()) return (await daftarKameraNative()).filter((d) => d.id !== kecuali);
  try {
    const semua = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== kecuali);
    const unik = [...new Map(semua.map((d) => [d.deviceId, { id: d.deviceId, nama: d.label || 'kamera' }])).values()];
    return urutkanKamera(unik);
  } catch {
    return [];
  }
}

/** Kamera warna dulu, kamera inframerah (Windows Hello) terakhir. */
function urutkanKamera<T extends { nama: string }>(daftar: T[]): T[] {
  return [...daftar.filter((d) => !KAMERA_INFRAMERAH.test(d.nama)), ...daftar.filter((d) => KAMERA_INFRAMERAH.test(d.nama))];
}

// ---------------------------------------------------------------------------
// Kamera native Windows (mode "native" di layar persiapan). Gambar datang sebagai JPEG dari aplikasi,
// digambar ke kanvas, lalu kanvas dijadikan MediaStream: pratinjau, deteksi wajah, foto pelanggaran,
// dan tes bingkai bekerja sama persis dengan kamera biasa.
// ---------------------------------------------------------------------------

let modeNative: Promise<boolean> | null = null;
/** true bila aplikasi Windows memakai mode kamera native. Mode hanya berganti setelah aplikasi mulai ulang. */
export function pakaiKameraNative(): Promise<boolean> {
  if (!aplikasi?.kameraNative || !aplikasi.modeKamera) return Promise.resolve(false);
  modeNative ??= aplikasi.modeKamera().then((m) => m?.mode === 'native').catch(() => false);
  return modeNative;
}

function galatBernama(nama: string, pesan: string) {
  const err = new Error(pesan);
  err.name = nama;
  return err;
}

async function daftarKameraNative() {
  const daftar = await aplikasi!.kameraNative!.daftar().catch(() => []);
  return urutkanKamera(daftar ?? []);
}

async function bukaKameraNative(deviceId?: string): Promise<MediaStream> {
  const n = aplikasi!.kameraNative!;
  const id = deviceId ?? (await daftarKameraNative())[0]?.id;
  if (!id) throw galatBernama('NotFoundError', 'Tidak ada kamera yang terdeteksi oleh Windows.');
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const kanvas = document.createElement('canvas');
  const ctx = kanvas.getContext('2d');
  if (!ctx) throw galatBernama('NotReadableError', 'Kanvas tidak tersedia.');

  return new Promise<MediaStream>((selesai, gagal) => {
    let stream: MediaStream | null = null;
    let tutup = false;
    let menggambar = false;
    let timer: number | undefined;
    let lepasBingkai = () => {};
    let lepasBerhenti = () => {};
    const akhiri = () => {
      if (tutup) return;
      tutup = true;
      window.clearTimeout(timer);
      lepasBingkai();
      lepasBerhenti();
      void n.henti(token).catch(() => {});
    };
    timer = window.setTimeout(() => {
      akhiri();
      gagal(galatBernama('AbortError', 'Timeout: kamera native tidak mengirim gambar dalam 18 detik'));
    }, 18000);

    lepasBingkai = n.padaBingkai((t, data) => {
      if (t !== token || tutup || menggambar) return;
      menggambar = true;
      createImageBitmap(new Blob([data as unknown as BlobPart], { type: 'image/jpeg' }))
        .then((bmp) => {
          if (tutup) {
            bmp.close();
            return;
          }
          if (kanvas.width !== bmp.width || kanvas.height !== bmp.height) {
            kanvas.width = bmp.width;
            kanvas.height = bmp.height;
          }
          ctx.drawImage(bmp, 0, 0);
          bmp.close();
          if (!stream) {
            stream = kanvas.captureStream();
            const track = stream.getVideoTracks()[0];
            const stopAsli = track.stop.bind(track);
            // Menghentikan track (dipanggil semua kode kamera) ikut menghentikan proses kamera native.
            track.stop = () => {
              akhiri();
              stopAsli();
            };
            window.clearTimeout(timer);
            selesai(stream);
          }
        })
        .catch(() => { /* bingkai rusak: lewati */ })
        .finally(() => {
          menggambar = false;
        });
    });

    lepasBerhenti = n.padaBerhenti((t, info) => {
      if (t !== token || tutup) return;
      const berjalan = stream;
      akhiri();
      if (!berjalan) {
        gagal(galatBernama(info.nama || 'NotReadableError', info.pesan || 'Kamera native berhenti.'));
      } else {
        // Kamera terputus di tengah ujian: beri tahu pendengar seperti kamera biasa yang berhenti.
        berjalan.getVideoTracks()[0]?.dispatchEvent(new Event('ended'));
      }
    });

    n.mulai(id, token).then(
      (ok) => {
        if (!ok && !tutup) {
          akhiri();
          gagal(galatBernama('NotReadableError', 'Kamera native tidak tersedia di aplikasi ini.'));
        }
      },
      (err) => {
        if (!tutup) {
          akhiri();
          gagal(err);
        }
      },
    );
  });
}
