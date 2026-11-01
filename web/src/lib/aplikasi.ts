/** Jembatan dari aplikasi ujian Windows (desktop/preload.cjs). Tidak ada di browser biasa. */
type JembatanAplikasi = {
  versi: string;
  /** Menutup aplikasi. Saat ujian berjalan, aplikasi meminta akun pengawas dulu. */
  keluar: () => void;
  /** true selama jendela izin pengawas terbuka; pelanggaran tidak dicatat. */
  jeda: () => boolean;
  cobaLagi: () => void;
  /** Tangkapan seluruh layar (JPEG) oleh aplikasi, tanpa dialog berbagi layar. */
  tangkapLayar: () => Promise<Uint8Array | null>;
};

declare global {
  interface Window {
    aplikasiTka?: JembatanAplikasi;
  }
}

export const aplikasi = typeof window !== 'undefined' ? window.aplikasiTka : undefined;
