/**
 * Impor soal dari tabel (tempel) atau berkas (.xlsx, atau .zip berisi .xlsx dan gambar).
 *
 * Gambar bisa dirujuk dengan nama berkas di kolom GAMBAR, GAMBAR_A sampai GAMBAR_D (berkas ZIP),
 * atau ditempel langsung di sel Excel: gambar di kolom PERTANYAAN/GAMBAR menjadi gambar soal,
 * gambar di kolom OPSI_A..D/GAMBAR_A..D menjadi gambar pilihan. Rumus matematika ditulis sebagai
 * LaTeX di antara tanda $...$ (lihat src/lib/teksKaya.ts).
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { config } from '../config.ts';
import { prisma } from '../db.ts';
import { hapusBerkas, simpanGambar } from './berkas.ts';
import { gambarContoh } from './png.ts';
import { galat } from './galat.ts';
import { teksSel } from './imporExcel.ts';
import { dataSoal, POLA_NAMA_GAMBAR, tentukanIdSoal } from './soal.ts';
import { teks } from './util.ts';

/** Nama kolom (huruf besar, spasi/strip jadi _) → kunci baku. */
const KOLOM: Record<string, string> = {
  ID_SOAL: 'id', ID: 'id',
  MATA_PELAJARAN: 'mataPelajaran', MAPEL: 'mataPelajaran',
  KELAS: 'kelas',
  PERTANYAAN: 'pertanyaan', SOAL: 'pertanyaan',
  OPSI_A: 'opsiA', A: 'opsiA', OPSI_B: 'opsiB', B: 'opsiB', OPSI_C: 'opsiC', C: 'opsiC', OPSI_D: 'opsiD', D: 'opsiD',
  KUNCI_JAWABAN: 'kunci', KUNCI: 'kunci',
  SKOR: 'skor', BOBOT: 'skor',
  TIPE_SOAL: 'tipe', TIPE: 'tipe',
  PEMBAHASAN: 'pembahasan',
  BAHASA: 'bahasa',
  PEKA_HURUF: 'pekaHuruf',
  KODE: 'kode',
  STATUS: 'status',
  GAMBAR: 'gambar', GAMBAR_SOAL: 'gambar',
  GAMBAR_A: 'gambarA', GAMBAR_B: 'gambarB', GAMBAR_C: 'gambarC', GAMBAR_D: 'gambarD',
};

const KUNCI_GAMBAR = ['gambar', 'gambarA', 'gambarB', 'gambarC', 'gambarD'] as const;
type KunciGambar = (typeof KUNCI_GAMBAR)[number];
/** Kolom tempat gambar yang ditempel di sel dihitung milik kunci gambar mana. */
const GAMBAR_DI_KOLOM: Record<string, KunciGambar> = {
  gambar: 'gambar', pertanyaan: 'gambar',
  gambarA: 'gambarA', opsiA: 'gambarA', gambarB: 'gambarB', opsiB: 'gambarB',
  gambarC: 'gambarC', opsiC: 'gambarC', gambarD: 'gambarD', opsiD: 'gambarD',
};

export type BarisImpor = { nomor: number; nilai: Record<string, string> };
export type SumberGambar = {
  /** Gambar yang dirujuk nama berkasnya (ZIP). null bila tidak ada. */
  cariBerkas?: (acuan: string) => Promise<Buffer | null>;
  /** Gambar yang ditempel di sel Excel: baris Excel → kunci gambar → isi. */
  sel?: Map<string, Buffer>;
};
export type LaporanImporSoal = { jumlah: number; ditolak: { nomor: number; alasan: string }[]; peringatan: string[] };

const GAMBAR_CONTOH = '00000000-0000-0000-0000-000000000000.png';
if (!POLA_NAMA_GAMBAR.test(GAMBAR_CONTOH)) throw new Error('Pola nama gambar berubah');

const MAKS_BARIS = 500;
const MAKS_ENTRI_ZIP = 3000;
const MAKS_TOTAL_ZIP = 150 * 1024 * 1024;

const kunciKolom = (judul: string) => KOLOM[judul.trim().toUpperCase().replace(/[\s-]+/g, '_')];

// ------------------------------------------------------------------
// Membaca berkas
// ------------------------------------------------------------------

async function bacaXlsx(buf: Buffer): Promise<{ baris: BarisImpor[]; sel: Map<string, Buffer>; peringatan: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw galat(400, 'Berkas Excel tidak dapat dibaca. Pastikan formatnya .xlsx.');
  }
  const ws = wb.getWorksheet('SOAL') ?? wb.getWorksheet('BANK_SOAL') ?? wb.worksheets[0];
  if (!ws) throw galat(400, 'Berkas Excel tidak berisi lembar kerja.');

  const kunciPerKolom: (string | undefined)[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (sel, kolom) => {
    kunciPerKolom[kolom] = kunciKolom(teksSel(sel));
  });
  if (!kunciPerKolom.includes('pertanyaan') && !kunciPerKolom.includes('gambar')) {
    throw galat(400, 'Baris pertama harus berisi judul kolom (mis. MATA_PELAJARAN, KELAS, PERTANYAAN). Unduh template untuk contohnya.');
  }

  const gambarLembar = ws.getImages();
  const barisBergambar = new Set(gambarLembar.map((g) => Math.floor(g.range.tl.nativeRow ?? g.range.tl.row) + 1));
  const baris: BarisImpor[] = [];
  ws.eachRow((r, nomor) => {
    if (nomor === 1) return;
    const nilai: Record<string, string> = {};
    kunciPerKolom.forEach((k, kolom) => {
      if (k) nilai[k] = teksSel(r.getCell(kolom));
    });
    if (Object.values(nilai).some(Boolean) || barisBergambar.has(nomor)) baris.push({ nomor, nilai });
  });

  const sel = new Map<string, Buffer>();
  const peringatan: string[] = [];
  for (const g of gambarLembar) {
    const nomor = Math.floor(g.range.tl.nativeRow ?? g.range.tl.row) + 1;
    const kolom = Math.floor(g.range.tl.nativeCol ?? g.range.tl.col) + 1;
    const tujuan = kunciPerKolom[kolom] ? GAMBAR_DI_KOLOM[kunciPerKolom[kolom]!] : undefined;
    if (nomor === 1 || !tujuan) {
      peringatan.push(`Gambar di baris ${nomor}, kolom ${kolom} diabaikan: letakkan gambar di kolom PERTANYAAN, GAMBAR, atau OPSI_A sampai OPSI_D.`);
      continue;
    }
    const isi = wb.getImage(Number(g.imageId))?.buffer;
    if (!isi) continue;
    const kunci = `${nomor}|${tujuan}`;
    if (sel.has(kunci)) {
      peringatan.push(`Baris ${nomor}: hanya satu gambar per sel yang dipakai, gambar kedua diabaikan.`);
      continue;
    }
    sel.set(kunci, Buffer.from(isi));
  }
  return { baris, sel, peringatan };
}

const EKSTENSI_GAMBAR = /\.(png|jpe?g|gif|webp)$/i;
const namaDasar = (n: string) => n.split('/').pop()!.toLowerCase();

/** ZIP berisi satu .xlsx dan gambar yang dirujuk namanya. */
async function bacaZip(buf: Buffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw galat(400, 'Berkas ZIP tidak dapat dibaca.');
  }
  const entri = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith('__MACOSX/') && !namaDasar(f.name).startsWith('.') && !namaDasar(f.name).startsWith('~$'));
  if (entri.length > MAKS_ENTRI_ZIP) throw galat(400, `ZIP berisi terlalu banyak berkas (maksimal ${MAKS_ENTRI_ZIP}).`);
  // Ukuran asli dibaca dari daftar isi ZIP sebelum apa pun diekstrak (cegah "zip bomb").
  const ukuran = (f: JSZip.JSZipObject) => (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (entri.reduce((t, f) => t + ukuran(f), 0) > MAKS_TOTAL_ZIP) throw galat(400, 'Isi ZIP terlalu besar setelah diekstrak.');

  const xlsx = entri
    .filter((f) => /\.xlsx$/i.test(f.name))
    .sort((a, b) => Number(namaDasar(b.name) === 'soal.xlsx') - Number(namaDasar(a.name) === 'soal.xlsx') || a.name.split('/').length - b.name.split('/').length)[0];
  if (!xlsx) throw galat(400, 'ZIP harus berisi satu berkas .xlsx (daftar soal) beserta gambarnya.');
  if (ukuran(xlsx) > 30 * 1024 * 1024) throw galat(400, 'Berkas Excel di dalam ZIP terlalu besar.');

  const gambar = new Map<string, JSZip.JSZipObject>();
  for (const f of entri) if (EKSTENSI_GAMBAR.test(f.name) && !gambar.has(namaDasar(f.name))) gambar.set(namaDasar(f.name), f);

  const tabel = await bacaXlsx(await xlsx.async('nodebuffer'));
  const cariBerkas = async (acuan: string) => {
    const f = gambar.get(namaDasar(acuan));
    if (!f) return null;
    if (ukuran(f) > config.ukuranGambarMaks) throw galat(400, `Gambar "${acuan}" lebih dari ${config.ukuranGambarMaks / 1024 / 1024} MB.`);
    return f.async('nodebuffer');
  };
  return { ...tabel, cariBerkas };
}

/** Titik masuk: .xlsx atau .zip (dikenali dari isinya, bukan dari nama berkas). */
export async function bacaBerkasImpor(buf: Buffer): Promise<{ baris: BarisImpor[]; sumber: SumberGambar; peringatan: string[] }> {
  const zip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (!zip) throw galat(400, 'Berkas harus .xlsx atau .zip.');
  // .xlsx juga berupa ZIP; bedakan lewat adanya [Content_Types].xml dan folder xl/ di akar.
  const akar = await JSZip.loadAsync(buf).catch(() => null);
  if (!akar) throw galat(400, 'Berkas tidak dapat dibaca.');
  const adalahXlsx = !!akar.file('[Content_Types].xml') && !!akar.file(/^xl\/workbook\.xml$/)[0];
  if (adalahXlsx) {
    const { baris, sel, peringatan } = await bacaXlsx(buf);
    return { baris, sumber: { sel }, peringatan };
  }
  const { baris, sel, peringatan, cariBerkas } = await bacaZip(buf);
  return { baris, sumber: { sel, cariBerkas }, peringatan };
}

// ------------------------------------------------------------------
// Membuat soal
// ------------------------------------------------------------------

type Konteks = {
  sekolahId: string | null;
  dipakai: Set<string>;
  idBaru: Set<string>;
  sumber: SumberGambar;
  /** Gambar yang dirujuk lewat nama berkas dipakai ulang bila muncul di beberapa soal. */
  cache: Map<string, string>;
};

/** Menyimpan gambar baris ini; mengembalikan nama berkas tersimpan per kunci. Berkas yang baru dibuat dicatat untuk digulung balik. */
async function simpanGambarBaris(b: BarisImpor, ada: Set<KunciGambar>, ctx: Konteks, baru: string[]) {
  const hasil: Partial<Record<KunciGambar, string>> = {};
  for (const k of ada) {
    const acuan = teks(b.nilai[k]);
    if (acuan) {
      const kunciCache = namaDasarAcuan(acuan);
      const ada = ctx.cache.get(kunciCache);
      if (ada) { hasil[k] = ada; continue; }
      const isi = await ctx.sumber.cariBerkas?.(acuan);
      if (!isi) throw galat(400, ctx.sumber.cariBerkas ? `Gambar "${acuan}" tidak ditemukan di dalam ZIP.` : `Gambar "${acuan}" hanya bisa dirujuk lewat ZIP. Unggah ZIP berisi Excel dan gambar, atau tempel gambar langsung di sel Excel.`);
      const nama = await simpanGambar(isi, 'gambar');
      baru.push(nama);
      ctx.cache.set(kunciCache, nama);
      hasil[k] = nama;
    } else {
      const isi = ctx.sumber.sel?.get(`${b.nomor}|${k}`);
      if (!isi) continue;
      if (isi.length > config.ukuranGambarMaks) throw galat(400, `Gambar di baris ${b.nomor} lebih dari ${config.ukuranGambarMaks / 1024 / 1024} MB.`);
      const nama = await simpanGambar(isi, 'gambar');
      baru.push(nama);
      hasil[k] = nama;
    }
  }
  return hasil;
}
const namaDasarAcuan = (a: string) => a.split(/[\\/]/).pop()!.toLowerCase();

/** Membuat satu soal dari satu baris. Melempar galat bila baris tidak sah (tanpa meninggalkan berkas yatim). */
async function buatSoal(b: BarisImpor, ctx: Konteks) {
  const n = b.nilai;
  // Gambar yang diharapkan ada (nama berkas di sel, atau gambar tertempel di sel itu).
  const ada = new Set<KunciGambar>(KUNCI_GAMBAR.filter((k) => teks(n[k]) || ctx.sumber.sel?.has(`${b.nomor}|${k}`)));
  const masukan = {
    mataPelajaran: n.mataPelajaran, kelas: n.kelas, pertanyaan: n.pertanyaan,
    opsi: [n.opsiA, n.opsiB, n.opsiC, n.opsiD], kunci: n.kunci, skor: n.skor, tipe: n.tipe, pembahasan: n.pembahasan,
    bahasa: n.bahasa, pekaHuruf: n.pekaHuruf, kode: n.kode, aktif: teks(n.status).toUpperCase() !== 'NONAKTIF',
  };
  const gambarTipe = (k: KunciGambar) => (ada.has(k) ? GAMBAR_CONTOH : '');
  // Validasi dulu dengan nama gambar contoh agar tidak ada berkas tersimpan untuk baris yang akhirnya ditolak.
  const data = dataSoal({ ...masukan, gambar: gambarTipe('gambar'), opsiGambar: (['gambarA', 'gambarB', 'gambarC', 'gambarD'] as const).map(gambarTipe) });
  const id = await tentukanIdSoal(teks(n.id).toUpperCase(), data.mataPelajaran, ctx.sekolahId, ctx.idBaru);
  if (ctx.dipakai.has(id)) throw galat(400, `ID ${id} sudah dipakai.`);

  const baru: string[] = [];
  try {
    const gambar = await simpanGambarBaris(b, ada, ctx, baru);
    const akhir = dataSoal({
      ...masukan, gambar: gambar.gambar ?? '',
      opsiGambar: [gambar.gambarA ?? '', gambar.gambarB ?? '', gambar.gambarC ?? '', gambar.gambarD ?? ''],
    });
    await prisma.soal.create({ data: { ...akhir, id, sekolahId: ctx.sekolahId } });
  } catch (err) {
    for (const nama of baru) await hapusBerkas('gambar', nama);
    throw err;
  }
  ctx.dipakai.add(id);
  ctx.idBaru.add(id);
}

/** Impor banyak baris; baris yang gagal dilaporkan, yang lain tetap masuk. */
export async function imporSoal(baris: BarisImpor[], sekolahId: string | null, sumber: SumberGambar = {}): Promise<LaporanImporSoal> {
  if (baris.length > MAKS_BARIS) throw galat(400, `Maksimal ${MAKS_BARIS} soal per proses.`);
  const ctx: Konteks = {
    sekolahId,
    dipakai: new Set((await prisma.soal.findMany({ select: { id: true } })).map((s) => s.id)),
    idBaru: new Set(),
    sumber,
    cache: new Map(),
  };
  const ditolak: LaporanImporSoal['ditolak'] = [];
  let jumlah = 0;
  for (const b of baris) {
    try {
      await buatSoal(b, ctx);
      jumlah++;
    } catch (err) {
      ditolak.push({ nomor: b.nomor, alasan: (err as Error).message });
    }
  }
  return { jumlah, ditolak, peringatan: [] };
}

// ------------------------------------------------------------------
// Template Excel
// ------------------------------------------------------------------

/**
 * denganGambar: tambahkan contoh soal yang merujuk berkas gambar (lingkaran.png, dst.).
 * Berkasnya sendiri disediakan oleh buatTemplateZip.
 */
export async function buatTemplateSoal(denganGambar = false): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SOAL');
  const judul = ['ID_SOAL', 'MATA_PELAJARAN', 'KELAS', 'TIPE_SOAL', 'BAHASA', 'PERTANYAAN', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D',
    'KUNCI_JAWABAN', 'SKOR', 'PEMBAHASAN', 'PEKA_HURUF', 'KODE', 'GAMBAR', 'GAMBAR_A', 'GAMBAR_B', 'GAMBAR_C', 'GAMBAR_D'];
  ws.addRow(judul);
  const contoh: string[][] = [
    ['', 'Matematika', '6', 'PG', 'id', 'Hasil dari 125 + 75 adalah ....', '180', '190', '200', '210', 'C', '1', '125 + 75 = 200'],
    ['', 'Matematika', '6', 'PG', 'id', 'Hasil dari $\\frac{3}{4} + \\frac{1}{2}$ adalah ....', '$1\\frac{1}{4}$', '$\\frac{4}{6}$', '$\\frac{5}{8}$', '$1$', 'A', '1', '$\\frac{3}{4}+\\frac{2}{4}=\\frac{5}{4}=1\\frac{1}{4}$'],
    ['', 'Matematika', '6', 'PG', 'id', 'Luas lingkaran berjari-jari $r$ dirumuskan\n$$L = \\pi r^{2}$$\nBila $r = 7$ cm dan $\\pi = \\frac{22}{7}$, luasnya adalah ....', '44 cm²', '154 cm²', '308 cm²', '616 cm²', 'B', '1', ''],
    ['', 'Matematika', '6', 'PGK', 'id', 'Manakah yang merupakan bilangan prima?', '2', '4', '7', '9', 'A,C', '2', ''],
    ['', 'Bahasa Arab', '6', 'PG', 'ar', 'ما معنى كلمة «كِتَاب»؟', 'Buku', 'Pensil', 'Meja', 'Kursi', 'A', '1', ''],
    ['', 'Bahasa Mandarin', '6', 'PG', 'zh', 'Apa arti "你好"?', 'Halo', 'Terima kasih', 'Selamat tinggal', 'Maaf', 'A', '1', ''],
    ['', 'Bahasa Rusia', '6', 'PG', 'ru', 'Apa arti "Спасибо"?', 'Selamat pagi', 'Terima kasih', 'Maaf', 'Sampai jumpa', 'B', '1', ''],
    ['', 'Bahasa Rusia', '6', 'ISIAN', 'ru', 'Tulis kata "terima kasih" dalam bahasa Rusia (huruf Kiril).', '', '', '', '', 'спасибо', '1', ''],
    ['', 'Informatika', '6', 'PG', 'id', 'Apa keluaran program berikut?\n```python\nfor i in range(3):\n    print(i)\n```', '1 2 3', '0 1 2', '0 1 2 3', '3', 'B', '1', 'range(3) menghasilkan 0, 1, 2.'],
    ['', 'Informatika', '6', 'ISIAN', 'id', 'Tulis keluaran program berikut:\n```python\nprint(2 + 3 * 4)\n```', '', '', '', '', '14', '1', 'Perkalian dikerjakan lebih dulu: 3 × 4 = 12, lalu 2 + 12 = 14.', 'YA', 'YA'],
  ];
  const gambarContohBaris: string[][] = [
    // Setiap pilihan berupa gambar saja (OPSI kosong, GAMBAR_A..D terisi).
    ['', 'Matematika', '6', 'PG', 'id', 'Manakah bangun datar yang memiliki tiga sisi?', '', '', '', '', 'C', '1', 'Segitiga memiliki tiga sisi.', '', '', '', 'lingkaran.png', 'persegi.png', 'segitiga.png', 'garis.png'],
    // Gambar pada soal, pilihan berupa teks.
    ['', 'Matematika', '6', 'PG', 'id', 'Perhatikan gambar berikut. Bangun apakah ini?', 'Lingkaran', 'Persegi', 'Segitiga', 'Garis', 'C', '1', '', '', '', 'segitiga.png', '', '', '', ''],
    // Soal yang seluruhnya berupa gambar (PERTANYAAN kosong).
    ['', 'Matematika', '6', 'PG', 'id', '', 'Segitiga', 'Persegi', 'Lingkaran', 'Garis', 'B', '1', '', '', '', 'persegi.png', '', '', '', ''],
  ];
  for (const r of denganGambar ? [...contoh, ...gambarContohBaris] : contoh) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  judul.forEach((j, i) => { ws.getColumn(i + 1).width = j === 'PERTANYAAN' || j === 'PEMBAHASAN' ? 46 : j.startsWith('OPSI') ? 22 : j.startsWith('GAMBAR') ? 18 : 14; });
  ws.eachRow((r) => r.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; }));

  const p = wb.addWorksheet('PETUNJUK');
  p.getColumn(1).width = 22;
  p.getColumn(2).width = 100;
  const baris: [string, string][] = [
    ['Cara impor', 'Isi lembar SOAL (satu soal per baris, baris 1 jangan diubah), lalu unggah berkas .xlsx. Bila soal memakai gambar dari berkas, kumpulkan .xlsx dan semua gambar dalam satu berkas .zip, lalu unggah ZIP itu. Template ZIP berisi contoh lengkapnya.'],
    ['TIPE_SOAL', 'PG (pilihan ganda), PGK (pilihan ganda kompleks, kunci lebih dari satu), atau ISIAN (siswa mengetik jawaban).'],
    ['KUNCI_JAWABAN', 'PG: satu huruf (B). PGK: beberapa huruf (A,C). ISIAN: jawaban yang diterima; beberapa jawaban dipisah tanda | (mis. 14|empat belas).'],
    ['BAHASA', 'Kode bahasa soal: id, en, ar (Arab), zh (Mandarin), zh-Hant, ja, ko, ru (Rusia), hi, th, he, fa, ur, de, fr, es, nl, pt, it, tr, el, vi, ms, jv, atau und (lain). Menentukan font; arah tulisan kanan-ke-kiri (Arab, Ibrani, Persia, Urdu) otomatis. Kosong = id.'],
    ['Rumus matematika', 'Tulis LaTeX di antara tanda dolar: $\\frac{3}{4}$ untuk rumus dalam kalimat, $$L = \\pi r^{2}$$ untuk rumus satu baris sendiri. Boleh di PERTANYAAN, OPSI_A sampai OPSI_D, dan PEMBAHASAN. Tanda dolar biasa (mis. harga $5 dan $10) tidak dianggap rumus. Untuk tanda dolar di dalam rumus, tulis \\$.'],
    ['Kode program', 'Tulis dalam pagar tiga tanda kutip terbalik: ```python lalu kode di baris berikutnya dan tutup dengan ```. Nama bahasa (python, javascript, java, c, cpp, csharp, php, sql, html, css, bash, json, pascal) menyalakan pewarnaan kode. Kode sebaris: `x = 1`.'],
    ['PEKA_HURUF, KODE', 'Hanya untuk ISIAN. PEKA_HURUF=YA: huruf besar dan kecil dibedakan (disarankan untuk kode). KODE=YA: kotak jawaban siswa berhuruf monospace.'],
    ['Gambar dari berkas ZIP', 'Isi GAMBAR dengan nama berkas gambar soal (mis. soal1.png) dan GAMBAR_A sampai GAMBAR_D untuk gambar pilihan. Format PNG, JPG, GIF, atau WEBP, maksimal 5 MB per gambar. Pilihan boleh hanya berupa gambar (OPSI kosong), begitu pula soal (PERTANYAAN kosong).'],
    ['Gambar ditempel di Excel', 'Tanpa ZIP: sisipkan gambar di Excel (Insert, Pictures, This Device) dan letakkan di sel kolom PERTANYAAN atau GAMBAR (gambar soal) dan kolom OPSI_A sampai OPSI_D atau GAMBAR_A sampai GAMBAR_D (gambar pilihan), pada baris soal yang sama. Pakai gambar "mengambang" biasa, bukan "Place in Cell". Gambar rumus dari Word/OneNote bisa ditempel dengan cara ini.'],
    ['ID_SOAL', 'Boleh kosong: dibuat otomatis (MTK001, dst.). Soal sekolah diberi awalan NPSN secara otomatis.'],
  ];
  for (const r of baris) p.addRow(r);
  p.getColumn(1).font = { bold: true };
  p.eachRow((r) => r.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; }));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const BACA_SAYA = `TEMPLATE IMPOR SOAL DENGAN GAMBAR
==================================

Isi berkas ini:
  soal.xlsx     Daftar soal (lembar SOAL) dan petunjuk kolom (lembar PETUNJUK).
  gambar/       Contoh gambar yang dirujuk soal.xlsx (lingkaran.png, persegi.png, segitiga.png, garis.png).

Cara memakai:
  1. Ganti isi soal.xlsx dengan soal Anda. Hapus baris contoh yang tidak dipakai.
  2. Taruh semua gambar soal di folder gambar/ (nama berkas bebas, huruf besar/kecil tidak dibedakan).
  3. Tulis nama berkas gambar di kolom GAMBAR (gambar soal) atau GAMBAR_A sampai GAMBAR_D (gambar pilihan jawaban).
  4. Kompres soal.xlsx dan folder gambar/ menjadi satu berkas .zip (pilih keduanya, klik kanan, Kirim ke / Compress).
  5. Di Bank soal, klik "Impor berkas", pilih ZIP itu, lalu klik Impor.

Aturan gambar:
  - Format PNG, JPG, GIF, atau WEBP, maksimal 5 MB per gambar.
  - Pilihan jawaban boleh hanya berupa gambar (kolom OPSI dikosongkan).
  - Soal boleh hanya berupa gambar (kolom PERTANYAAN dikosongkan).
  - Gambar yang sama boleh dipakai banyak soal.
  - Gambar rumus dari Word atau OneNote: simpan sebagai PNG, taruh di folder gambar/.

Rumus matematika:
  Tulis LaTeX di antara tanda dolar, mis. $\\frac{3}{4}$. Rumus bisa juga dibuat langsung di editor soal
  (tombol Rumus) tanpa mengetik LaTeX; impor ini untuk soal dalam jumlah banyak.

Tanpa ZIP:
  Gambar boleh ditempel langsung di sel soal.xlsx (Insert, Pictures, This Device), letakkan di sel kolom
  PERTANYAAN atau OPSI_A sampai OPSI_D pada baris soalnya, lalu unggah soal.xlsx saja.
  Gunakan gambar mengambang biasa, bukan "Place in Cell".
`;

/** ZIP berisi soal.xlsx (dengan contoh soal bergambar), folder gambar/ berisi contoh gambar, dan petunjuk. */
export async function buatTemplateZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('soal.xlsx', await buatTemplateSoal(true));
  for (const bentuk of ['lingkaran', 'persegi', 'segitiga', 'garis'] as const) zip.file(`gambar/${bentuk}.png`, gambarContoh(bentuk));
  zip.file('BACA-SAYA.txt', BACA_SAYA.replace(/\n/g, '\r\n'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
