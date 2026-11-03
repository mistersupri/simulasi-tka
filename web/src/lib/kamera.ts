/**
 * Penjelasan KENAPA kamera gagal menyala. Murni TypeScript (tanpa DOM) agar bisa diuji di tests/;
 * pemanggilan getUserMedia ada di kameraPerangkat.ts.
 */

export type JenisGalatKamera = 'diblokir-windows' | 'ditolak' | 'tidak-ada' | 'dipakai' | 'lain';
export type PenjelasanKamera = {
  jenis: JenisGalatKamera;
  judul: string;
  /** Langkah yang bisa dilakukan siswa atau pengawas. */
  isi: string;
  /** Untuk catatan pelanggaran (terlihat oleh pengawas): nama galat asli dan status Windows. */
  detail: string;
};

type Galat = { name?: string; message?: string };

/**
 * Mengubah galat getUserMedia menjadi penjelasan yang bisa ditindaklanjuti.
 * `statusOs`: hasil systemPreferences.getMediaAccessStatus('camera') dari aplikasi Windows (bila tersedia).
 */
export function jelaskanGalatKamera(galat: Galat | null | undefined, konteks: { diAplikasi: boolean; statusOs?: string | null }): PenjelasanKamera {
  const nama = galat?.name || 'GalatTakDikenal';
  const detail = `${nama}${galat?.message ? `: ${galat.message}` : ''}${konteks.statusOs ? ` (status Windows: ${konteks.statusOs})` : ''}`.slice(0, 280);
  const buat = (jenis: JenisGalatKamera, judul: string, isi: string): PenjelasanKamera => ({ jenis, judul, isi, detail });

  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(nama)) {
    if (konteks.diAplikasi) {
      return buat(
        'diblokir-windows',
        'Windows memblokir akses kamera untuk aplikasi ini',
        'Aplikasi ujian sudah meminta izin kamera, tetapi ditolak oleh Windows. Minta pengawas membuka Pengaturan Windows > Privasi & keamanan > Kamera, '
          + 'lalu nyalakan "Akses kamera" dan "Izinkan aplikasi desktop mengakses kamera". Setelah itu coba lagi.',
      );
    }
    return buat('ditolak', 'Izin kamera ditolak', 'Klik ikon gembok atau kamera di bilah alamat browser, pilih Izinkan untuk kamera, lalu coba lagi.');
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(nama)) {
    return buat('tidak-ada', 'Kamera tidak ditemukan', 'Pastikan webcam terpasang dan terdeteksi oleh komputer (kabel USB, atau Device Manager di Windows), lalu coba lagi.');
  }
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(nama)) {
    return buat(
      'dipakai',
      'Kamera tidak bisa dibuka',
      /timeout/i.test(galat?.message ?? '')
        ? 'Kamera tidak merespons tepat waktu (bukan karena izin). Biasanya driver webcam lambat atau tersangkut: cabut dan colok ulang kabel USB webcam, atau mulai ulang komputer, lalu coba lagi.'
        : 'Kamera sedang dipakai aplikasi lain (Zoom, Teams, aplikasi Kamera, tab browser lain) atau drivernya bermasalah. Tutup aplikasi itu, lalu coba lagi.',
    );
  }
  return buat('lain', 'Kamera gagal dinyalakan', 'Coba lagi. Bila tetap gagal, beri tahu pengawas dan sebutkan kode galat di catatan pelanggaran.');
}

/** Galat yang layak dicoba lagi dengan syarat kamera yang lebih longgar (sebagian webcam menolak 640x480). */
export const galatBisaDilonggarkan = (galat: Galat | null | undefined) =>
  ['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotReadableError', 'TrackStartError', 'AbortError'].includes(galat?.name ?? '');
