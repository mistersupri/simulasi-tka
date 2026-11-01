import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  produksi: process.env.NODE_ENV === 'production',
  // Cookie "Secure" hanya bila aplikasi diakses lewat HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  lamaSesiJam: Number(process.env.LAMA_SESI_JAM ?? 8),
  toleransiWaktuDetik: 120,
  maksGagalLogin: 5,
  lamaKunciLoginMenit: 5,
  panjangPasswordMin: 6,
  ukuranGambarMaks: 5 * 1024 * 1024,
};
