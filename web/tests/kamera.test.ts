import { describe, expect, it } from 'vitest';
import { galatBisaDilonggarkan, jelaskanGalatKamera } from '../src/lib/kamera.ts';

describe('penjelasan galat kamera', () => {
  it('izin ditolak di aplikasi Windows: arahkan ke pengaturan privasi kamera Windows', () => {
    const p = jelaskanGalatKamera({ name: 'NotAllowedError', message: 'Permission denied' }, { diAplikasi: true, statusOs: 'denied' });
    expect(p.jenis).toBe('diblokir-windows');
    expect(p.isi).toMatch(/Privasi & keamanan > Kamera/);
    expect(p.isi).toMatch(/aplikasi desktop/);
    expect(p.detail).toBe('NotAllowedError: Permission denied (status Windows: denied)');
  });

  it('izin ditolak di browser: arahkan ke ikon gembok browser', () => {
    const p = jelaskanGalatKamera({ name: 'NotAllowedError' }, { diAplikasi: false });
    expect(p.jenis).toBe('ditolak');
    expect(p.isi).toMatch(/bilah alamat/);
    expect(p.detail).toBe('NotAllowedError');
  });

  it('kamera tidak ada dan kamera dipakai aplikasi lain dibedakan', () => {
    expect(jelaskanGalatKamera({ name: 'NotFoundError' }, { diAplikasi: true }).jenis).toBe('tidak-ada');
    const p = jelaskanGalatKamera({ name: 'NotReadableError', message: 'Could not start video source' }, { diAplikasi: true });
    expect(p.jenis).toBe('dipakai');
    expect(p.isi).toMatch(/Zoom, Teams/);
  });

  it('galat tak dikenal tetap menyebut kodenya agar pengawas bisa melaporkan', () => {
    const p = jelaskanGalatKamera(new Error('aneh'), { diAplikasi: true });
    expect(p.jenis).toBe('lain');
    expect(p.detail).toBe('Error: aneh');
    expect(jelaskanGalatKamera(null, { diAplikasi: false }).detail).toBe('GalatTakDikenal');
  });

  it('detail dipotong agar muat di catatan pelanggaran (maks 300 karakter di server)', () => {
    expect(jelaskanGalatKamera({ name: 'X', message: 'a'.repeat(1000) }, { diAplikasi: true, statusOs: 'denied' }).detail.length).toBeLessThanOrEqual(280);
  });

  it('syarat kamera dilonggarkan hanya untuk galat yang mungkin karena resolusi/driver', () => {
    for (const nama of ['OverconstrainedError', 'NotReadableError']) expect(galatBisaDilonggarkan({ name: nama })).toBe(true);
    for (const nama of ['NotAllowedError', 'NotFoundError']) expect(galatBisaDilonggarkan({ name: nama })).toBe(false);
  });
});
