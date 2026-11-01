import path from 'node:path';
import request from 'supertest';
import { buatApp } from '../server/app.ts';
import { prisma } from '../server/db.ts';
import { imporExcel } from '../server/lib/imporExcel.ts';
import { hashPassword } from '../server/lib/password.ts';
import { kosongkanGagalLogin } from '../server/lib/sesi.ts';
import fs from 'node:fs/promises';

export const app = buatApp();
export const EXCEL = path.resolve(import.meta.dirname, '../../database/Database_Simulasi_TKA_SDN_Johar_Baru_01_Pagi.xlsx');
export const KUNCI: Record<string, string> = { MTK001: 'B', MTK002: 'C', MTK003: 'C' };

export async function kosongkanDb() {
  kosongkanGagalLogin();
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Pelanggaran","Hasil","SesiUjian","Ujian","Soal","SesiLogin","Siswa","Pengguna","Pengaturan","LogAktivitas" CASCADE',
  );
}

/** Database berisi data Excel lama + admin, lalu agen yang sudah login. */
export async function siapkan() {
  await kosongkanDb();
  await prisma.pengguna.create({ data: { nama: 'Admin', username: 'admin', peran: 'ADMIN', passwordHash: await hashPassword('admin123') } });
  await imporExcel(await fs.readFile(EXCEL));
  const admin = request.agent(app);
  await admin.post('/api/auth/staf/login').send({ username: 'admin', password: 'admin123' }).expect(200);
  const siswa = request.agent(app);
  await siswa.post('/api/auth/siswa/login').send({ username: 'uji_tka', password: 'LatihanTKA2026!' }).expect(200);
  const ujianId = (await prisma.ujian.findFirstOrThrow()).id;
  return { admin, siswa, ujianId };
}

/** Jawaban benar dalam huruf tampil, memperhitungkan opsi yang diacak. */
export async function jawabanBenar(paket: { soal: { id: string; opsi: string[] }[] }) {
  const hasil: Record<string, string | string[]> = {};
  for (const s of paket.soal) {
    const soal = await prisma.soal.findUniqueOrThrow({ where: { id: s.id } });
    const huruf = soal.kunci.split(',').map((k) => {
      const teks = soal.opsi['ABCD'.indexOf(k)];
      return 'ABCD'[s.opsi.indexOf(teks)];
    });
    hasil[s.id] = soal.tipe === 'PGK' ? huruf : huruf[0];
  }
  return hasil;
}
