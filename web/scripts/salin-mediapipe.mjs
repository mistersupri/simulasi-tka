// Menyalin berkas WebAssembly MediaPipe ke public/ agar deteksi wajah
// berjalan dari server sendiri (tanpa CDN). Dijalankan otomatis saat npm install.
import fs from 'node:fs';
import path from 'node:path';

const asal = path.resolve('node_modules/@mediapipe/tasks-vision/wasm');
const tujuan = path.resolve('public/mediapipe/wasm');
fs.mkdirSync(tujuan, { recursive: true });
for (const nama of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  fs.copyFileSync(path.join(asal, nama), path.join(tujuan, nama));
}
console.log('Berkas MediaPipe disalin ke public/mediapipe/wasm');
