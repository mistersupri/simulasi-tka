/**
 * Mengisi database pertama kali:
 *   - akun admin (kata sandi dari ADMIN_PASSWORD, atau acak dan ditampilkan sekali)
 *   - data dari file Excel versi Google Spreadsheet bila SEED_EXCEL diisi
 * Aman dijalankan ulang: admin hanya dibuat bila belum ada pengguna sama sekali.
 */
import fs from 'node:fs/promises';
import { prisma } from '../server/db.ts';
import { imporExcel } from '../server/lib/imporExcel.ts';
import { hashPassword } from '../server/lib/password.ts';
import { buatPasswordAcak } from '../server/lib/util.ts';

if (!(await prisma.pengguna.count())) {
  const password = process.env.ADMIN_PASSWORD || `${buatPasswordAcak()}A!`;
  await prisma.pengguna.create({
    data: { nama: 'Administrator', username: 'admin', peran: 'ADMIN', passwordHash: await hashPassword(password) },
  });
  console.log(`Akun admin dibuat. Username: admin  Kata sandi: ${process.env.ADMIN_PASSWORD ? '(dari ADMIN_PASSWORD)' : password}`);
  console.log('Segera ganti kata sandi setelah login.');
}

const berkas = process.env.SEED_EXCEL;
if (berkas) {
  const laporan = await imporExcel(await fs.readFile(berkas));
  console.log(`Impor ${berkas}: ${laporan.siswa} siswa, ${laporan.soal} soal, ${laporan.ujian} ujian.`);
  for (const d of laporan.dilewati) console.log(`  dilewati ${d.lembar} baris ${d.baris}: ${d.alasan}`);
}

await prisma.$disconnect();
