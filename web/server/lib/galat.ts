import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** Error yang pesannya aman ditampilkan ke pengguna. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const galat = (status: number, pesan: string) => new HttpError(status, pesan);

export const penanganGalat: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ pesan: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ pesan: err.issues[0]?.message ?? 'Data tidak valid.' });
    return;
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ pesan: 'Ukuran berkas terlalu besar.' });
    return;
  }
  if (err?.status === 404 || err?.code === 'ENOENT') {
    res.status(404).json({ pesan: 'Berkas tidak ditemukan.' });
    return;
  }
  console.error(err);
  res.status(500).json({ pesan: 'Terjadi kesalahan pada server.' });
};
