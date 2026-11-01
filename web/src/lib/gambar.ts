/** Perkecil gambar sebelum diunggah agar soal cepat dibuka di jaringan sekolah. */
export async function perkecilGambar(file: File, lebarMaks = 1200): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih berkas gambar (PNG/JPG).');
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Gambar tidak dapat dibuka.'); });
  if (bitmap.width <= lebarMaks) return file;
  const kanvas = document.createElement('canvas');
  kanvas.width = lebarMaks;
  kanvas.height = Math.round((bitmap.height * lebarMaks) / bitmap.width);
  kanvas.getContext('2d')!.drawImage(bitmap, 0, 0, kanvas.width, kanvas.height);
  const jenis = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) =>
    kanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar.'))), jenis, 0.85));
}
