/**
 * Impor database dari file Excel versi Google Spreadsheet
 * (lembar DATA_SISWA, BANK_SOAL, dan opsional UJIAN).
 * Hash kata sandi lama dipertahankan sehingga siswa tetap bisa login
 * dengan kata sandi yang sama; hash otomatis diperbarui saat login.
 */
import ExcelJS from 'exceljs';
import { prisma } from '../db.ts';
import { hashDariSheetLama } from './password.ts';
import { dataSoal, idSoalBerikutnya } from './soal.ts';
import { daftarKelas, normalisasiKelas, teks } from './util.ts';

/**
 * Nilai sel seperti yang terlihat di layar. Excel sering mengubah "3/4"
 * menjadi tanggal; dengan format m/d kita kembalikan menjadi teks "3/4".
 */
function teksSel(sel: ExcelJS.Cell): string {
  const v = sel.value;
  if (v instanceof Date) {
    const fmt = (sel.numFmt ?? '').toLowerCase();
    const b = v.getUTCMonth() + 1;
    const h = v.getUTCDate();
    if (/^m+\/d+$/.test(fmt)) return `${b}/${h}`;
    if (/^d+\/m+$/.test(fmt)) return `${h}/${b}`;
    return v.toISOString().slice(0, 10);
  }
  if (v && typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return teks(v.result);
    if ('text' in v) return teks(v.text);
  }
  return teks(v);
}

function bacaLembar(ws: ExcelJS.Worksheet | undefined): Record<string, string>[] {
  if (!ws) return [];
  const header: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (sel, kolom) => {
    header[kolom] = teksSel(sel).toUpperCase();
  });
  const hasil: Record<string, string>[] = [];
  ws.eachRow((baris, nomor) => {
    if (nomor === 1) return;
    const obj: Record<string, string> = { _nomor: String(nomor) };
    header.forEach((h, k) => {
      if (h) obj[h] = teksSel(baris.getCell(k));
    });
    if (Object.entries(obj).some(([k, v]) => k !== '_nomor' && v)) hasil.push(obj);
  });
  return hasil;
}

export type LaporanImpor = { siswa: number; soal: number; ujian: number; dilewati: { lembar: string; baris: number; alasan: string }[] };

/**
 * sekolahId: sekolah untuk siswa yang barisnya tidak punya kolom NPSN yang cocok.
 * Bila kosong dan lembar DATA_SISWA berisi siswa tanpa NPSN, siswa itu dilewati.
 */
export async function imporExcel(buffer: ArrayBuffer | Buffer, sekolahId: string | null = null): Promise<LaporanImpor> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const laporan: LaporanImpor = { siswa: 0, soal: 0, ujian: 0, dilewati: [] };
  const lewati = (lembar: string, b: Record<string, string>, alasan: string) =>
    laporan.dilewati.push({ lembar, baris: Number(b._nomor), alasan });

  const npsnKeId = new Map((await prisma.sekolah.findMany({ where: { npsn: { not: null } }, select: { id: true, npsn: true } })).map((s) => [s.npsn!, s.id]));
  for (const b of bacaLembar(wb.getWorksheet('DATA_SISWA'))) {
    const username = teks(b.USERNAME).toLowerCase();
    const npsn = teks(b.NPSN);
    const sekolahSiswa = (npsn && npsnKeId.get(npsn)) || sekolahId;
    if (npsn && !npsnKeId.has(npsn)) { lewati('DATA_SISWA', b, `NPSN ${npsn} belum terdaftar di menu Sekolah.`); continue; }
    if (!sekolahSiswa) { lewati('DATA_SISWA', b, 'Sekolah belum dipilih (isi kolom NPSN atau pilih sekolah saat impor).'); continue; }
    if (!username || !b.NAMA_SISWA) { lewati('DATA_SISWA', b, 'Username atau nama kosong.'); continue; }
    if (!b.PASSWORD_HASH || !b.PASSWORD_SALT) { lewati('DATA_SISWA', b, 'Kata sandi belum di-hash; atur ulang lewat menu Data Siswa.'); continue; }
    if (await prisma.siswa.findUnique({ where: { username } })) { lewati('DATA_SISWA', b, `Username ${username} sudah ada.`); continue; }
    await prisma.siswa.create({
      data: {
        nisn: teks(b.NISN), nama: b.NAMA_SISWA, kelas: normalisasiKelas(b.KELAS), username, sekolahId: sekolahSiswa,
        aktif: teks(b.STATUS).toUpperCase() === 'AKTIF',
        passwordHash: hashDariSheetLama(b.PASSWORD_HASH, b.PASSWORD_SALT),
      },
    });
    laporan.siswa++;
  }

  const idBaru = new Set<string>();
  for (const b of bacaLembar(wb.getWorksheet('BANK_SOAL'))) {
    try {
      const data = dataSoal({
        mataPelajaran: b.MATA_PELAJARAN, kelas: b.KELAS, pertanyaan: b.PERTANYAAN,
        opsi: [b.OPSI_A, b.OPSI_B, b.OPSI_C, b.OPSI_D], kunci: b.KUNCI_JAWABAN, skor: b.SKOR || '1',
        tipe: b.TIPE_SOAL, pembahasan: b.PEMBAHASAN, aktif: teks(b.STATUS).toUpperCase() !== 'NONAKTIF',
      });
      let id = teks(b.ID_SOAL).toUpperCase();
      if (id && (await prisma.soal.findUnique({ where: { id } }))) { lewati('BANK_SOAL', b, `ID ${id} sudah ada.`); continue; }
      if (!id) id = await idSoalBerikutnya(data.mataPelajaran, idBaru);
      await prisma.soal.create({ data: { ...data, id } });
      idBaru.add(id);
      laporan.soal++;
    } catch (err) {
      lewati('BANK_SOAL', b, (err as Error).message);
    }
  }

  const lembarUjian = bacaLembar(wb.getWorksheet('UJIAN'));
  for (const b of lembarUjian) {
    if (!b.NAMA_UJIAN || !b.MATA_PELAJARAN) continue;
    await prisma.ujian.create({
      data: {
        nama: b.NAMA_UJIAN, mataPelajaran: b.MATA_PELAJARAN, kelas: daftarKelas(b.KELAS),
        durasiMenit: Number(b.DURASI_MENIT) || 60, jumlahSoal: Number(b.JUMLAH_SOAL) || 0,
        acakSoal: teks(b.ACAK_SOAL).toUpperCase() !== 'TIDAK', acakOpsi: teks(b.ACAK_OPSI).toUpperCase() === 'YA',
      },
    });
    laporan.ujian++;
  }

  // Tanpa lembar UJIAN: buat satu ujian latihan per mapel & kelas yang baru diimpor.
  if (!lembarUjian.length && laporan.soal) {
    const grup = await prisma.soal.groupBy({ by: ['mataPelajaran', 'kelas'], where: { id: { in: [...idBaru] } } });
    for (const g of grup) {
      const nama = `Latihan ${g.mataPelajaran} Kelas ${g.kelas}`;
      if (await prisma.ujian.findFirst({ where: { nama } })) continue;
      await prisma.ujian.create({ data: { nama, mataPelajaran: g.mataPelajaran, kelas: [g.kelas], durasiMenit: 60 } });
      laporan.ujian++;
    }
  }
  return laporan;
}
