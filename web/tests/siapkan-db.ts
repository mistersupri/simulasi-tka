import { execSync } from 'node:child_process';

/** Menerapkan migrasi ke database tes sekali sebelum semua tes. */
export default function () {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/simulasi_tka_test';
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } });
}
