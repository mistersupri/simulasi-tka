import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.ts';
import { hapusBerkas, simpanGambar, unggah } from '../../lib/berkas.ts';
import { galat } from '../../lib/galat.ts';
import { catatLog } from '../../lib/log.ts';
import { awalanSoalSekolah, dataSoal, idSoalBerikutnya } from '../../lib/soal.ts';
import { butuhStaf, sekolahStaf, type Staf } from '../../lib/sesi.ts';
import { teks } from '../../lib/util.ts';

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
  mataPelajaran: z.string(), kelas: z.string(), pertanyaan: z.string(),
  opsi: z.array(z.string()), kunci: z.union([z.string(), z.array(z.string())]),
  skor: z.union([z.number(), z.string()]).default(1), tipe: z.enum(['PG', 'PGK']).default('PG'),
  pembahasan: z.string().default(''), aktif: z.boolean().default(true),
  gambar: z.string().nullable().default(null),
  sekolahId: z.string().nullish(), // hanya dipakai admin; operator selalu sekolahnya
});

async function pastikanSekolahAda(id: string | null) {
  if (id && !(await prisma.sekolah.findUnique({ where: { id }, select: { id: true } }))) throw galat(400, 'Sekolah tidak ditemukan.');
}

/** ID sah dengan awalan sekolah (ditambahkan otomatis bila belum ada). */
async function idSoal(diminta: string, mapel: string, sekolahId: string | null, dipakai?: Set<string>) {
  const awalan = await awalanSoalSekolah(sekolahId);
  if (!diminta) return idSoalBerikutnya(mapel, dipakai, awalan);
  const id = diminta.startsWith(awalan) ? diminta : awalan + diminta;
  if (!/^[A-Z0-9_-]{2,30}$/.test(id)) throw galat(400, 'ID soal hanya boleh huruf, angka, _ atau -, maksimal 30 karakter.');
  return id;
}

/** Gambar lama dibuang dari disk bila tidak dipakai soal lain. */
async function buangGambarTakTerpakai(nama: (string | null)[]) {
  for (const n of nama) {
    if (n && !(await prisma.soal.count({ where: { gambar: n } }))) await hapusBerkas('gambar', n);
  }
}

rutAdminSoal.post('/', async (req, res) => {
  const d = skemaSoal.parse(req.body);
  const data = dataSoal(d);
  const sekolahId = pemilik(req.staf!, d.sekolahId);
  await pastikanSekolahAda(sekolahId);
  const id = await idSoal(d.id, data.mataPelajaran, sekolahId);
  if (await prisma.soal.findUnique({ where: { id } })) throw galat(400, `ID soal ${id} sudah dipakai.`);
  await prisma.soal.create({ data: { ...data, id, gambar: d.gambar, sekolahId } });
  await catatLog(req.staf!, 'TAMBAH_SOAL', id);
  res.json({ pesan: `Soal ${id} ditambahkan.`, id });
});

rutAdminSoal.put('/:id', async (req, res) => {
  const d = skemaSoal.parse(req.body);
  const lama = await prisma.soal.findFirst({ where: { id: String(req.params.id), ...milikStaf(req.staf!) } });
  if (!lama) throw galat(404, 'Soal tidak ditemukan.');
  await prisma.soal.update({ where: { id: lama.id }, data: { ...dataSoal(d), gambar: d.gambar } });
  if (lama.gambar !== d.gambar) await buangGambarTakTerpakai([lama.gambar]);
  await catatLog(req.staf!, 'UBAH_SOAL', lama.id);
  res.json({ pesan: `Soal ${lama.id} diperbarui.`, id: lama.id });
});

const skemaIds = z.object({ ids: z.array(z.string()).min(1, 'Pilih minimal satu soal.') });

rutAdminSoal.post('/hapus', async (req, res) => {
  const { ids } = skemaIds.parse(req.body);
  const where = { id: { in: ids }, ...milikStaf(req.staf!) };
  const gambar = (await prisma.soal.findMany({ where, select: { gambar: true } })).map((s) => s.gambar);
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

/** Impor dari tabel yang ditempel (Excel/Sheets/CSV) di browser. */
rutAdminSoal.post('/impor', async (req, res) => {
  const { baris, sekolahId: pilihan } = z.object({
    sekolahId: z.string().nullish(),
    baris: z.array(z.record(z.string(), z.unknown())).max(500, 'Maksimal 500 soal per proses.'),
  }).parse(req.body);
  const sekolahId = pemilik(req.staf!, pilihan);
  await pastikanSekolahAda(sekolahId);
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
      const id = await idSoal(teks(b.id).toUpperCase(), data.mataPelajaran, sekolahId, idBaru);
      if (dipakai.has(id)) throw galat(400, `ID ${id} sudah dipakai.`);
      await prisma.soal.create({ data: { ...data, id, sekolahId } });
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
