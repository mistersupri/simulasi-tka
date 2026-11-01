import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { hapusBerkas, simpanGambar, unggah } from '../../lib/berkas.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { dataSoal, idSoalBerikutnya } from '../../lib/soal.ts';
import { butuhStaf } from '../../lib/sesi.ts';
import { teks } from '../../lib/util.ts';

export const rutAdminSoal = Router();
rutAdminSoal.use(butuhStaf());

rutAdminSoal.get('/', async (_req, res) => {
  res.json(await prisma.soal.findMany({ orderBy: [{ mataPelajaran: 'asc' }, { kelas: 'asc' }, { id: 'asc' }] }));
});

/** Unggah gambar dulu, lalu simpan namanya bersama soal. */
rutAdminSoal.post('/gambar', unggah.single('gambar'), async (req, res) => {
  res.json({ nama: await simpanGambar(req.file?.buffer, 'gambar') });
});

const skemaSoal = z.object({
  id: z.string().trim().toUpperCase().default(''),
  mataPelajaran: z.string(), kelas: z.string(), pertanyaan: z.string(),
  opsi: z.array(z.string()), kunci: z.union([z.string(), z.array(z.string())]),
  skor: z.union([z.number(), z.string()]).default(1), tipe: z.enum(['PG', 'PGK']).default('PG'),
  pembahasan: z.string().default(''), aktif: z.boolean().default(true),
  gambar: z.string().nullable().default(null),
});

/** Gambar lama dibuang dari disk bila tidak dipakai soal lain. */
async function buangGambarTakTerpakai(nama: (string | null)[]) {
  for (const n of nama) {
    if (n && !(await prisma.soal.count({ where: { gambar: n } }))) await hapusBerkas('gambar', n);
  }
}

rutAdminSoal.post('/', async (req, res) => {
  const d = skemaSoal.parse(req.body);
  const data = dataSoal(d);
  const id = d.id || (await idSoalBerikutnya(data.mataPelajaran));
  if (!/^[A-Z0-9_-]{2,30}$/.test(id)) throw galat(400, 'ID soal hanya boleh huruf, angka, _ atau -.');
  if (await prisma.soal.findUnique({ where: { id } })) throw galat(400, `ID soal ${id} sudah dipakai.`);
  await prisma.soal.create({ data: { ...data, id, gambar: d.gambar } });
  await catatLog(req.staf!, 'TAMBAH_SOAL', id);
  res.json({ pesan: `Soal ${id} ditambahkan.`, id });
});

rutAdminSoal.put('/:id', async (req, res) => {
  const d = skemaSoal.parse(req.body);
  const lama = await prisma.soal.findUnique({ where: { id: String(req.params.id) } });
  if (!lama) throw galat(404, 'Soal tidak ditemukan.');
  await prisma.soal.update({ where: { id: lama.id }, data: { ...dataSoal(d), gambar: d.gambar } });
  if (lama.gambar !== d.gambar) await buangGambarTakTerpakai([lama.gambar]);
  await catatLog(req.staf!, 'UBAH_SOAL', lama.id);
  res.json({ pesan: `Soal ${lama.id} diperbarui.`, id: lama.id });
});

const skemaIds = z.object({ ids: z.array(z.string()).min(1, 'Pilih minimal satu soal.') });

rutAdminSoal.post('/hapus', async (req, res) => {
  const { ids } = skemaIds.parse(req.body);
  const gambar = (await prisma.soal.findMany({ where: { id: { in: ids } }, select: { gambar: true } })).map((s) => s.gambar);
  const r = await prisma.soal.deleteMany({ where: { id: { in: ids } } });
  await buangGambarTakTerpakai(gambar);
  await catatLog(req.staf!, 'HAPUS_SOAL', ids.join(', '));
  res.json({ pesan: `${r.count} soal dihapus.` });
});

rutAdminSoal.post('/status', async (req, res) => {
  const { ids, aktif } = skemaIds.extend({ aktif: z.boolean() }).parse(req.body);
  await prisma.soal.updateMany({ where: { id: { in: ids } }, data: { aktif } });
  await catatLog(req.staf!, aktif ? 'AKTIFKAN_SOAL' : 'NONAKTIFKAN_SOAL', ids.join(', '));
  res.json({ pesan: `${ids.length} soal ${aktif ? 'diaktifkan' : 'dinonaktifkan'}.` });
});

/** Impor dari tabel yang ditempel (Excel/Sheets/CSV) di browser. */
rutAdminSoal.post('/impor', async (req, res) => {
  const { baris } = z.object({ baris: z.array(z.record(z.string(), z.unknown())).max(500, 'Maksimal 500 soal per proses.') }).parse(req.body);
  const dipakai = new Set((await prisma.soal.findMany({ select: { id: true } })).map((s) => s.id));
  const idBaru = new Set<string>();
  const ditolak = [];
  let jumlah = 0;

  for (const b of baris) {
    try {
      const data = dataSoal({
        mataPelajaran: b.mataPelajaran, kelas: b.kelas, pertanyaan: b.pertanyaan,
        opsi: [b.opsiA, b.opsiB, b.opsiC, b.opsiD], kunci: b.kunci, skor: b.skor, tipe: b.tipe, pembahasan: b.pembahasan,
      });
      let id = teks(b.id).toUpperCase();
      if (id && dipakai.has(id)) throw galat(400, `ID ${id} sudah dipakai.`);
      if (!id) id = await idSoalBerikutnya(data.mataPelajaran, idBaru);
      await prisma.soal.create({ data: { ...data, id } });
      dipakai.add(id);
      idBaru.add(id);
      jumlah++;
    } catch (err) {
      ditolak.push({ nomor: Number(b.nomor) || 0, alasan: (err as Error).message });
    }
  }
  if (jumlah) await catatLog(req.staf!, 'IMPOR_SOAL', `${jumlah} soal`);
  res.json({ jumlah, ditolak });
});
