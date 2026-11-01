import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.ts';
import { galat, penanganGalat } from './lib/galat.ts';
import { rutAdmin } from './routes/admin/index.ts';
import { rutAplikasi } from './routes/aplikasi.ts';
import { rutAuth } from './routes/auth.ts';
import { rutPublik } from './routes/publik.ts';
import { rutSiswa } from './routes/siswa.ts';

export function buatApp({ folderKlien }: { folderKlien?: string } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({
    strictTransportSecurity: config.cookieSecure,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // MediaPipe (deteksi wajah) menjalankan WebAssembly.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'mediastream:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // Hanya bila diakses lewat HTTPS; di LAN sekolah tanpa HTTPS ini akan merusak semua permintaan.
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
  }));
  // Kamera hanya untuk halaman ini sendiri (pengawasan wajah saat ujian).
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/sehat', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', rutPublik);
  app.use('/api/auth', rutAuth);
  app.use('/api/aplikasi', rutAplikasi);
  app.use('/api/siswa', rutSiswa);
  app.use('/api/admin', rutAdmin);
  app.use('/api', (_req) => {
    throw galat(404, 'Alamat API tidak ditemukan.');
  });

  if (folderKlien && fs.existsSync(folderKlien)) {
    app.use(express.static(folderKlien, { index: false, maxAge: '1h' }));
    // Rute halaman (React Router) selalu dilayani index.html.
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(folderKlien, 'index.html'));
    });
  }

  app.use(penanganGalat);
  return app;
}
