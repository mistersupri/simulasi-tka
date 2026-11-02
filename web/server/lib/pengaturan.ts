import { prisma } from '../db.ts';

export const PENGATURAN_BAWAAN = {
  // Nama instansi penyelenggara (Suku Dinas Pendidikan). Kunci lama dipertahankan agar data lama tetap terbaca.
  NAMA_SEKOLAH: 'Suku Dinas Pendidikan Wilayah II Jakarta Pusat',
  TAHUN_AJARAN: '2026/2027',
  PENGUMUMAN: '',
  KKM: '70',
  LOGO: '',
  SISWA_BOLEH_GANTI_PASSWORD: 'YA',
  // Tangkapan layar ujian dihapus otomatis setelah sekian hari.
  SIMPAN_TANGKAPAN_HARI: '30',
};

export type Pengaturan = typeof PENGATURAN_BAWAAN;
export const PENGATURAN_DAPAT_DIUBAH = ['NAMA_SEKOLAH', 'TAHUN_AJARAN', 'PENGUMUMAN', 'KKM', 'SISWA_BOLEH_GANTI_PASSWORD', 'SIMPAN_TANGKAPAN_HARI'] as const;

export async function ambilPengaturan(): Promise<Pengaturan> {
  const baris = await prisma.pengaturan.findMany();
  const hasil: Record<string, string> = { ...PENGATURAN_BAWAAN };
  for (const b of baris) hasil[b.kunci] = b.nilai;
  return hasil as Pengaturan;
}

export async function simpanPengaturan(data: Partial<Pengaturan>) {
  await prisma.$transaction(
    Object.entries(data).map(([kunci, nilai]) =>
      prisma.pengaturan.upsert({ where: { kunci }, create: { kunci, nilai: String(nilai) }, update: { nilai: String(nilai) } }),
    ),
  );
}

export const kkmDari = (p: Pengaturan) => Math.max(0, Number(p.KKM) || 0);
