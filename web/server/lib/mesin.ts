/**
 * Mesin ujian: konversi huruf acak, penilaian, dan penyelesaian sesi.
 *
 * Jawaban selalu disimpan dalam huruf ASLI (sesuai urutan opsi di bank soal).
 * Bila opsi diacak, posisi tampil dipetakan lewat urutan sesi:
 *   { i: idSoal, o: [indeks opsi asli untuk posisi tampil 0..3] }
 * Soal ISIAN tidak punya pilihan: o = [] dan jawabannya berupa teks apa adanya.
 */
import { config } from '../config.ts';
import { prisma, type Soal, type StatusHasil } from '../db.ts';
import { galat } from './galat.ts';
import { MAKS_PANJANG_ISIAN, nilaiJawaban } from './jawaban.ts';
import { HURUF } from './util.ts';

export type ItemUrutan = { i: string; o: number[] };
export type Jawaban = Record<string, string>;
export type PetaSoal = Map<string, Soal>;

export async function petaSoal(ids?: string[]): Promise<PetaSoal> {
  const soal = await prisma.soal.findMany(ids ? { where: { id: { in: ids } } } : undefined);
  return new Map(soal.map((s) => [s.id, s]));
}

function hurufKeIndeks(nilai: unknown): number[] {
  const daftar = Array.isArray(nilai) ? nilai : String(nilai ?? '').split(',');
  return daftar.map((h) => HURUF.indexOf(String(h).trim().toUpperCase() as never)).filter((i) => i !== -1);
}

const adalahIsian = (item: ItemUrutan) => item.o.length === 0;

/** Huruf yang dilihat siswa → huruf asli. */
export function keHurufAsli(item: ItemUrutan, tampil: unknown): string {
  if (adalahIsian(item)) return String(tampil ?? '').trim().slice(0, MAKS_PANJANG_ISIAN);
  const asli = hurufKeIndeks(tampil).map((i) => HURUF[item.o[i] ?? i]);
  return [...new Set(asli)].sort().join(',');
}

/** Huruf asli → huruf yang dilihat siswa. */
export function keHurufTampil(item: ItemUrutan, asli: string): string {
  if (adalahIsian(item)) return asli;
  return hurufKeIndeks(asli)
    .map((i) => HURUF[item.o.indexOf(i)])
    .sort()
    .join(',');
}

export function jawabanKeAsli(urutan: ItemUrutan[], masuk: Record<string, unknown> | undefined): Jawaban {
  const hasil: Jawaban = {};
  for (const item of urutan) {
    if (masuk?.[item.i] === undefined) continue;
    const asli = keHurufAsli(item, masuk[item.i]);
    if (asli) hasil[item.i] = asli;
  }
  return hasil;
}

export function jawabanKeTampil(urutan: ItemUrutan[], jawaban: Jawaban): Jawaban {
  const hasil: Jawaban = {};
  for (const item of urutan) if (jawaban[item.i]) hasil[item.i] = keHurufTampil(item, jawaban[item.i]);
  return hasil;
}

/**
 * PG  : benar bila huruf sama dengan kunci.
 * PGK : benar bila semua pilihan tepat (tanpa nilai parsial).
 * ISIAN: benar bila cocok dengan salah satu jawaban yang diterima (lihat lib/jawaban.ts).
 * Soal kosong dihitung salah sekaligus dicatat sebagai kosong.
 */
export function hitungNilai(daftarId: string[], jawaban: Jawaban, peta: PetaSoal) {
  const hasil = { jumlahSoal: 0, benar: 0, salah: 0, kosong: 0, nilai: 0 };
  let skor = 0;
  let maks = 0;
  for (const id of daftarId) {
    const soal = peta.get(id);
    if (!soal || !soal.kunci) continue;
    const { jawab, benar } = nilaiJawaban(soal, jawaban[id]);
    hasil.jumlahSoal++;
    maks += soal.skor;
    if (benar) {
      hasil.benar++;
      skor += soal.skor;
    } else {
      hasil.salah++;
      if (!jawab) hasil.kosong++;
    }
  }
  hasil.nilai = maks > 0 ? Math.round((skor / maks) * 100) : 0;
  return hasil;
}

export function sisaDetik(batasWaktu: Date | null): number | null {
  return batasWaktu ? Math.max(0, Math.floor((batasWaktu.getTime() - Date.now()) / 1000)) : null;
}

export function sesiKadaluarsa(batasWaktu: Date | null): boolean {
  return !!batasWaktu && Date.now() > batasWaktu.getTime() + config.toleransiWaktuDetik * 1000;
}

/**
 * Menilai sesi dan menyimpan hasil. Aman terhadap klik ganda/permintaan
 * bersamaan: sesi diklaim dengan updateMany bersyarat status BERLANGSUNG.
 */
export async function finalisasiSesi(sesiId: string, jawabanBaru: Jawaban | null, status: StatusHasil) {
  return prisma.$transaction(async (tx) => {
    const sesi = await tx.sesiUjian.findUnique({ where: { id: sesiId }, include: { ujian: true, siswa: { include: { sekolah: true } } } });
    if (!sesi) throw galat(404, 'Sesi ujian tidak ditemukan.');

    const jawaban = jawabanBaru ?? (sesi.jawaban as Jawaban);
    const klaim = await tx.sesiUjian.updateMany({
      where: { id: sesiId, status: 'BERLANGSUNG' },
      data: { status: 'SELESAI', jawaban, terakhirAktif: new Date() },
    });
    if (klaim.count === 0) throw galat(409, 'Ujian ini sudah dikirim sebelumnya.');

    const urutan = sesi.urutan as ItemUrutan[];
    const ids = urutan.map((u) => u.i);
    const soal = await tx.soal.findMany({ where: { id: { in: ids } } });
    const nilai = hitungNilai(ids, jawaban, new Map(soal.map((s) => [s.id, s])));

    const sekarang = Date.now();
    const akhir = sesi.batasWaktu ? Math.min(sekarang, sesi.batasWaktu.getTime()) : sekarang;
    const hasil = await tx.hasil.create({
      data: {
        sesiUjianId: sesi.id,
        ujianId: sesi.ujianId,
        namaUjian: sesi.ujian.nama,
        mataPelajaran: sesi.ujian.mataPelajaran,
        siswaId: sesi.siswaId,
        sekolahId: sesi.siswa.sekolahId,
        namaSekolah: sesi.siswa.sekolah.nama,
        nisn: sesi.siswa.nisn,
        namaSiswa: sesi.siswa.nama,
        kelas: sesi.siswa.kelas,
        username: sesi.siswa.username,
        nilai: nilai.nilai,
        benar: nilai.benar,
        salah: nilai.salah,
        kosong: nilai.kosong,
        durasiDetik: Math.max(0, Math.floor((akhir - sesi.mulai.getTime()) / 1000)),
        status,
        jawaban,
        jumlahPelanggaran: sesi.jumlahPelanggaran,
      },
    });
    return { hasil, nilai, sesi, jawaban };
  });
}

/** Menilai otomatis sesi yang waktunya habis (siswa menutup halaman, dsb.). */
export async function selesaikanKadaluarsa(siswaId?: string) {
  const sesi = await prisma.sesiUjian.findMany({
    where: { status: 'BERLANGSUNG', batasWaktu: { not: null }, ...(siswaId ? { siswaId } : {}) },
    select: { id: true, batasWaktu: true },
  });
  for (const s of sesi) {
    if (!sesiKadaluarsa(s.batasWaktu)) continue;
    await finalisasiSesi(s.id, null, 'WAKTU_HABIS').catch((err) => {
      if (err?.status !== 409) console.error('Gagal menyelesaikan sesi', s.id, err);
    });
  }
}

/** Soal dalam urutan & huruf yang dilihat siswa, lengkap dengan kunci bila diizinkan. */
export function susunPembahasan(urutan: ItemUrutan[], jawaban: Jawaban, peta: PetaSoal, denganKunci: boolean) {
  return urutan.flatMap((item, nomor) => {
    const soal = peta.get(item.i);
    if (!soal) return [];
    const { jawab, benar } = nilaiJawaban(soal, jawaban[item.i]);
    const isian = soal.tipe === 'ISIAN';
    return [{
      nomor: nomor + 1,
      id: soal.id,
      tipe: soal.tipe,
      bahasa: soal.bahasa,
      kode: soal.kode,
      pertanyaan: soal.pertanyaan,
      gambar: soal.gambar,
      // Isian tidak punya pilihan; urutan item admin ([0..3]) tidak boleh dipakai untuk memetakan teks.
      opsi: isian ? [] : item.o.map((k) => soal.opsi[k] ?? ''),
      opsiGambar: isian ? [] : item.o.map((k) => soal.opsiGambar[k] ?? ''),
      jawaban: isian ? jawab : keHurufTampil(item, jawab),
      kunci: denganKunci ? (isian ? soal.kunci : keHurufTampil(item, soal.kunci)) : '',
      benar,
      pembahasan: denganKunci ? soal.pembahasan : '',
    }];
  });
}
