import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma, type Hasil } from '../../db.ts';
import { kirimBerkas } from '../../lib/berkas.ts';
import { config } from '../../config.ts';
import { galat } from '../../lib/galat.ts';
import { INTERVAL_REKAM_MIN_DETIK, hapusTangkapanSesi } from '../../lib/layar.ts';
import { catatLog } from '../../lib/log.ts';
import {
  finalisasiSesi, petaSoal, selesaikanKadaluarsa, sisaDetik, susunPembahasan, type ItemUrutan, type Jawaban,
} from '../../lib/mesin.ts';
import { ambilPengaturan, kkmDari } from '../../lib/pengaturan.ts';
import { butuhStaf, filterSekolah, pastikanSekolah, sekolahStaf, type Staf } from '../../lib/sesi.ts';
import { nilaiJawaban } from '../../lib/jawaban.ts';
import { buatTokenUjian, daftarKelas } from '../../lib/util.ts';

/**
 * Jadwal ujian, hasil, analisis, dan monitor.
 * - Admin instansi: semua; hanya admin yang membuat/mengubah jadwal.
 * - Operator sekolah: melihat jadwal & token, memantau, dan mengelola hasil siswa sekolahnya.
 * - Guru: hanya hasil & analisis sekolahnya.
 */
export const rutAdminUjian = Router();
rutAdminUjian.use(butuhStaf());
const pengawas = butuhStaf('ADMIN', 'OPERATOR');

/** Ujian yang berlaku untuk sekolah tertentu (daftar sekolah kosong = semua sekolah). */
const ujianUntukSekolah = (sekolahId: string | null) =>
  sekolahId ? { OR: [{ sekolah: { isEmpty: true } }, { sekolah: { has: sekolahId } }] } : {};

// ------------------------------------------------------------------
// Jadwal ujian
// ------------------------------------------------------------------

rutAdminUjian.get('/ujian', pengawas, async (req, res) => {
  const sekolahId = sekolahStaf(req.staf!);
  const [ujian, soal, peserta] = await Promise.all([
    prisma.ujian.findMany({ where: ujianUntukSekolah(sekolahId), include: { pemilik: { select: { nama: true } } }, orderBy: { dibuat: 'desc' } }),
    // Operator hanya melihat soal sekolahnya; jumlah soal ujian instansi tidak ditampilkan ke sekolah.
    prisma.soal.findMany({ where: { aktif: true, ...(sekolahId ? { sekolahId } : {}) }, select: { mataPelajaran: true, kelas: true, sekolahId: true } }),
    prisma.hasil.groupBy({ by: ['ujianId'], where: sekolahId ? { sekolahId } : {}, _count: true }),
  ]);
  const jumlahPeserta = new Map(peserta.map((p) => [p.ujianId, p._count]));
  res.json({
    // Fitur "wajib aplikasi" hanya bisa dipakai bila server punya KUNCI_APLIKASI.
    aplikasiTersedia: !!config.kunciAplikasi,
    // Mapel untuk form: admin dari bank instansi, operator dari bank sekolahnya.
    daftarMapel: [...new Set(soal.filter((s) => s.sekolahId === sekolahId).map((s) => s.mataPelajaran))].sort(),
    ujian: ujian.map(({ pemilik, ...u }) => {
      const bolehUbah = !sekolahId || u.pemilikId === sekolahId;
      const cocok = soal.filter((s) => s.sekolahId === u.pemilikId && s.mataPelajaran.toLowerCase() === u.mataPelajaran.toLowerCase());
      const kelas = u.kelas.length ? u.kelas : [...new Set(cocok.map((s) => s.kelas))].sort();
      return {
        ...u,
        namaPemilik: pemilik?.nama ?? null,
        bolehUbah,
        soalPerKelas: bolehUbah ? Object.fromEntries(kelas.map((k) => [k, cocok.filter((s) => s.kelas === k).length])) : {},
        jumlahPeserta: jumlahPeserta.get(u.id) ?? 0,
      };
    }),
  });
});

const skemaUjian = z.object({
  nama: z.string().trim().min(1, 'Nama ujian wajib diisi.'),
  mataPelajaran: z.string().trim().min(1, 'Mata pelajaran wajib diisi.'),
  kelas: z.union([z.string(), z.array(z.string())]).default([]).transform(daftarKelas),
  sekolah: z.array(z.string()).default([]).transform((d) => [...new Set(d.filter(Boolean))]),
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
  intervalRekamLayar: z.coerce.number().int().min(0).max(600).default(0),
  aktif: z.boolean().default(true),
}).refine((d) => d.intervalRekamLayar === 0 || d.intervalRekamLayar >= INTERVAL_REKAM_MIN_DETIK, {
  message: `Interval rekam layar minimal ${INTERVAL_REKAM_MIN_DETIK} detik.`,
}).refine((d) => !d.wajibAplikasi || !!config.kunciAplikasi, {
  message: 'Server belum diatur untuk aplikasi Windows (KUNCI_APLIKASI kosong).',
}).refine((d) => !d.waktuMulai || !d.waktuSelesai || d.waktuSelesai > d.waktuMulai, {
  message: 'Waktu selesai harus setelah waktu mulai.',
});

async function pastikanSekolahAda(ids: string[]) {
  if (!ids.length) return;
  const ada = await prisma.sekolah.count({ where: { id: { in: ids } } });
  if (ada !== ids.length) throw galat(400, 'Ada sekolah peserta yang tidak ditemukan.');
}

/**
 * Ujian yang boleh diubah: admin semua; operator hanya ujian internal sekolahnya.
 * Ujian instansi tidak bisa diubah sekolah (token & jadwal berlaku untuk banyak sekolah).
 */
async function ujianTerjangkau(staf: Staf, id: string) {
  const u = await prisma.ujian.findUnique({ where: { id } });
  const milik = sekolahStaf(staf);
  if (!u || (milik && u.pemilikId !== milik)) throw galat(404, 'Ujian tidak ditemukan atau bukan milik sekolah Anda.');
  return u;
}

rutAdminUjian.post('/ujian', pengawas, async (req, res) => {
  const d = skemaUjian.parse(req.body);
  const milik = sekolahStaf(req.staf!);
  // Ujian sekolah selalu hanya untuk sekolah itu dan memakai bank soal sekolah itu.
  const data = milik ? { ...d, sekolah: [milik], pemilikId: milik } : d;
  await pastikanSekolahAda(data.sekolah);
  const u = await prisma.ujian.create({ data });
  await catatLog(req.staf!, 'TAMBAH_UJIAN', u.nama);
  res.json({ pesan: 'Ujian ditambahkan.', id: u.id });
});

rutAdminUjian.put('/ujian/:id', pengawas, async (req, res) => {
  const d = skemaUjian.parse(req.body);
  const lama = await ujianTerjangkau(req.staf!, String(req.params.id));
  const data = lama.pemilikId ? { ...d, sekolah: [lama.pemilikId] } : d;
  await pastikanSekolahAda(data.sekolah);
  const u = await prisma.ujian.update({ where: { id: lama.id }, data });
  await catatLog(req.staf!, 'UBAH_UJIAN', u.nama);
  res.json({ pesan: 'Ujian diperbarui.', id: u.id });
});

rutAdminUjian.delete('/ujian/:id', pengawas, async (req, res) => {
  const id = (await ujianTerjangkau(req.staf!, String(req.params.id))).id;
  const berjalan = await prisma.sesiUjian.count({ where: { ujianId: id, status: 'BERLANGSUNG' } });
  if (berjalan) throw galat(400, `Masih ada ${berjalan} siswa yang sedang mengerjakan ujian ini.`);
  const u = await prisma.ujian.delete({ where: { id } }).catch(() => null);
  if (!u) throw galat(404, 'Ujian tidak ditemukan.');
  await catatLog(req.staf!, 'HAPUS_UJIAN', u.nama);
  res.json({ pesan: 'Ujian dihapus. Hasil ujian tetap tersimpan.' });
});

rutAdminUjian.post('/ujian/:id/token', pengawas, async (req, res) => {
  const token = buatTokenUjian();
  const lama = await ujianTerjangkau(req.staf!, String(req.params.id));
  const u = await prisma.ujian.update({ where: { id: lama.id }, data: { token } });
  await catatLog(req.staf!, 'TOKEN_UJIAN', u.nama);
  res.json({ token });
});

// ------------------------------------------------------------------
// Hasil
// ------------------------------------------------------------------

rutAdminUjian.get('/hasil', async (req, res) => {
  const kkm = kkmDari(await ambilPengaturan());
  const hasil = await prisma.hasil.findMany({
    where: filterSekolah(req.staf!, req.query.sekolahId), orderBy: { tanggal: 'desc' }, omit: { jawaban: true },
  });
  res.json({ kkm, hasil });
});

rutAdminUjian.get('/hasil/:id', async (req, res) => {
  const h = await prisma.hasil.findUnique({
    where: { id: String(req.params.id) },
    include: { sesiUjian: { include: { pelanggaran: { orderBy: { waktu: 'asc' } }, tangkapanLayar: { orderBy: { waktu: 'asc' } } } } },
  });
  if (!h) throw galat(404, 'Hasil tidak ditemukan.');
  pastikanSekolah(req.staf!, h.sekolahId, 'Hasil tidak ditemukan.');
  const jawaban = h.jawaban as Jawaban;
  // Detail admin memakai huruf asli (o = identitas), bukan huruf acakan siswa.
  const ids = ((h.sesiUjian?.urutan ?? []) as ItemUrutan[]).map((u) => u.i);
  const urutan = (ids.length ? ids : Object.keys(jawaban)).map((i) => ({ i, o: [0, 1, 2, 3] }));
  const { sesiUjian, ...hasil } = h;
  res.json({
    hasil,
    soal: susunPembahasan(urutan, jawaban, await petaSoal(urutan.map((u) => u.i)), true),
    pelanggaran: sesiUjian?.pelanggaran ?? [],
    tangkapanLayar: sesiUjian?.tangkapanLayar ?? [],
  });
});

rutAdminUjian.post('/hasil/hapus', pengawas, async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
  const r = await prisma.hasil.deleteMany({ where: { id: { in: ids }, ...filterSekolah(req.staf!) } });
  await catatLog(req.staf!, 'HAPUS_HASIL', `${r.count} hasil`);
  res.json({ pesan: `${r.count} hasil dihapus. Siswa dapat mengerjakan ujian itu lagi.` });
});

/** Rata-rata, jumlah tuntas, dsb. untuk satu kelompok nilai. */
function ringkas(nilai: number[], kkm: number) {
  return {
    jumlahPeserta: nilai.length,
    rataRata: nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 10) / 10 : 0,
    tertinggi: nilai.length ? Math.max(...nilai) : 0,
    terendah: nilai.length ? Math.min(...nilai) : 0,
    tuntas: kkm > 0 ? nilai.filter((n) => n >= kkm).length : null,
  };
}

/**
 * Statistik & analisis butir: tingkat kesukaran (p), daya beda (D, kelompok atas-bawah 27%),
 * dan sebaran pilihan. sekolahId null = semua sekolah (beserta perbandingan antarsekolah).
 */
async function analisis(ujianId: string, sekolahId: string | null) {
  const hasil = await prisma.hasil.findMany({
    where: { ujianId, ...(sekolahId ? { sekolahId } : {}) },
    include: { sesiUjian: { select: { urutan: true } } },
  });
  const kkm = kkmDari(await ambilPengaturan());
  const peta = await petaSoal();
  const nilai = hasil.map((h) => h.nilai);
  const butir = new Map<string, { id: string; tipe: string; pertanyaan: string; kunci: string; peserta: number; benar: number; kosong: number; sebaran: Record<string, number> }>();

  // Kelompok atas & bawah (27% nilai tertinggi/terendah) untuk daya beda.
  const urut = [...hasil].sort((a, b) => b.nilai - a.nilai);
  const n27 = hasil.length >= 10 ? Math.max(1, Math.round(hasil.length * 0.27)) : 0;
  const atas = new Set(urut.slice(0, n27).map((h) => h.id));
  const bawah = new Set(urut.slice(urut.length - n27).map((h) => h.id));
  const benarAtas = new Map<string, number>();
  const benarBawah = new Map<string, number>();

  for (const h of hasil) {
    const jawaban = h.jawaban as Jawaban;
    const ids = h.sesiUjian ? (h.sesiUjian.urutan as ItemUrutan[]).map((u) => u.i) : Object.keys(jawaban);
    for (const id of ids) {
      const soal = peta.get(id);
      if (!soal) continue;
      const b = butir.get(id) ?? { id, tipe: soal.tipe, pertanyaan: soal.pertanyaan, kunci: soal.kunci, peserta: 0, benar: 0, kosong: 0, sebaran: { A: 0, B: 0, C: 0, D: 0 } };
      const { jawab, benar } = nilaiJawaban(soal, jawaban[id]);
      b.peserta++;
      if (!jawab) b.kosong++;
      else if (benar) {
        b.benar++;
        if (atas.has(h.id)) benarAtas.set(id, (benarAtas.get(id) ?? 0) + 1);
        if (bawah.has(h.id)) benarBawah.set(id, (benarBawah.get(id) ?? 0) + 1);
      }
      // Sebaran A-D hanya bermakna untuk pilihan ganda.
      if (soal.tipe !== 'ISIAN') for (const x of jawab.split(',')) if (x in b.sebaran) b.sebaran[x]++;
      butir.set(id, b);
    }
  }

  const daftarButir = [...butir.values()]
    .map((b) => {
      const p = b.peserta ? Math.round((b.benar / b.peserta) * 100) : 0;
      // D = (benar kelompok atas - benar kelompok bawah) / ukuran kelompok; null bila peserta < 10.
      const d = n27 ? Math.round((((benarAtas.get(b.id) ?? 0) - (benarBawah.get(b.id) ?? 0)) / n27) * 100) / 100 : null;
      return {
        ...b, p, kategori: p >= 70 ? 'Mudah' : p >= 30 ? 'Sedang' : 'Sukar',
        dayaBeda: d,
        kategoriDayaBeda: d === null ? null : d >= 0.4 ? 'Sangat baik' : d >= 0.3 ? 'Baik' : d >= 0.2 ? 'Cukup' : 'Perlu diperbaiki',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const kelompok = (kunci: (h: (typeof hasil)[number]) => string) => {
    const peta = new Map<string, number[]>();
    for (const h of hasil) peta.set(kunci(h), [...(peta.get(kunci(h)) ?? []), h.nilai]);
    return [...peta.entries()].map(([label, n]) => ({ label, ...ringkas(n, kkm) })).sort((a, b) => b.rataRata - a.rataRata);
  };

  return {
    ...ringkas(nilai, kkm),
    kkm,
    perSekolah: sekolahId ? [] : kelompok((h) => h.namaSekolah || '(tanpa sekolah)'),
    perKelas: kelompok((h) => `Kelas ${h.kelas}`).sort((a, b) => a.label.localeCompare(b.label, 'id', { numeric: true })),
    sebaranNilai: Array.from({ length: 10 }, (_, i) => nilai.filter((n) => Math.min(9, Math.floor(n / 10)) === i).length),
    butir: daftarButir,
  };
}

/** Sekolah yang dianalisis: operator & guru selalu sekolahnya; admin boleh memilih (?sekolahId=). */
const sekolahAnalisis = (staf: Staf, pilihan: unknown) => filterSekolah(staf, pilihan).sekolahId ?? null;

rutAdminUjian.get('/analisis/:ujianId', async (req, res) => {
  const ujian = await prisma.ujian.findUnique({ where: { id: String(req.params.ujianId) } });
  res.json({ ujian, analisis: await analisis(String(req.params.ujianId), sekolahAnalisis(req.staf!, req.query.sekolahId)) });
});

const labelStatus: Record<Hasil['status'], string> = {
  SELESAI: 'Selesai', WAKTU_HABIS: 'Waktu habis', DIHENTIKAN: 'Dihentikan pengawas', PELANGGARAN: 'Dihentikan karena pelanggaran',
};

/** Unduh hasil sebagai .xlsx (nilai + analisis butir bila satu ujian). */
rutAdminUjian.get('/ekspor.xlsx', async (req, res) => {
  const ujianId = typeof req.query.ujianId === 'string' && req.query.ujianId ? req.query.ujianId : null;
  const kkm = kkmDari(await ambilPengaturan());
  const sekolahId = sekolahAnalisis(req.staf!, req.query.sekolahId);
  const hasil = await prisma.hasil.findMany({
    where: { ...(ujianId ? { ujianId } : {}), ...(sekolahId ? { sekolahId } : {}) },
    orderBy: [{ namaSekolah: 'asc' }, { kelas: 'asc' }, { namaSiswa: 'asc' }],
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
    { header: 'No', width: 5 }, { header: 'Sekolah', width: 28 }, { header: 'NISN', width: 14 }, { header: 'Nama Siswa', width: 28 }, { header: 'Kelas', width: 7 },
    { header: 'Ujian', width: 28 }, { header: 'Mata Pelajaran', width: 18 }, { header: 'Tanggal', width: 18 }, { header: 'Nilai', width: 7 },
    { header: 'Benar', width: 7 }, { header: 'Salah', width: 7 }, { header: 'Kosong', width: 8 }, { header: 'Durasi (menit)', width: 13 },
    { header: 'Pelanggaran', width: 12 }, { header: 'Status', width: 26 }, { header: 'Keterangan', width: 14 },
  ];
  hasil.forEach((h, i) => ws.addRow([
    i + 1, aman(h.namaSekolah), aman(h.nisn), aman(h.namaSiswa), h.kelas, aman(h.namaUjian), aman(h.mataPelajaran), h.tanggal, h.nilai, h.benar,
    h.salah - h.kosong, h.kosong, Math.round(h.durasiDetik / 6) / 10, h.jumlahPelanggaran, labelStatus[h.status],
    kkm > 0 ? (h.nilai >= kkm ? 'Tuntas' : 'Belum tuntas') : '',
  ]));
  ws.getColumn(8).numFmt = 'dd/mm/yyyy hh:mm';
  tebal(ws);

  if (ujianId) {
    const a = await analisis(ujianId, sekolahId);
    const wa = wb.addWorksheet('Analisis Butir');
    wa.columns = ['ID Soal', 'Pertanyaan', 'Kunci', 'Peserta', 'Benar', 'Kosong', '% Benar', 'Kategori', 'Daya Beda', 'Kategori Daya Beda', 'Pilih A', 'Pilih B', 'Pilih C', 'Pilih D']
      .map((header, i) => ({ header, width: i === 1 ? 60 : i === 9 ? 18 : 10 }));
    for (const b of a.butir) {
      wa.addRow([b.id, aman(b.pertanyaan), b.kunci, b.peserta, b.benar, b.kosong, b.p, b.kategori, b.dayaBeda ?? '', b.kategoriDayaBeda ?? '', b.sebaran.A, b.sebaran.B, b.sebaran.C, b.sebaran.D]);
    }
    tebal(wa);

    const rekap = (judul: string, baris: (ReturnType<typeof ringkas> & { label: string })[]) => {
      if (!baris.length) return;
      const w = wb.addWorksheet(judul);
      w.columns = [judul === 'Per Sekolah' ? 'Sekolah' : 'Kelas', 'Peserta', 'Rata-rata', 'Tertinggi', 'Terendah', 'Tuntas']
        .map((header, i) => ({ header, width: i === 0 ? 34 : 11 }));
      for (const r of baris) w.addRow([aman(r.label), r.jumlahPeserta, r.rataRata, r.tertinggi, r.terendah, r.tuntas ?? '']);
      tebal(w);
    };
    rekap('Per Sekolah', a.perSekolah);
    rekap('Per Kelas', a.perKelas);
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

rutAdminUjian.get('/monitor', pengawas, async (req, res) => {
  await selesaikanKadaluarsa();
  const sesi = await prisma.sesiUjian.findMany({
    where: { status: 'BERLANGSUNG', siswa: filterSekolah(req.staf!, req.query.sekolahId) },
    include: {
      siswa: { select: { nama: true, kelas: true, username: true, sekolah: { select: { nama: true } } } },
      ujian: { select: { nama: true, maksPelanggaran: true } },
      pelanggaran: { orderBy: { waktu: 'desc' }, take: 1 },
      tangkapanLayar: { orderBy: { waktu: 'desc' }, take: 1 },
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
      namaSekolah: s.siswa.sekolah.nama,
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
      tangkapanTerakhir: s.tangkapanLayar[0] ?? null,
    })),
  });
});

/** Sesi ujian dalam cakupan staf (operator: siswa sekolahnya). */
async function sesiTerjangkau(staf: Staf, id: string) {
  const sesi = await prisma.sesiUjian.findUnique({ where: { id }, include: { siswa: true } });
  if (!sesi) throw galat(404, 'Sesi tidak ditemukan.');
  pastikanSekolah(staf, sesi.siswa.sekolahId, 'Sesi tidak ditemukan.');
  return sesi;
}

rutAdminUjian.get('/sesi/:id/pelanggaran', pengawas, async (req, res) => {
  const sesi = await sesiTerjangkau(req.staf!, String(req.params.id));
  res.json(await prisma.pelanggaran.findMany({ where: { sesiUjianId: sesi.id }, orderBy: { waktu: 'asc' } }));
});

rutAdminUjian.get('/sesi/:id/layar', pengawas, async (req, res) => {
  const sesi = await sesiTerjangkau(req.staf!, String(req.params.id));
  res.json(await prisma.tangkapanLayar.findMany({ where: { sesiUjianId: sesi.id }, orderBy: { waktu: 'asc' } }));
});

// Foto pelanggaran & tangkapan layar: hanya untuk staf yang berhak atas sekolah siswa itu.
rutAdminUjian.get('/berkas/layar/:nama', async (req, res) => {
  const nama = String(req.params.nama);
  const t = await prisma.tangkapanLayar.findFirst({ where: { berkas: nama }, select: { sesiUjian: { select: { siswa: { select: { sekolahId: true } } } } } });
  if (!t) throw galat(404, 'Berkas tidak ditemukan.');
  pastikanSekolah(req.staf!, t.sesiUjian.siswa.sekolahId, 'Berkas tidak ditemukan.');
  kirimBerkas(res, 'layar', nama);
});

rutAdminUjian.get('/berkas/pelanggaran/:nama', async (req, res) => {
  const nama = String(req.params.nama);
  const p = await prisma.pelanggaran.findFirst({ where: { foto: nama }, select: { sesiUjian: { select: { siswa: { select: { sekolahId: true } } } } } });
  if (!p) throw galat(404, 'Berkas tidak ditemukan.');
  pastikanSekolah(req.staf!, p.sesiUjian.siswa.sekolahId, 'Berkas tidak ditemukan.');
  kirimBerkas(res, 'pelanggaran', nama);
});

/** KIRIM = paksa selesai, RESET = hapus sesi (siswa mulai ulang), TAMBAH_WAKTU = tambah menit. */
rutAdminUjian.post('/sesi/:id/aksi', pengawas, async (req, res) => {
  const { aksi, menit } = z.object({ aksi: z.enum(['KIRIM', 'RESET', 'TAMBAH_WAKTU']), menit: z.coerce.number().int().min(1).max(240).default(10) }).parse(req.body);
  const sesi = await sesiTerjangkau(req.staf!, String(req.params.id));
  if (sesi.status !== 'BERLANGSUNG') throw galat(404, 'Sesi tidak ditemukan atau sudah selesai.');

  if (aksi === 'KIRIM') {
    const r = await finalisasiSesi(sesi.id, null, 'DIHENTIKAN');
    await catatLog(req.staf!, 'PAKSA_KIRIM', sesi.siswa.username);
    res.json({ pesan: `Ujian ${sesi.siswa.nama} dikirim. Nilai: ${r.nilai.nilai}.` });
  } else if (aksi === 'RESET') {
    await hapusTangkapanSesi(sesi.id);
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
