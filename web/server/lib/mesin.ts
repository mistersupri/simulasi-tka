/**
 * Mesin ujian: konversi huruf acak, penilaian, dan penyelesaian sesi.
 *
 * Jawaban selalu disimpan dalam huruf ASLI (sesuai urutan opsi di bank soal).
 * Bila opsi diacak, posisi tampil dipetakan lewat urutan sesi:
 *   { i: idSoal, o: [indeks opsi asli untuk posisi tampil 0..3] }
 */
import { config } from '../config.ts';
import { prisma, type Soal, type StatusHasil } from '../db.ts';
import { galat } from './galat.ts';
import { HURUF, normalisasiKunci } from './util.ts';

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

/** Huruf yang dilihat siswa → huruf asli. */
export function keHurufAsli(item: ItemUrutan, tampil: unknown): string {
  const asli = hurufKeIndeks(tampil).map((i) => HURUF[item.o[i] ?? i]);
  return [...new Set(asli)].sort().join(',');
}

/** Huruf asli → huruf yang dilihat siswa. */
export function keHurufTampil(item: ItemUrutan, asli: string): string {
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
 * Soal kosong dihitung salah sekaligus dicatat sebagai kosong.
 */
export function hitungNilai(daftarId: string[], jawaban: Jawaban, peta: PetaSoal) {
  const hasil = { jumlahSoal: 0, benar: 0, salah: 0, kosong: 0, nilai: 0 };
  let skor = 0;
  let maks = 0;
  for (const id of daftarId) {
    const soal = peta.get(id);
    if (!soal || !soal.kunci) continue;
    const jawab = normalisasiKunci(jawaban[id], soal.tipe);
    hasil.jumlahSoal++;
    maks += soal.skor;
    if (jawab && jawab === soal.kunci) {
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
    const sesi = await tx.sesiUjian.findUnique({ where: { id: sesiId }, include: { ujian: true, siswa: true } });
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
    const jawab = normalisasiKunci(jawaban[item.i], soal.tipe);
    return [{
      nomor: nomor + 1,
      id: soal.id,
      tipe: soal.tipe,
      pertanyaan: soal.pertanyaan,
      gambar: soal.gambar,
      opsi: item.o.map((k) => soal.opsi[k] ?? ''),
      jawaban: keHurufTampil(item, jawab),
      kunci: denganKunci ? keHurufTampil(item, soal.kunci) : '',
      benar: !!jawab && jawab === soal.kunci,
      pembahasan: denganKunci ? soal.pembahasan : '',
    }];
  });
}
