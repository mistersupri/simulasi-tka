/** Teks tempelan dari Excel/Sheets (tab) atau CSV (koma/titik koma) → tabel 2D. */
export function parseTabel(teks: string): string[][] {
  const isi = teks.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!isi.trim()) return [];
  const pertama = isi.split('\n')[0];
  const pemisah = pertama.includes('\t') ? '\t' : pertama.split(';').length > pertama.split(',').length ? ';' : ',';

  const hasil: string[][] = [];
  let baris: string[] = [];
  let sel = '';
  let kutip = false;
  for (let i = 0; i < isi.length; i++) {
    const c = isi[i];
    if (kutip) {
      if (c === '"' && isi[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"' && sel === '') kutip = true;
    else if (c === pemisah) { baris.push(sel); sel = ''; }
    else if (c === '\n') { baris.push(sel); hasil.push(baris); baris = []; sel = ''; }
    else sel += c;
  }
  baris.push(sel);
  hasil.push(baris);
  return hasil.map((b) => b.map((x) => x.trim())).filter((b) => b.some((x) => x !== ''));
}

export type KolomImpor = { kunci: string; header: string[] };

/**
 * Tabel 2D → objek. Bila baris pertama berisi nama kolom yang dikenal,
 * kolom dicocokkan berdasarkan nama; bila tidak, berdasarkan urutan.
 */
export function tabelKeObjek(tabel: string[][], kolom: KolomImpor[]) {
  if (!tabel.length) return [];
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pertama = tabel[0].map(norm);
  const posisi = kolom.map((k) => pertama.findIndex((h) => k.header.map(norm).includes(h)));
  const adaHeader = posisi.filter((p) => p !== -1).length >= 2;
  const data = adaHeader ? tabel.slice(1) : tabel;
  return data.map((b, i) => {
    const obj: Record<string, string | number> = { nomor: i + (adaHeader ? 2 : 1) };
    kolom.forEach((k, j) => {
      const p = adaHeader ? posisi[j] : j;
      obj[k.kunci] = p !== -1 ? (b[p] ?? '') : '';
    });
    return obj;
  });
}

export function unduhCsv(namaFile: string, baris: (string | number | null | undefined)[][]) {
  const isi = '﻿' + baris
    .map((b) => b.map((v) => {
      const s = String(v ?? '');
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');
  unduhBlob(namaFile, new Blob([isi], { type: 'text/csv;charset=utf-8' }));
}

export function unduhBlob(namaFile: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
