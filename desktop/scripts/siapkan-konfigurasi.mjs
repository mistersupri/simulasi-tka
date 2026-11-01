// Menulis konfigurasi.json yang ikut tertanam di dalam installer.
//
//   TKA_SERVER_URL      (wajib)  alamat aplikasi, mis. http://192.168.1.10:3000 atau https://tka.sekolah.sch.id
//   TKA_KUNCI_APLIKASI  (opsional) harus sama dengan KUNCI_APLIKASI di server; untuk fitur "wajib aplikasi"
//   TKA_SANDI_DARURAT   (opsional) kata sandi pengawas bila server tidak bisa dihubungi; disimpan sebagai hash
//
// Contoh (PowerShell):  $env:TKA_SERVER_URL="http://192.168.1.10:3000"; npm run build:win
import crypto from 'node:crypto';
import fs from 'node:fs';

function gagal(pesan) {
  console.error(`\n${pesan}\n`);
  process.exit(1);
}

const mentah = (process.env.TKA_SERVER_URL ?? '').trim();
if (!mentah) gagal('TKA_SERVER_URL belum diisi. Contoh: TKA_SERVER_URL=http://192.168.1.10:3000 npm run build:win');

let url;
try {
  url = new URL(mentah);
} catch {
  gagal(`TKA_SERVER_URL tidak valid: ${mentah}`);
}
if (!['http:', 'https:'].includes(url.protocol)) gagal('TKA_SERVER_URL harus diawali http:// atau https://');

const kunci = (process.env.TKA_KUNCI_APLIKASI ?? '').trim();
if (kunci && kunci.length < 16) gagal('TKA_KUNCI_APLIKASI minimal 16 karakter.');

let sandiDarurat = null;
const sandi = process.env.TKA_SANDI_DARURAT ?? '';
if (sandi) {
  if (sandi.length < 8) gagal('TKA_SANDI_DARURAT minimal 8 karakter.');
  const salt = crypto.randomBytes(16);
  sandiDarurat = `scrypt$16384$${salt.toString('base64')}$${crypto.scryptSync(sandi, salt, 32, { N: 16384 }).toString('base64')}`;
}

const konfigurasi = { server: url.origin, kunciAplikasi: kunci || null, sandiDarurat };
fs.writeFileSync(new URL('../konfigurasi.json', import.meta.url), JSON.stringify(konfigurasi, null, 2) + '\n');
console.log(`konfigurasi.json: server ${url.origin}` +
  `${kunci ? ', kunci aplikasi terpasang' : ', tanpa kunci aplikasi'}` +
  `${sandiDarurat ? ', sandi darurat terpasang' : ''}`);
