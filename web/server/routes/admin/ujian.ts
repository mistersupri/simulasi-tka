import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma, type Hasil } from '../../db.ts';
import { kirimBerkas } from '../../lib/berkas.ts';
import { config } from '../../config.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import {
  finalisasiSesi, petaSoal, selesaikanKadaluarsa, sisaDetik, susunPembahasan, type ItemUrutan, type Jawaban,
} from '../../lib/mesin.ts';
import { ambilPengaturan, kkmDari } from '../../lib/pengaturan.ts';
import { butuhStaf } from '../../lib/sesi.ts';
import { buatTokenUjian, daftarKelas, normalisasiKunci } from '../../lib/util.ts';

export const rutAdminUjian = Router();
rutAdminUjian.use(butuhStaf());

// ------------------------------------------------------------------
// Jadwal ujian
// ------------------------------------------------------------------

rutAdminUjian.get('/ujian', async (_req, res) => {
  const [ujian, soal, peserta] = await Promise.all([
    prisma.ujian.findMany({ orderBy: { dibuat: 'desc' } }),
    prisma.soal.findMany({ where: { aktif: true }, select: { mataPelajaran: true, kelas: true } }),
    prisma.hasil.groupBy({ by: ['ujianId'], _count: true }),
  ]);
  const jumlahPeserta = new Map(peserta.map((p) => [p.ujianId, p._count]));
  res.json({
    // Fitur "wajib aplikasi" hanya bisa dipakai bila server punya KUNCI_APLIKASI.
    aplikasiTersedia: !!config.kunciAplikasi,
    daftarMapel: [...new Set(soal.map((s) => s.mataPelajaran))].sort(),
    ujian: ujian.map((u) => {
      const cocok = soal.filter((s) => s.mataPelajaran.toLowerCase() === u.mataPelajaran.toLowerCase());
      const kelas = u.kelas.length ? u.kelas : [...new Set(cocok.map((s) => s.kelas))].sort();
      return {
        ...u,
        soalPerKelas: Object.fromEntries(kelas.map((k) => [k, cocok.filter((s) => s.kelas === k).length])),
        jumlahPeserta: jumlahPeserta.get(u.id) ?? 0,
      };
    }),
  });
});

const skemaUjian = z.object({
  nama: z.string().trim().min(1, 'Nama ujian wajib diisi.'),
  mataPelajaran: z.string().trim().min(1, 'Mata pelajaran wajib diisi.'),
  kelas: z.union([z.string(), z.array(z.string())]).default([]).transform(daftarKelas),
  durasiMenit: z.coerce.number().int().min(0).default(60),
  jumlahSoal: z.coerce.number().int().min(0).default(0),
  waktuMulai: z.coerce.date().nullable().default(null),
  waktuSelesai: z.coerce.date().nullable().default(null),
  token: z.string().trim().toUpperCase().default('').transform((t) => t || null),
  acakSoal: z.boolean().default(true),
  acakOpsi: z.boolean().default(false),
  tampilkanNilai: z.boolean().default(true),
  tampilkanPembahasan: z.boolean().default(false),
  maksPercobaan: z.coerce.number().int().min(0).default(1),
  wajibLayarPenuh: z.boolean().default(true),
  wajibKamera: z.boolean().default(false),
  maksPelanggaran: z.coerce.number().int().min(0).default(5),
  wajibAplikasi: z.boolean().default(false),
  aktif: z.boolean().default(true),
}).refine((d) => !d.wajibAplikasi || !!config.kunciAplikasi, {
  message: 'Server belum diatur untuk aplikasi Windows (KUNCI_APLIKASI kosong).',
}).refine((d) => !d.waktuMulai || !d.waktuSelesai || d.waktuSelesai > d.waktuMulai, {
  message: 'Waktu selesai harus setelah waktu mulai.',
});

rutAdminUjian.post('/ujian', async (req, res) => {
  const d = skemaUjian.parse(req.body);
  const u = await prisma.ujian.create({ data: d });
  await catatLog(req.staf!, 'TAMBAH_UJIAN', u.nama);
  res.json({ pesan: 'Ujian ditambahkan.', id: u.id });
});

rutAdminUjian.put('/ujian/:id', async (req, res) => {
  const d = skemaUjian.parse(req.body);
  const u = await prisma.ujian.update({ where: { id: String(req.params.id) }, data: d }).catch(() => null);
  if (!u) throw galat(404, 'Ujian tidak ditemukan.');
  await catatLog(req.staf!, 'UBAH_UJIAN', u.nama);
  res.json({ pesan: 'Ujian diperbarui.', id: u.id });
});

rutAdminUjian.delete('/ujian/:id', async (req, res) => {
  const id = String(req.params.id);
  const berjalan = await prisma.sesiUjian.count({ where: { ujianId: id, status: 'BERLANGSUNG' } });
  if (berjalan) throw galat(400, `Masih ada ${berjalan} siswa yang sedang mengerjakan ujian ini.`);
  const u = await prisma.ujian.delete({ where: { id } }).catch(() => null);
  if (!u) throw galat(404, 'Ujian tidak ditemukan.');
  await catatLog(req.staf!, 'HAPUS_UJIAN', u.nama);
  res.json({ pesan: 'Ujian dihapus. Hasil ujian tetap tersimpan.' });
});

rutAdminUjian.post('/ujian/:id/token', async (req, res) => {
  const token = buatTokenUjian();
  const u = await prisma.ujian.update({ where: { id: String(req.params.id) }, data: { token } }).catch(() => null);
  if (!u) throw galat(404, 'Ujian tidak ditemukan.');
  await catatLog(req.staf!, 'TOKEN_UJIAN', u.nama);
  res.json({ token });
});

// ------------------------------------------------------------------
// Hasil
// ------------------------------------------------------------------

rutAdminUjian.get('/hasil', async (_req, res) => {
  const kkm = kkmDari(await ambilPengaturan());
  const hasil = await prisma.hasil.findMany({ orderBy: { tanggal: 'desc' }, omit: { jawaban: true } });
  res.json({ kkm, hasil });
});

rutAdminUjian.get('/hasil/:id', async (req, res) => {
  const h = await prisma.hasil.findUnique({
    where: { id: String(req.params.id) },
    include: { sesiUjian: { include: { pelanggaran: { orderBy: { waktu: 'asc' } } } } },
  });
  if (!h) throw galat(404, 'Hasil tidak ditemukan.');
  const jawaban = h.jawaban as Jawaban;
  // Detail admin memakai huruf asli (o = identitas), bukan huruf acakan siswa.
  const ids = ((h.sesiUjian?.urutan ?? []) as ItemUrutan[]).map((u) => u.i);
  const urutan = (ids.length ? ids : Object.keys(jawaban)).map((i) => ({ i, o: [0, 1, 2, 3] }));
  const { sesiUjian, ...hasil } = h;
  res.json({
    hasil,
    soal: susunPembahasan(urutan, jawaban, await petaSoal(urutan.map((u) => u.i)), true),
    pelanggaran: sesiUjian?.pelanggaran ?? [],
  });
});

rutAdminUjian.post('/hasil/hapus', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
  const r = await prisma.hasil.deleteMany({ where: { id: { in: ids } } });
  await catatLog(req.staf!, 'HAPUS_HASIL', `${r.count} hasil`);
  res.json({ pesan: `${r.count} hasil dihapus. Siswa dapat mengerjakan ujian itu lagi.` });
});

/** Statistik & analisis butir: tingkat kesukaran (p) dan sebaran pilihan. */
async function analisis(ujianId: string) {
  const hasil = await prisma.hasil.findMany({ where: { ujianId }, include: { sesiUjian: { select: { urutan: true } } } });
  const kkm = kkmDari(await ambilPengaturan());
  const peta = await petaSoal();
  const nilai = hasil.map((h) => h.nilai);
  const butir = new Map<string, { id: string; pertanyaan: string; kunci: string; peserta: number; benar: number; kosong: number; sebaran: Record<string, number> }>();

  for (const h of hasil) {
    const jawaban = h.jawaban as Jawaban;
    const ids = h.sesiUjian ? (h.sesiUjian.urutan as ItemUrutan[]).map((u) => u.i) : Object.keys(jawaban);
    for (const id of ids) {
      const soal = peta.get(id);
      if (!soal) continue;
      const b = butir.get(id) ?? { id, pertanyaan: soal.pertanyaan, kunci: soal.kunci, peserta: 0, benar: 0, kosong: 0, sebaran: { A: 0, B: 0, C: 0, D: 0 } };
      const jawab = normalisasiKunci(jawaban[id], soal.tipe);
      b.peserta++;
      if (!jawab) b.kosong++;
      else if (jawab === soal.kunci) b.benar++;
      for (const x of jawab.split(',')) if (x in b.sebaran) b.sebaran[x]++;
      butir.set(id, b);
    }
  }

  const daftarButir = [...butir.values()]
    .map((b) => {
      const p = b.peserta ? Math.round((b.benar / b.peserta) * 100) : 0;
      return { ...b, p, kategori: p >= 70 ? 'Mudah' : p >= 30 ? 'Sedang' : 'Sukar' };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    jumlahPeserta: hasil.length,
    rataRata: nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 10) / 10 : 0,
    tertinggi: nilai.length ? Math.max(...nilai) : 0,
    terendah: nilai.length ? Math.min(...nilai) : 0,
    kkm,
    tuntas: kkm > 0 ? nilai.filter((n) => n >= kkm).length : null,
    sebaranNilai: Array.from({ length: 10 }, (_, i) => nilai.filter((n) => Math.min(9, Math.floor(n / 10)) === i).length),
    butir: daftarButir,
  };
}

rutAdminUjian.get('/analisis/:ujianId', async (req, res) => {
  const ujian = await prisma.ujian.findUnique({ where: { id: String(req.params.ujianId) } });
  res.json({ ujian, analisis: await analisis(String(req.params.ujianId)) });
});

const labelStatus: Record<Hasil['status'], string> = {
  SELESAI: 'Selesai', WAKTU_HABIS: 'Waktu habis', DIHENTIKAN: 'Dihentikan pengawas', PELANGGARAN: 'Dihentikan karena pelanggaran',
};

/** Unduh hasil sebagai .xlsx (nilai + analisis butir bila satu ujian). */
rutAdminUjian.get('/ekspor.xlsx', async (req, res) => {
  const ujianId = typeof req.query.ujianId === 'string' && req.query.ujianId ? req.query.ujianId : null;
  const kkm = kkmDari(await ambilPengaturan());
  const hasil = await prisma.hasil.findMany({
    where: ujianId ? { ujianId } : {},
    orderBy: [{ kelas: 'asc' }, { namaSiswa: 'asc' }],
  });

  const wb = new ExcelJS.Workbook();
  const tebal = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  // Teks yang diawali = + - @ bisa terbaca sebagai rumus; awali dengan petik.
  const aman = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

  const ws = wb.addWorksheet('Nilai');
  ws.columns = [
    { header: 'No', width: 5 }, { header: 'NISN', width: 14 }, { header: 'Nama Siswa', width: 28 }, { header: 'Kelas', width: 7 },
    { header: 'Ujian', width: 28 }, { header: 'Mata Pelajaran', width: 18 }, { header: 'Tanggal', width: 18 }, { header: 'Nilai', width: 7 },
    { header: 'Benar', width: 7 }, { header: 'Salah', width: 7 }, { header: 'Kosong', width: 8 }, { header: 'Durasi (menit)', width: 13 },
    { header: 'Pelanggaran', width: 12 }, { header: 'Status', width: 26 }, { header: 'Keterangan', width: 14 },
  ];
  hasil.forEach((h, i) => ws.addRow([
    i + 1, aman(h.nisn), aman(h.namaSiswa), h.kelas, aman(h.namaUjian), aman(h.mataPelajaran), h.tanggal, h.nilai, h.benar,
    h.salah - h.kosong, h.kosong, Math.round(h.durasiDetik / 6) / 10, h.jumlahPelanggaran, labelStatus[h.status],
    kkm > 0 ? (h.nilai >= kkm ? 'Tuntas' : 'Belum tuntas') : '',
  ]));
  ws.getColumn(7).numFmt = 'dd/mm/yyyy hh:mm';
  tebal(ws);

  if (ujianId) {
    const a = await analisis(ujianId);
    const wa = wb.addWorksheet('Analisis Butir');
    wa.columns = ['ID Soal', 'Pertanyaan', 'Kunci', 'Peserta', 'Benar', 'Kosong', '% Benar', 'Kategori', 'Pilih A', 'Pilih B', 'Pilih C', 'Pilih D']
      .map((header, i) => ({ header, width: i === 1 ? 60 : 10 }));
    for (const b of a.butir) {
      wa.addRow([b.id, aman(b.pertanyaan), b.kunci, b.peserta, b.benar, b.kosong, b.p, b.kategori, b.sebaran.A, b.sebaran.B, b.sebaran.C, b.sebaran.D]);
    }
    tebal(wa);
  }

  await catatLog(req.staf!, 'EKSPOR_HASIL', ujianId ?? 'semua');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="hasil-ujian-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ------------------------------------------------------------------
// Monitor peserta yang sedang ujian
// ------------------------------------------------------------------

rutAdminUjian.get('/monitor', async (_req, res) => {
  await selesaikanKadaluarsa();
  const sesi = await prisma.sesiUjian.findMany({
    where: { status: 'BERLANGSUNG' },
    include: {
      siswa: { select: { nama: true, kelas: true, username: true } },
      ujian: { select: { nama: true, maksPelanggaran: true } },
      pelanggaran: { orderBy: { waktu: 'desc' }, take: 1 },
    },
    orderBy: [{ ujianId: 'asc' }, { mulai: 'asc' }],
  });
  res.json({
    sekarang: new Date(),
    sesi: sesi.map((s) => ({
      id: s.id,
      nama: s.siswa.nama,
      kelas: s.siswa.kelas,
      username: s.siswa.username,
      namaUjian: s.ujian.nama,
      jumlahSoal: (s.urutan as ItemUrutan[]).length,
      terjawab: Object.keys(s.jawaban as Jawaban).length,
      ragu: s.ragu.length,
      mulai: s.mulai,
      sisaDetik: sisaDetik(s.batasWaktu),
      terakhirAktif: s.terakhirAktif,
      jumlahPelanggaran: s.jumlahPelanggaran,
      maksPelanggaran: s.ujian.maksPelanggaran,
      pelanggaranTerakhir: s.pelanggaran[0] ?? null,
    })),
  });
});

rutAdminUjian.get('/sesi/:id/pelanggaran', async (req, res) => {
  res.json(await prisma.pelanggaran.findMany({ where: { sesiUjianId: String(req.params.id) }, orderBy: { waktu: 'asc' } }));
});

rutAdminUjian.get('/berkas/pelanggaran/:nama', (req, res) => {
  kirimBerkas(res, 'pelanggaran', String(req.params.nama));
});

/** KIRIM = paksa selesai, RESET = hapus sesi (siswa mulai ulang), TAMBAH_WAKTU = tambah menit. */
rutAdminUjian.post('/sesi/:id/aksi', async (req, res) => {
  const { aksi, menit } = z.object({ aksi: z.enum(['KIRIM', 'RESET', 'TAMBAH_WAKTU']), menit: z.coerce.number().int().min(1).max(240).default(10) }).parse(req.body);
  const sesi = await prisma.sesiUjian.findUnique({ where: { id: String(req.params.id) }, include: { siswa: true } });
  if (!sesi || sesi.status !== 'BERLANGSUNG') throw galat(404, 'Sesi tidak ditemukan atau sudah selesai.');

  if (aksi === 'KIRIM') {
    const r = await finalisasiSesi(sesi.id, null, 'DIHENTIKAN');
    await catatLog(req.staf!, 'PAKSA_KIRIM', sesi.siswa.username);
    res.json({ pesan: `Ujian ${sesi.siswa.nama} dikirim. Nilai: ${r.nilai.nilai}.` });
  } else if (aksi === 'RESET') {
    await prisma.sesiUjian.delete({ where: { id: sesi.id } });
    await catatLog(req.staf!, 'RESET_SESI', sesi.siswa.username);
    res.json({ pesan: `Sesi ${sesi.siswa.nama} direset. Siswa dapat memulai ulang.` });
  } else {
    if (!sesi.batasWaktu) throw galat(400, 'Ujian ini tidak memiliki batas waktu.');
    const dasar = Math.max(sesi.batasWaktu.getTime(), Date.now());
    await prisma.sesiUjian.update({ where: { id: sesi.id }, data: { batasWaktu: new Date(dasar + menit * 60000) } });
    await catatLog(req.staf!, 'TAMBAH_WAKTU', `${sesi.siswa.username} +${menit} menit`);
    res.json({ pesan: `Waktu ${sesi.siswa.nama} ditambah ${menit} menit.` });
  }
});
