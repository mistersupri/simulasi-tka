/** Penyimpanan & pembersihan tangkapan layar ujian (fitur "rekam layar"). */
import { prisma } from '../db.ts';
import { hapusBerkas } from './berkas.ts';
import { ambilPengaturan } from './pengaturan.ts';

/** Jeda minimal antar tangkapan dari browser, agar server tidak dibanjiri. */
export const JEDA_MIN_BERKALA_DETIK = 10;
export const JEDA_MIN_PELANGGARAN_DETIK = 5;
export const INTERVAL_REKAM_MIN_DETIK = 15;

async function hapusBaris(where: { sesiUjianId?: string; waktu?: { lt: Date } }) {
  const daftar = await prisma.tangkapanLayar.findMany({ where, select: { id: true, berkas: true } });
  for (const t of daftar) await hapusBerkas('layar', t.berkas);
  if (daftar.length) await prisma.tangkapanLayar.deleteMany({ where: { id: { in: daftar.map((t) => t.id) } } });
  return daftar.length;
}

/** Dipanggil sebelum sesi ujian dihapus (reset oleh pengawas). */
export const hapusTangkapanSesi = (sesiUjianId: string) => hapusBaris({ sesiUjianId });

/** Dijalankan berkala oleh server: hapus tangkapan yang lebih tua dari batas simpan. */
export async function bersihkanTangkapanLama() {
  const hari = Math.max(1, Number((await ambilPengaturan()).SIMPAN_TANGKAPAN_HARI) || 30);
  return hapusBaris({ waktu: { lt: new Date(Date.now() - hari * 86400_000) } });
}
