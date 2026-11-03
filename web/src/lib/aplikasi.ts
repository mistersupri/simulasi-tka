/** Jembatan dari aplikasi ujian Windows (desktop/preload.cjs). Tidak ada di browser biasa. */
type JembatanAplikasi = {
  versi: string;
  /** Menutup aplikasi. Saat ujian berjalan, aplikasi meminta akun pengawas dulu. */
  keluar: () => void;
  /** true selama jendela izin pengawas terbuka; pelanggaran tidak dicatat. */
  jeda: () => boolean;
  cobaLagi: () => void;
  /** Pindah ke mode kiosk (layar penuh). Dipanggil setelah layar persiapan. */
  masukKiosk?: () => void;
  /** Tangkapan seluruh layar (JPEG) oleh aplikasi, tanpa dialog berbagi layar. */
  tangkapLayar: () => Promise<Uint8Array | null>;
  /**
   * Status izin kamera di Windows: "granted", "denied", "not-determined", "restricted", atau "unknown".
   * Tidak ada di aplikasi versi lama, jadi selalu diperiksa dulu sebelum dipanggil.
   */
  statusKamera?: () => Promise<string | null>;
};

declare global {
  interface Window {
    aplikasiTka?: JembatanAplikasi;
  }
}

export const aplikasi = typeof window !== 'undefined' ? window.aplikasiTka : undefined;
