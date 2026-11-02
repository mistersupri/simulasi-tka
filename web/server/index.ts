import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buatApp } from './app.ts';
import { config } from './config.ts';
import { prisma } from './db.ts';
import { bersihkanTangkapanLama } from './lib/layar.ts';
import { bersihkanGagalLogin } from './lib/sesi.ts';

const folderKlien = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client');
const app = buatApp({ folderKlien });

const server = app.listen(config.port, () => {
  console.log(`Simulasi TKA berjalan di http://localhost:${config.port}`);
});

// Setiap jam: bersihkan sesi login kedaluwarsa dan tangkapan layar yang melewati batas simpan.
function bersihkan() {
  prisma.sesiLogin.deleteMany({ where: { kadaluarsa: { lt: new Date() } } }).catch(console.error);
  bersihkanTangkapanLama().catch(console.error);
  bersihkanGagalLogin().catch(console.error);
}
bersihkan();
const pembersih = setInterval(bersihkan, 3600_000);

for (const sinyal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinyal, () => {
    clearInterval(pembersih);
    server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
}
