const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const dua = (n: number) => String(n).padStart(2, '0');

export function formatTanggal(nilai: string | Date | null | undefined, tanpaJam = false) {
  if (!nilai) return '-';
  const d = new Date(nilai);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}${tanpaJam ? '' : `, ${dua(d.getHours())}.${dua(d.getMinutes())}`}`;
}

export function formatDurasi(detik: number | null | undefined) {
  const s = Math.max(0, Math.floor(detik ?? 0));
  const j = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (j) return `${j} jam ${m} menit`;
  if (m) return `${m} menit ${s % 60} detik`;
  return `${s % 60} detik`;
}

export function formatJam(detik: number) {
  const s = Math.max(0, Math.floor(detik));
  const j = Math.floor(s / 3600);
  return `${j ? `${j}:` : ''}${dua(Math.floor((s % 3600) / 60))}:${dua(s % 60)}`;
}

/** Date ⇄ nilai <input type="datetime-local"> (waktu lokal perangkat). */
export function keInputWaktu(nilai: string | Date | null | undefined) {
  if (!nilai) return '';
  const d = new Date(nilai);
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}T${dua(d.getHours())}:${dua(d.getMinutes())}`;
}
export const dariInputWaktu = (teks: string) => (teks ? new Date(teks).toISOString() : null);
