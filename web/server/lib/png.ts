/**
 * Pembuat gambar PNG sederhana (tanpa pustaka tambahan) untuk contoh gambar di template impor soal.
 * Hanya mendukung warna RGB 8-bit tanpa transparansi.
 */
import zlib from 'node:zlib';

type Piksel = [number, number, number];

function potong(tipe: string, data: Buffer): Buffer {
  const panjang = Buffer.alloc(4);
  panjang.writeUInt32BE(data.length);
  const isi = Buffer.concat([Buffer.from(tipe, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(isi) >>> 0);
  return Buffer.concat([panjang, isi, crc]);
}

export function kodePng(lebar: number, tinggi: number, warna: (x: number, y: number) => Piksel): Buffer {
  const baris = Buffer.alloc((lebar * 3 + 1) * tinggi);
  for (let y = 0; y < tinggi; y++) {
    const awal = y * (lebar * 3 + 1);
    baris[awal] = 0; // tanpa filter
    for (let x = 0; x < lebar; x++) baris.set(warna(x, y), awal + 1 + x * 3);
  }
  const kepala = Buffer.alloc(13);
  kepala.writeUInt32BE(lebar, 0);
  kepala.writeUInt32BE(tinggi, 4);
  kepala[8] = 8; // kedalaman bit
  kepala[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    potong('IHDR', kepala),
    potong('IDAT', zlib.deflateSync(baris)),
    potong('IEND', Buffer.alloc(0)),
  ]);
}

const PUTIH: Piksel = [255, 255, 255];
const BIRU: Piksel = [30, 58, 110];

export type BentukContoh = 'lingkaran' | 'persegi' | 'segitiga' | 'garis';

/** Gambar contoh 160x120: bentuk biru tua di atas latar putih. */
export function gambarContoh(bentuk: BentukContoh): Buffer {
  return kodePng(160, 120, (x, y) => {
    switch (bentuk) {
      case 'lingkaran': return (x - 80) ** 2 + (y - 60) ** 2 <= 45 ** 2 ? BIRU : PUTIH;
      case 'persegi': return x >= 35 && x <= 125 && y >= 20 && y <= 110 ? BIRU : PUTIH;
      case 'segitiga': {
        // Puncak (80,15), alas y=105 dari x=20 sampai x=140.
        if (y < 15 || y > 105) return PUTIH;
        const setengah = ((y - 15) / 90) * 60;
        return Math.abs(x - 80) <= setengah ? BIRU : PUTIH;
      }
      case 'garis': return Math.abs((100 - y) * 120 - (x - 20) * 80) <= 3.5 * Math.hypot(120, 80) && x >= 20 && x <= 140 ? BIRU : PUTIH;
    }
  });
}
