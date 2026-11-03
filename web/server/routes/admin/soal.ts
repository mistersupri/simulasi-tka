import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { hapusBerkas, simpanGambar, unggah, unggahImpor } from '../../lib/berkas.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { bacaBerkasImpor, buatTemplateSoal, buatTemplateZip, imporSoal, type BarisImpor } from '../../lib/imporSoal.ts';
import { dataSoal, tentukanIdSoal } from '../../lib/soal.ts';
import { butuhStaf, sekolahStaf, type Staf } from '../../lib/sesi.ts';

/**
 * Bank soal.
 * - Admin instansi: bank soal instansi (dipakai ujian instansi), dan bisa melihat/mengubah soal sekolah.
 * - Operator sekolah: hanya bank soal sekolahnya untuk ujian internal. Soal instansi tidak pernah
 *   terlihat oleh sekolah, sehingga kunci jawaban ujian bersama tidak bocor.
 */
export const rutAdminSoal = Router();
rutAdminSoal.use(butuhStaf('ADMIN', 'OPERATOR'));

/** Pemilik soal yang sedang dikelola: operator = sekolahnya; admin = ?sekolahId= (kosong = instansi). */
function pemilik(staf: Staf, pilihan: unknown): string | null {
  return sekolahStaf(staf) ?? (typeof pilihan === 'string' && pilihan ? pilihan : null);
}

/** Filter soal yang boleh diubah staf ini. */
const milikStaf = (staf: Staf) => {
  const s = sekolahStaf(staf);
  return s ? { sekolahId: s } : {};
};

rutAdminSoal.get('/', async (req, res) => {
  res.json(await prisma.soal.findMany({
    where: { sekolahId: pemilik(req.staf!, req.query.sekolahId) },
    orderBy: [{ mataPelajaran: 'asc' }, { kelas: 'asc' }, { id: 'asc' }],
  }));
});

/** Unggah gambar dulu, lalu simpan namanya bersama soal. */
rutAdminSoal.post('/gambar', unggah.single('gambar'), async (req, res) => {
  res.json({ nama: await simpanGambar(req.file?.buffer, 'gambar') });
});

const skemaSoal = z.object({
  id: z.string().trim().toUpperCase().default(''),
  mataPelajaran: z.string(), kelas: z.string(), pertanyaan: z.string().default(''),
  opsi: z.array(z.string()).default([]), opsiGambar: z.array(z.string()).default([]),
  kunci: z.union([z.string(), z.array(z.string())]),
  skor: z.union([z.number(), z.string()]).default(1), tipe: z.enum(['PG', 'PGK', 'ISIAN']).default('PG'),
  bahasa: z.string().default('id'), pekaHuruf: z.boolean().default(false), kode: z.boolean().default(false),
  pembahasan: z.string().default(''), aktif: z.boolean().default(true),
  gambar: z.string().nullable().default(null),
  sekolahId: z.string().nullish(), // hanya dipakai admin; operator selalu sekolahnya
});

async function pastikanSekolahAda(id: string | null) {
  if (id && !(await prisma.sekolah.findUnique({ where: { id }, select: { id: true } }))) throw galat(400, 'Sekolah tidak ditemukan.');
}

/** Semua gambar yang dirujuk satu soal: gambar soal dan gambar pilihan. */
const gambarSoal = (s: { gambar: string | null; opsiGambar: string[] }) => [s.gambar, ...s.opsiGambar].filter((n): n is string => !!n);

/** Gambar lama dibuang dari disk bila tidak dipakai soal lain (sebagai gambar soal maupun gambar pilihan). */
async function buangGambarTakTerpakai(nama: string[]) {
  for (const n of new Set(nama)) {
    if (!(await prisma.soal.count({ where: { OR: [{ gambar: n }, { opsiGambar: { has: n } }] } }))) await hapusBerkas('gambar', n);
  }
}

rutAdminSoal.post('/', async (req, res) => {
  const d = skemaSoal.parse(req.body);
  const data = dataSoal(d);
  const sekolahId = pemilik(req.staf!, d.sekolahId);
  await pastikanSekolahAda(sekolahId);
  const id = await tentukanIdSoal(d.id, data.mataPelajaran, sekolahId);
  if (await prisma.soal.findUnique({ where: { id } })) throw galat(400, `ID soal ${id} sudah dipakai.`);
  await prisma.soal.create({ data: { ...data, id, sekolahId } });
  await catatLog(req.staf!, 'TAMBAH_SOAL', id);
  res.json({ pesan: `Soal ${id} ditambahkan.`, id });
});

rutAdminSoal.put('/:id', async (req, res) => {
  const d = skemaSoal.parse(req.body);
  const lama = await prisma.soal.findFirst({ where: { id: String(req.params.id), ...milikStaf(req.staf!) } });
  if (!lama) throw galat(404, 'Soal tidak ditemukan.');
  const data = dataSoal(d);
  await prisma.soal.update({ where: { id: lama.id }, data });
  await buangGambarTakTerpakai(gambarSoal(lama).filter((n) => !gambarSoal(data).includes(n)));
  await catatLog(req.staf!, 'UBAH_SOAL', lama.id);
  res.json({ pesan: `Soal ${lama.id} diperbarui.`, id: lama.id });
});

const skemaIds = z.object({ ids: z.array(z.string()).min(1, 'Pilih minimal satu soal.') });

rutAdminSoal.post('/hapus', async (req, res) => {
  const { ids } = skemaIds.parse(req.body);
  const where = { id: { in: ids }, ...milikStaf(req.staf!) };
  const gambar = (await prisma.soal.findMany({ where, select: { gambar: true, opsiGambar: true } })).flatMap(gambarSoal);
  const r = await prisma.soal.deleteMany({ where });
  await buangGambarTakTerpakai(gambar);
  await catatLog(req.staf!, 'HAPUS_SOAL', ids.join(', '));
  res.json({ pesan: `${r.count} soal dihapus.` });
});

rutAdminSoal.post('/status', async (req, res) => {
  const { ids, aktif } = skemaIds.extend({ aktif: z.boolean() }).parse(req.body);
  const r = await prisma.soal.updateMany({ where: { id: { in: ids }, ...milikStaf(req.staf!) }, data: { aktif } });
  await catatLog(req.staf!, aktif ? 'AKTIFKAN_SOAL' : 'NONAKTIFKAN_SOAL', ids.join(', '));
  res.json({ pesan: `${r.count} soal ${aktif ? 'diaktifkan' : 'dinonaktifkan'}.` });
});

const u = z.unknown().optional();
const skemaBarisTempel = z.object({
  nomor: z.coerce.number().default(0),
  id: u, mataPelajaran: u, kelas: u, pertanyaan: u,
  opsiA: u, opsiB: u, opsiC: u, opsiD: u,
  kunci: u, skor: u, tipe: u, pembahasan: u,
  bahasa: u, pekaHuruf: u, kode: u,
}).transform((b): BarisImpor => ({
  nomor: b.nomor,
  nilai: Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'nomor').map(([k, v]) => [k, v === undefined || v === null ? '' : String(v)])),
}));

/** Impor dari tabel yang ditempel (Excel/Sheets/CSV) di browser. Gambar tidak bisa lewat jalur ini. */
rutAdminSoal.post('/impor', async (req, res) => {
  const { baris, sekolahId: pilihan } = z.object({
    sekolahId: z.string().nullish(),
    baris: z.array(skemaBarisTempel).max(500, 'Maksimal 500 soal per proses.'),
  }).parse(req.body);
  const sekolahId = pemilik(req.staf!, pilihan);
  await pastikanSekolahAda(sekolahId);
  const laporan = await imporSoal(baris, sekolahId);
  if (laporan.jumlah) await catatLog(req.staf!, 'IMPOR_SOAL', `${laporan.jumlah} soal`);
  res.json(laporan);
});

/** Impor dari berkas .xlsx, atau .zip berisi .xlsx dan gambar. Mendukung rumus LaTeX, kode, dan bahasa asing. */
rutAdminSoal.post('/impor-berkas', unggahImpor.single('berkas'), async (req, res) => {
  if (!req.file) throw galat(400, 'Pilih berkas .xlsx atau .zip terlebih dahulu.');
  const sekolahId = pemilik(req.staf!, req.body?.sekolahId);
  await pastikanSekolahAda(sekolahId);
  const { baris, sumber, peringatan } = await bacaBerkasImpor(req.file.buffer);
  if (!baris.length) throw galat(400, 'Tidak ada baris soal di berkas ini.');
  const laporan = await imporSoal(baris, sekolahId, sumber);
  if (laporan.jumlah) await catatLog(req.staf!, 'IMPOR_SOAL', `${laporan.jumlah} soal dari berkas`);
  res.json({ ...laporan, peringatan });
});

rutAdminSoal.get('/template.zip', async (_req, res) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="template-soal-dengan-gambar.zip"');
  res.send(await buatTemplateZip());
});

rutAdminSoal.get('/template.xlsx', async (_req, res) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template-soal.xlsx"');
  res.send(await buatTemplateSoal());
});
