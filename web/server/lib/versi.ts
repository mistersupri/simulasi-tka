import fs from 'node:fs';
import path from 'node:path';

function versiDariBerkas() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'));
    return String(pkg.version ?? '');
  } catch {
    return '';
  }
}

/** Nomor versi server rilis. Image Docker memakai APP_VERSION dari build; paket tarball memakai package.json. */
export const VERSI_SERVER = process.env.APP_VERSION?.trim() || versiDariBerkas() || 'tidak-diketahui';
