/**
 * MathLive (editor rumus visual: pecahan, akar, pangkat dengan kotak putus-putus dan keyboard layar).
 * Hanya dimuat di halaman admin saat editor soal dipakai; siswa tidak mengunduhnya.
 */
type ModulMathLive = typeof import('mathlive');

let janji: Promise<ModulMathLive> | null = null;

export function muatMathLive(): Promise<ModulMathLive> {
  // Font rumus memakai KaTeX (sama dengan tampilan siswa) yang sudah dibundel oleh Vite lewat katex.min.css.
  janji ??= Promise.all([import('mathlive'), import('katex/dist/katex.min.css')]).then(([m]) => {
    m.MathfieldElement.fontsDirectory = null;
    m.MathfieldElement.soundsDirectory = null;
    m.MathfieldElement.decimalSeparator = ','; // 0,5 (bukan 0.5) sesuai penulisan di Indonesia
    return m;
  });
  return janji;
}

// Rumus yang baru disisipkan langsung menerima fokus agar guru bisa langsung mengetik.
let fokusBerikutnya = false;
export const mintaFokusRumus = () => { fokusBerikutnya = true; };
export const ambilFokusRumus = () => {
  const v = fokusBerikutnya;
  fokusBerikutnya = false;
  return v;
};

/** Elemen milik MathLive yang dipasang di luar dialog (keyboard layar, menu, saran perintah). */
export const diPerangkatMathLive = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('.ML__keyboard, .MLK__backdrop, .ML__popover, .ui-menu-container, math-virtual-keyboard, [class*="MLK__"]');
