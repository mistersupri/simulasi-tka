import { prisma } from '../db.ts';
import { kenaliBahasa } from './bahasa.ts';
import { galat } from './galat.ts';
import { daftarJawabanIsian, MAKS_JAWABAN_DITERIMA, MAKS_PANJANG_ISIAN } from './jawaban.ts';
import { HURUF, normalisasiKelas, normalisasiKunci, teks } from './util.ts';

const KODE_MAPEL: Record<string, string> = {
  'MATEMATIKA': 'MTK',
  'BAHASA INDONESIA': 'BIN',
  'BAHASA INGGRIS': 'BIG',
  'IPA': 'IPA',
  'IPS': 'IPS',
  'IPAS': 'IPAS',
  'BAHASA ARAB': 'BAR',
  'BAHASA MANDARIN': 'BMA',
  'BAHASA CINA': 'BMA',
  'BAHASA RUSIA': 'BRU',
  'BAHASA JEPANG': 'BJP',
  'BAHASA KOREA': 'BKR',
  'BAHASA JERMAN': 'BJE',
  'BAHASA PRANCIS': 'BPR',
  'PEMROGRAMAN': 'PRG',
  'INFORMATIKA': 'INF',
  'KODING': 'KOD',
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

/** Nama berkas gambar yang kita buat sendiri (lihat berkas.ts); mencegah merujuk berkas lain. */
export const POLA_NAMA_GAMBAR = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

export type MasukanSoal = {
  mataPelajaran?: unknown; kelas?: unknown; pertanyaan?: unknown; opsi?: unknown[]; opsiGambar?: unknown[]; kunci?: unknown;
  skor?: unknown; tipe?: unknown; pembahasan?: unknown; aktif?: boolean; gambar?: unknown;
  bahasa?: unknown; pekaHuruf?: unknown; kode?: unknown;
};

const ya = (v: unknown) => v === true || ['YA', 'Y', 'TRUE', '1', 'V'].includes(teks(v).toUpperCase());

function kenaliTipe(v: unknown): 'PG' | 'PGK' | 'ISIAN' {
  const t = teks(v).toUpperCase();
  if (t === 'PGK') return 'PGK';
  if (t.startsWith('ISIAN') || t === 'KODE') return 'ISIAN';
  return 'PG';
}

function namaGambarSah(v: unknown, pesan: string): string | null {
  const t = teks(v);
  if (!t) return null;
  if (!POLA_NAMA_GAMBAR.test(t)) throw galat(400, pesan);
  return t;
}

/** Validasi & normalisasi data soal (form, impor tempel, impor Excel/ZIP). */
export type DataSoal = {
  mataPelajaran: string; kelas: string; pertanyaan: string; skor: number; tipe: 'PG' | 'PGK' | 'ISIAN'; bahasa: string;
  gambar: string | null; pembahasan: string; aktif: boolean; opsi: string[]; opsiGambar: string[]; kunci: string;
  pekaHuruf: boolean; kode: boolean;
};

export function dataSoal(d: MasukanSoal): DataSoal {
  const tipe = kenaliTipe(d.tipe);
  const bahasa = kenaliBahasa(d.bahasa);
  const skor = Number(teks(d.skor).replace(',', '.') || 1);
  const gambar = namaGambarSah(d.gambar, 'Gambar soal tidak sah.');

  if (!teks(d.mataPelajaran)) throw galat(400, 'Mata pelajaran wajib diisi.');
  if (!normalisasiKelas(d.kelas)) throw galat(400, 'Kelas wajib diisi.');
  if (!teks(d.pertanyaan) && !gambar) throw galat(400, 'Pertanyaan wajib diisi (atau beri gambar soal).');
  if (!bahasa) throw galat(400, `Bahasa "${teks(d.bahasa)}" tidak dikenal. Gunakan kode seperti id, en, ar, zh, ru, ja, ko.`);
  if (!(skor > 0)) throw galat(400, 'Skor harus lebih dari 0.');

  const dasar = {
    mataPelajaran: teks(d.mataPelajaran),
    kelas: normalisasiKelas(d.kelas),
    pertanyaan: String(d.pertanyaan ?? '').trim(),
    skor,
    tipe,
    bahasa,
    gambar,
    pembahasan: teks(d.pembahasan),
    aktif: d.aktif ?? true,
  };

  if (tipe === 'ISIAN') {
    const diterima = daftarJawabanIsian(Array.isArray(d.kunci) ? d.kunci.join('\n') : teks(d.kunci));
    if (!diterima.length) throw galat(400, 'Soal isian wajib punya minimal satu jawaban yang diterima.');
    if (diterima.length > MAKS_JAWABAN_DITERIMA) throw galat(400, `Maksimal ${MAKS_JAWABAN_DITERIMA} jawaban yang diterima.`);
    if (diterima.some((j) => j.length > MAKS_PANJANG_ISIAN)) throw galat(400, `Tiap jawaban maksimal ${MAKS_PANJANG_ISIAN} karakter.`);
    return { ...dasar, opsi: [], opsiGambar: [], kunci: diterima.join('\n'), pekaHuruf: ya(d.pekaHuruf), kode: ya(d.kode) };
  }

  const opsi = Array.from({ length: 4 }, (_, i) => teks(d.opsi?.[i]));
  const opsiGambar = Array.from({ length: 4 }, (_, i) => namaGambarSah(d.opsiGambar?.[i], `Gambar pilihan ${HURUF[i]} tidak sah.`) ?? '');
  for (const [i, o] of opsi.entries()) {
    if (!o && !opsiGambar[i]) throw galat(400, `Pilihan ${HURUF[i]} wajib diisi teks atau gambar.`);
  }
  const kunci = normalisasiKunci(d.kunci, tipe);
  if (!kunci) throw galat(400, 'Kunci jawaban wajib diisi (A, B, C, atau D).');
  if (tipe === 'PGK' && kunci.split(',').length < 2) throw galat(400, 'Soal pilihan ganda kompleks harus punya minimal 2 kunci, mis. A,C.');

  return {
    ...dasar,
    opsi,
    opsiGambar: opsiGambar.some(Boolean) ? opsiGambar : [],
    kunci,
    pekaHuruf: false,
    kode: false,
  };
}

/**
 * ID soal yang dipakai: ID yang diminta (diberi awalan NPSN untuk soal sekolah) atau nomor berikutnya.
 * `dipakai` = ID yang sudah dibuat dalam proses impor yang sama.
 */
export async function tentukanIdSoal(diminta: string, mapel: string, sekolahId: string | null, dipakai?: Set<string>) {
  const awalan = await awalanSoalSekolah(sekolahId);
  if (!diminta) return idSoalBerikutnya(mapel, dipakai, awalan);
  const id = diminta.startsWith(awalan) ? diminta : awalan + diminta;
  if (!/^[A-Z0-9_-]{2,30}$/.test(id)) throw galat(400, 'ID soal hanya boleh huruf, angka, _ atau -, maksimal 30 karakter.');
  return id;
}
