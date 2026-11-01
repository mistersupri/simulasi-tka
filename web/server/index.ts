import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buatApp } from './app.ts';
import { config } from './config.ts';
import { prisma } from './db.ts';

const folderKlien = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client');
const app = buatApp({ folderKlien });

const server = app.listen(config.port, () => {
  console.log(`Simulasi TKA berjalan di http://localhost:${config.port}`);
});

// Bersihkan sesi login kedaluwarsa setiap jam.
const pembersih = setInterval(() => {
  prisma.sesiLogin.deleteMany({ where: { kadaluarsa: { lt: new Date() } } }).catch(console.error);
}, 3600_000);

for (const sinyal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinyal, () => {
    clearInterval(pembersih);
    server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
}
