export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function minta<T>(metode: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method: metode,
      credentials: 'same-origin',
      headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa internet lalu coba lagi.');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.pesan ?? 'Terjadi kesalahan.');
  return data as T;
}

export const api = {
  get: <T>(url: string) => minta<T>('GET', url),
  post: <T>(url: string, body?: unknown) => minta<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => minta<T>('PUT', url, body ?? {}),
  delete: <T>(url: string) => minta<T>('DELETE', url),
};

export const pesanGalat = (err: unknown) => (err instanceof Error ? err.message : 'Terjadi kesalahan.');
export const urlGambar = (nama: string) => `/api/berkas/gambar/${encodeURIComponent(nama)}`;
