import { prisma, type Prisma } from '../db.ts';
import { galat } from './galat.ts';
import { normalisasiKelas, normalisasiKunci, teks } from './util.ts';

const KODE_MAPEL: Record<string, string> = {
  'MATEMATIKA': 'MTK',
  'BAHASA INDONESIA': 'BIN',
  'BAHASA INGGRIS': 'BIG',
  'IPA': 'IPA',
  'IPS': 'IPS',
  'IPAS': 'IPAS',
};

export function kodeMapel(mapel: string): string {
  const m = teks(mapel).toUpperCase();
  if (KODE_MAPEL[m]) return KODE_MAPEL[m];
  const kata = m.replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
  if (kata.length > 1) return kata.map((k) => k[0]).join('').slice(0, 4);
  return (kata[0] ?? 'SOAL').slice(0, 3);
}

/**
 * Awalan ID soal sekolah, mis. "20100001-" (NPSN), agar ID tidak bentrok dengan bank soal
 * instansi dan nomor urut instansi tidak terlihat oleh sekolah.
 */
export async function awalanSoalSekolah(sekolahId: string | null) {
  if (!sekolahId) return '';
  const s = await prisma.sekolah.findUnique({ where: { id: sekolahId }, select: { npsn: true, id: true } });
  return `${s?.npsn ?? sekolahId.slice(-6).toUpperCase()}-`;
}

/** ID berikutnya, mis. MTK004 bila sudah ada MTK001 sampai MTK003 (dengan awalan sekolah bila ada). */
export async function idSoalBerikutnya(mapel: string, sudahDipakai: Set<string> = new Set(), awalan = '') {
  const kode = awalan + kodeMapel(mapel);
  const ada = await prisma.soal.findMany({ where: { id: { startsWith: kode } }, select: { id: true } });
  let maks = 0;
  for (const id of [...ada.map((s) => s.id), ...sudahDipakai]) {
    const m = id.toUpperCase().match(new RegExp(`^${kode.replace(/[-]/g, '\\-')}(\\d+)$`));
    if (m) maks = Math.max(maks, Number(m[1]));
  }
  return kode + String(maks + 1).padStart(3, '0');
}

export type MasukanSoal = {
  mataPelajaran?: unknown; kelas?: unknown; pertanyaan?: unknown; opsi?: unknown[]; kunci?: unknown;
  skor?: unknown; tipe?: unknown; pembahasan?: unknown; aktif?: boolean;
};

/** Validasi & normalisasi data soal (form, impor tempel, impor Excel). */
export function dataSoal(d: MasukanSoal): Omit<Prisma.SoalUncheckedCreateInput, 'id' | 'sekolahId'> {
  const tipe = teks(d.tipe).toUpperCase() === 'PGK' ? 'PGK' : 'PG';
  const opsi = (d.opsi ?? []).slice(0, 4).map(teks);
  const kunci = normalisasiKunci(d.kunci, tipe);
  const skor = Number(teks(d.skor).replace(',', '.') || 1);

  if (!teks(d.mataPelajaran)) throw galat(400, 'Mata pelajaran wajib diisi.');
  if (!normalisasiKelas(d.kelas)) throw galat(400, 'Kelas wajib diisi.');
  if (!teks(d.pertanyaan)) throw galat(400, 'Pertanyaan wajib diisi.');
  if (opsi.length < 4 || opsi.some((o) => !o)) throw galat(400, 'Opsi A sampai D wajib diisi semua.');
  if (!kunci) throw galat(400, 'Kunci jawaban wajib diisi (A, B, C, atau D).');
  if (tipe === 'PGK' && kunci.split(',').length < 2) throw galat(400, 'Soal pilihan ganda kompleks harus punya minimal 2 kunci, mis. A,C.');
  if (!(skor > 0)) throw galat(400, 'Skor harus lebih dari 0.');

  return {
    mataPelajaran: teks(d.mataPelajaran),
    kelas: normalisasiKelas(d.kelas),
    pertanyaan: String(d.pertanyaan).trim(),
    opsi,
    kunci,
    skor,
    tipe,
    pembahasan: teks(d.pembahasan),
    aktif: d.aktif ?? true,
  };
}
