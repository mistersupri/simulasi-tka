import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma, type JenisPelanggaran, type SesiUjian, type Ujian } from '../db.ts';
import { dariAplikasi } from '../lib/aplikasi.ts';
import { simpanGambar, unggah } from '../lib/berkas.ts';
import { galat } from '../lib/galat.ts';
import { JEDA_MIN_BERKALA_DETIK, JEDA_MIN_PELANGGARAN_DETIK } from '../lib/layar.ts';
import {
  finalisasiSesi, jawabanKeAsli, jawabanKeTampil, petaSoal, selesaikanKadaluarsa, sesiKadaluarsa, sisaDetik,
  susunPembahasan, type ItemUrutan, type Jawaban,
} from '../lib/mesin.ts';
import { ambilPengaturan, kkmDari } from '../lib/pengaturan.ts';
import { butuhSiswa } from '../lib/sesi.ts';
import { acak, kelasCocok, normalisasiKelas } from '../lib/util.ts';

export const rutSiswa = Router();
rutSiswa.use(butuhSiswa);

type StatusUjian = 'TERSEDIA' | 'BERLANGSUNG' | 'SELESAI' | 'BELUM_DIBUKA' | 'DITUTUP';

function statusUjian(u: Ujian, jumlahSelesai: number, berjalan: boolean): StatusUjian {
  const sekarang = Date.now();
  if (berjalan) return 'BERLANGSUNG';
  if (u.maksPercobaan > 0 && jumlahSelesai >= u.maksPercobaan) return 'SELESAI';
  if (u.waktuMulai && sekarang < u.waktuMulai.getTime()) return 'BELUM_DIBUKA';
  if (u.waktuSelesai && sekarang > u.waktuSelesai.getTime()) return 'DITUTUP';
  return 'TERSEDIA';
}

/** Ujian berlaku untuk siswa ini: kelas cocok dan sekolahnya termasuk peserta. */
const ujianUntuk = (u: Ujian, siswa: { kelas: string; sekolahId: string }) =>
  kelasCocok(u.kelas, siswa.kelas) && (u.sekolah.length === 0 || u.sekolah.includes(siswa.sekolahId));

const PESAN_WAJIB_APLIKASI = 'Ujian ini hanya bisa dikerjakan lewat aplikasi ujian sekolah di komputer lab.';

function pastikanAplikasi(req: Request, ujian: Ujian) {
  if (ujian.wajibAplikasi && !dariAplikasi(req)) throw galat(403, PESAN_WAJIB_APLIKASI);
}

/** Soal untuk ujian: ujian instansi memakai bank instansi, ujian sekolah memakai bank sekolah itu. */
const soalAktifUntuk = (u: Pick<Ujian, 'mataPelajaran' | 'pemilikId'>, kelas: string) =>
  prisma.soal.findMany({
    where: {
      aktif: true, sekolahId: u.pemilikId, kelas: normalisasiKelas(kelas),
      mataPelajaran: { equals: u.mataPelajaran, mode: 'insensitive' }, kunci: { not: '' },
    },
    orderBy: { id: 'asc' },
  });

rutSiswa.get('/beranda', async (req, res) => {
  const siswa = req.siswa!;
  await selesaikanKadaluarsa(siswa.id);

  const [semuaUjian, hasil, berjalan, pengaturan] = await Promise.all([
    prisma.ujian.findMany({ where: { aktif: true }, orderBy: [{ waktuMulai: 'asc' }, { nama: 'asc' }] }),
    prisma.hasil.findMany({ where: { siswaId: siswa.id }, orderBy: { tanggal: 'desc' } }),
    prisma.sesiUjian.findMany({ where: { siswaId: siswa.id, status: 'BERLANGSUNG' } }),
    ambilPengaturan(),
  ]);

  const ujian = [];
  for (const u of semuaUjian.filter((x) => ujianUntuk(x, siswa))) {
    const tersedia = (await soalAktifUntuk(u, siswa.kelas)).length;
    const sesi = berjalan.find((s) => s.ujianId === u.id);
    if (!tersedia && !sesi) continue;
    const selesai = hasil.filter((h) => h.ujianId === u.id).length;
    ujian.push({
      id: u.id,
      nama: u.nama,
      mataPelajaran: u.mataPelajaran,
      durasiMenit: u.durasiMenit,
      jumlahSoal: u.jumlahSoal > 0 ? Math.min(u.jumlahSoal, tersedia) : tersedia,
      waktuMulai: u.waktuMulai,
      waktuSelesai: u.waktuSelesai,
      perluToken: !!u.token,
      wajibLayarPenuh: u.wajibLayarPenuh,
      wajibKamera: u.wajibKamera,
      wajibAplikasi: u.wajibAplikasi,
      rekamLayar: u.intervalRekamLayar > 0,
      maksPercobaan: u.maksPercobaan,
      jumlahSelesai: selesai,
      sesiId: sesi?.id ?? null,
      status: statusUjian(u, selesai, !!sesi),
    });
  }

  const petaUjian = new Map(semuaUjian.map((u) => [u.id, u]));
  const kkm = kkmDari(pengaturan);
  const riwayat = hasil.map((h) => {
    const u = h.ujianId ? petaUjian.get(h.ujianId) : undefined;
    const boleh = !u || u.tampilkanNilai;
    return {
      id: h.id,
      namaUjian: h.namaUjian,
      mataPelajaran: h.mataPelajaran,
      tanggal: h.tanggal,
      nilai: boleh ? h.nilai : null,
      tuntas: boleh && kkm > 0 ? h.nilai >= kkm : null,
      adaPembahasan: !!(u?.tampilkanPembahasan && h.sesiUjianId),
    };
  });

  res.json({ pengumuman: pengaturan.PENGUMUMAN, diAplikasi: dariAplikasi(req), ujian, riwayat });
});

async function paketUjian(sesi: SesiUjian, ujian: Ujian) {
  const urutan = sesi.urutan as ItemUrutan[];
  const peta = await petaSoal(urutan.map((u) => u.i));
  return {
    sesiId: sesi.id,
    ujian: {
      id: ujian.id,
      nama: ujian.nama,
      mataPelajaran: ujian.mataPelajaran,
      wajibLayarPenuh: ujian.wajibLayarPenuh,
      wajibKamera: ujian.wajibKamera,
      batasPeringatan: ujian.batasPeringatan,
      maksPelanggaran: ujian.maksPelanggaran,
      intervalRekamLayar: ujian.intervalRekamLayar,
    },
    soal: urutan.flatMap((item) => {
      const s = peta.get(item.i);
      // Kunci jawaban (termasuk jawaban isian yang diterima) tidak pernah dikirim ke siswa.
      return s ? [{
        id: s.id, tipe: s.tipe, bahasa: s.bahasa, kode: s.kode, pertanyaan: s.pertanyaan, gambar: s.gambar,
        opsi: item.o.map((k) => s.opsi[k] ?? ''),
        opsiGambar: item.o.map((k) => s.opsiGambar[k] ?? ''),
      }] : [];
    }),
    jawaban: jawabanKeTampil(urutan, sesi.jawaban as Jawaban),
    ragu: sesi.ragu,
    sisaDetik: sisaDetik(sesi.batasWaktu),
    jumlahPelanggaran: sesi.jumlahPelanggaran,
  };
}

rutSiswa.post('/ujian/:ujianId/mulai', async (req, res) => {
  const siswa = req.siswa!;
  const token = z.object({ token: z.string().optional() }).parse(req.body ?? {}).token ?? '';
  await selesaikanKadaluarsa(siswa.id);

  const ujian = await prisma.ujian.findUnique({ where: { id: String(req.params.ujianId) } });
  if (!ujian || !ujian.aktif || !ujianUntuk(ujian, siswa)) throw galat(404, 'Ujian tidak ditemukan.');
  pastikanAplikasi(req, ujian);

  // Lanjutkan ujian yang belum selesai (mis. koneksi putus).
  const berjalan = await prisma.sesiUjian.findFirst({ where: { siswaId: siswa.id, ujianId: ujian.id, status: 'BERLANGSUNG' } });
  if (berjalan) {
    res.json(await paketUjian(berjalan, ujian));
    return;
  }

  const selesai = await prisma.hasil.count({ where: { siswaId: siswa.id, ujianId: ujian.id } });
  const status = statusUjian(ujian, selesai, false);
  if (status === 'SELESAI') throw galat(400, 'Kamu sudah menyelesaikan ujian ini.');
  if (status === 'BELUM_DIBUKA') throw galat(400, 'Ujian belum dibuka.');
  if (status === 'DITUTUP') throw galat(400, 'Waktu ujian sudah berakhir.');
  if (ujian.token && token.trim().toUpperCase() !== ujian.token.toUpperCase()) {
    throw galat(400, 'Token ujian salah. Tanyakan token kepada pengawas.');
  }

  let soal = await soalAktifUntuk(ujian, siswa.kelas);
  if (!soal.length) throw galat(400, 'Belum ada soal untuk ujian ini.');
  if (ujian.acakSoal) soal = acak(soal);
  if (ujian.jumlahSoal > 0) soal = soal.slice(0, ujian.jumlahSoal);

  // Soal isian tidak punya pilihan: o kosong (lihat lib/mesin.ts).
  const urutan: ItemUrutan[] = soal.map((s) => ({ i: s.id, o: s.tipe === 'ISIAN' ? [] : ujian.acakOpsi ? acak([0, 1, 2, 3]) : [0, 1, 2, 3] }));
  const sekarang = Date.now();
  let batas = ujian.durasiMenit > 0 ? sekarang + ujian.durasiMenit * 60000 : null;
  if (ujian.waktuSelesai) batas = Math.min(batas ?? Infinity, ujian.waktuSelesai.getTime());

  const sesi = await prisma.sesiUjian.create({
    data: { ujianId: ujian.id, siswaId: siswa.id, urutan, batasWaktu: batas ? new Date(batas) : null },
  });
  res.json(await paketUjian(sesi, ujian));
});

async function sesiMilik(req: Request) {
  const sesi = await prisma.sesiUjian.findUnique({ where: { id: String(req.params.sesiId) }, include: { ujian: true } });
  if (!sesi || sesi.siswaId !== req.siswa!.id) throw galat(404, 'Sesi ujian tidak ditemukan.');
  return sesi;
}

rutSiswa.get('/sesi/:sesiId', async (req, res) => {
  const sesi = await sesiMilik(req);
  if (sesi.status !== 'BERLANGSUNG') throw galat(409, 'Ujian ini sudah selesai.');
  pastikanAplikasi(req, sesi.ujian);
  res.json(await paketUjian(sesi, sesi.ujian));
});

const skemaJawaban = z.object({
  jawaban: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  ragu: z.array(z.string()).default([]),
});

/** Simpan otomatis berkala. */
rutSiswa.put('/sesi/:sesiId/jawaban', async (req, res) => {
  const sesi = await sesiMilik(req);
  if (sesi.status !== 'BERLANGSUNG') throw galat(409, 'Ujian sudah selesai.');
  if (sesiKadaluarsa(sesi.batasWaktu)) throw galat(409, 'Waktu ujian sudah habis.');
  const { jawaban, ragu } = skemaJawaban.parse(req.body);
  const urutan = sesi.urutan as ItemUrutan[];
  const idSah = new Set(urutan.map((u) => u.i));
  await prisma.sesiUjian.update({
    where: { id: sesi.id },
    data: { jawaban: jawabanKeAsli(urutan, jawaban), ragu: ragu.filter((r) => idSah.has(r)), terakhirAktif: new Date() },
  });
  res.json({ sisaDetik: sisaDetik(sesi.batasWaktu) });
});

async function hasilUntukSiswa(hasilId: string) {
  const h = await prisma.hasil.findUniqueOrThrow({ where: { id: hasilId }, include: { sesiUjian: { include: { ujian: true } } } });
  const ujian = h.sesiUjian?.ujian ?? (h.ujianId ? await prisma.ujian.findUnique({ where: { id: h.ujianId } }) : null);
  const kkm = kkmDari(await ambilPengaturan());
  const boleh = ujian?.tampilkanNilai ?? true;
  const urutan = (h.sesiUjian?.urutan ?? []) as ItemUrutan[];
  const pembahasan = ujian?.tampilkanPembahasan && urutan.length
    ? susunPembahasan(urutan, h.jawaban as Jawaban, await petaSoal(urutan.map((u) => u.i)), true)
    : null;
  return {
    id: h.id,
    namaUjian: h.namaUjian,
    mataPelajaran: h.mataPelajaran,
    tampilkanNilai: boleh,
    nilai: boleh ? h.nilai : null,
    jumlahSoal: h.benar + h.salah,
    benar: boleh ? h.benar : null,
    salah: boleh ? h.salah - h.kosong : null,
    kosong: h.kosong,
    durasiDetik: h.durasiDetik,
    status: h.status,
    jumlahPelanggaran: h.jumlahPelanggaran,
    kkm,
    tuntas: boleh && kkm > 0 ? h.nilai >= kkm : null,
    pembahasan,
  };
}

rutSiswa.post('/sesi/:sesiId/kirim', async (req, res) => {
  const sesi = await sesiMilik(req);
  if (sesi.status !== 'BERLANGSUNG') throw galat(409, 'Ujian ini sudah dikirim sebelumnya.');
  const { jawaban } = skemaJawaban.parse(req.body);
  // Lewat batas waktu + toleransi: pakai jawaban terakhir yang tersimpan.
  const terlambat = sesiKadaluarsa(sesi.batasWaktu);
  const habis = !!sesi.batasWaktu && Date.now() >= sesi.batasWaktu.getTime();
  const r = await finalisasiSesi(sesi.id, terlambat ? null : jawabanKeAsli(sesi.urutan as ItemUrutan[], jawaban), habis ? 'WAKTU_HABIS' : 'SELESAI');
  res.json(await hasilUntukSiswa(r.hasil.id));
});

const JENIS_PELANGGARAN: JenisPelanggaran[] = [
  'KELUAR_LAYAR_PENUH', 'PINDAH_TAB', 'WAJAH_TIDAK_TERLIHAT', 'WAJAH_LEBIH_DARI_SATU',
  'KAMERA_TIDAK_AKTIF', 'SALIN_TEMPEL', 'PINTASAN_TERLARANG', 'LAYAR_TIDAK_DIBAGIKAN',
];

/**
 * Laporan pelanggaran dari browser (multipart: jenis, detail, foto opsional).
 * Pelanggaran tidak menghentikan pengerjaan; hanya saat batas maksimal tercapai ujian dihentikan dan dikirim.
 */
rutSiswa.post('/sesi/:sesiId/pelanggaran', unggah.single('foto'), async (req, res) => {
  const sesi = await sesiMilik(req);
  if (sesi.status !== 'BERLANGSUNG') throw galat(409, 'Ujian sudah selesai.');
  const { jenis, detail, jawaban } = z.object({
    jenis: z.enum(JENIS_PELANGGARAN as [JenisPelanggaran, ...JenisPelanggaran[]]),
    detail: z.string().max(300).default(''),
    jawaban: z.string().optional(), // JSON jawaban terkini, agar tidak hilang bila dikirim otomatis
  }).parse(req.body);

  let terkini: Jawaban | null = null;
  try {
    if (jawaban) terkini = jawabanKeAsli(sesi.urutan as ItemUrutan[], JSON.parse(jawaban));
  } catch {
    terkini = null;
  }

  const foto = req.file ? await simpanGambar(req.file.buffer, 'pelanggaran') : null;
  const diperbarui = await prisma.sesiUjian.update({
    where: { id: sesi.id },
    data: {
      jumlahPelanggaran: { increment: 1 },
      pelanggaran: { create: { jenis, detail, foto } },
      // Ikut simpan jawaban terkini agar monitor pengawas tidak tertinggal.
      ...(terkini && !sesiKadaluarsa(sesi.batasWaktu) ? { jawaban: terkini, terakhirAktif: new Date() } : {}),
    },
  });

  const maks = sesi.ujian.maksPelanggaran;
  if (maks > 0 && diperbarui.jumlahPelanggaran >= maks) {
    const r = await finalisasiSesi(sesi.id, terkini, 'PELANGGARAN');
    res.json({ jumlah: diperbarui.jumlahPelanggaran, maks, dihentikan: true, hasil: await hasilUntukSiswa(r.hasil.id) });
    return;
  }
  res.json({ jumlah: diperbarui.jumlahPelanggaran, maks, dihentikan: false });
});

/**
 * Tangkapan layar (multipart: layar, pemicu, keterangan). Hanya untuk ujian yang
 * mengaktifkan rekam layar; frekuensi dibatasi di server.
 */
rutSiswa.post('/sesi/:sesiId/layar', unggah.single('layar'), async (req, res) => {
  const sesi = await sesiMilik(req);
  if (sesi.status !== 'BERLANGSUNG') throw galat(409, 'Ujian sudah selesai.');
  if (sesi.ujian.intervalRekamLayar <= 0) throw galat(400, 'Ujian ini tidak merekam layar.');
  const { pemicu, keterangan } = z.object({
    pemicu: z.enum(['BERKALA', 'PELANGGARAN']).default('BERKALA'),
    keterangan: z.string().max(200).default(''),
  }).parse(req.body);

  const terakhir = await prisma.tangkapanLayar.findFirst({
    where: { sesiUjianId: sesi.id, pemicu }, orderBy: { waktu: 'desc' }, select: { waktu: true },
  });
  const jeda = pemicu === 'BERKALA' ? Math.min(JEDA_MIN_BERKALA_DETIK, sesi.ujian.intervalRekamLayar) : JEDA_MIN_PELANGGARAN_DETIK;
  if (terakhir && Date.now() - terakhir.waktu.getTime() < jeda * 1000) {
    res.status(429).json({ pesan: 'Terlalu sering.' });
    return;
  }

  const berkas = await simpanGambar(req.file?.buffer, 'layar');
  await prisma.tangkapanLayar.create({ data: { sesiUjianId: sesi.id, berkas, pemicu, keterangan } });
  res.json({ ok: true });
});

rutSiswa.get('/hasil/:id', async (req, res) => {
  const h = await prisma.hasil.findUnique({ where: { id: String(req.params.id) } });
  if (!h || h.siswaId !== req.siswa!.id) throw galat(404, 'Hasil tidak ditemukan.');
  res.json(await hasilUntukSiswa(h.id));
});
