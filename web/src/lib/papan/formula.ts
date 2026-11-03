/**
 * Tata letak "Formula": tombol huruf menghasilkan simbol matematika (A → +, S → −, D → ×, ...),
 * Shift menghasilkan huruf Yunani. Baris angka tetap seperti papan ketik biasa agar angka bisa langsung diketik.
 * Huruf variabel (x, y, n, ...) diketik dengan kembali ke papan biasa (Ctrl+Shift+T).
 */
import type { Aksi, Kunci, TataLetak } from './tataLetak.ts';

/** Simbol biasa: `teks` untuk di dalam kalimat, `latex` untuk di dalam kotak rumus. */
const simbol = (tampil: string, latex?: string): Aksi => ({ tampil, teks: tampil, latex });
const biasa = (c: string): Aksi => ({ tampil: c, teks: c });
const struktur = (tampil: string, teks: string, latex: string, latexBaru?: string): Aksi => ({ tampil, teks, latex, latexBaru, struktur: true });

const KOTAK = '\\placeholder{}';
const PECAHAN = struktur('a⁄b', '/', `\\frac{${KOTAK}}{${KOTAK}}`);
const AKAR = struktur('√', '√', `\\sqrt{${KOTAK}}`);
const PANGKAT = struktur('xⁿ', '^', `^{${KOTAK}}`, `{${KOTAK}}^{${KOTAK}}`);
const INDEKS = struktur('xₙ', '_', `_{${KOTAK}}`, `{${KOTAK}}_{${KOTAK}}`);
const SIGMA = struktur('∑', '∑', `\\sum_{${KOTAK}}^{${KOTAK}}`);
const INTEGRAL = struktur('∫', '∫', `\\int_{${KOTAK}}^{${KOTAK}}`);

const K = (b: Aksi, s: Aksi): Kunci => ({ biasa: b, shift: s });
const yunani = (huruf: string, latex: string): Aksi => simbol(huruf, latex);

export const FORMULA: TataLetak = {
  id: 'formula',
  nama: 'Formula matematika',
  kunci: {
    // Baris angka: seperti papan ketik biasa, dengan sedikit tambahan untuk matematika.
    Backquote: K(simbol('°', '^{\\circ}'), simbol('′', "'")),
    Digit1: K(biasa('1'), biasa('!')), Digit2: K(biasa('2'), biasa('@')), Digit3: K(biasa('3'), biasa('#')),
    Digit4: K(biasa('4'), biasa('$')), Digit5: K(biasa('5'), simbol('%', '\\%')), Digit6: K(biasa('6'), PANGKAT),
    Digit7: K(biasa('7'), biasa('&')), Digit8: K(biasa('8'), simbol('⋅', '\\cdot ')), Digit9: K(biasa('9'), biasa('(')),
    Digit0: K(biasa('0'), biasa(')')),
    Minus: K(simbol('−', '-'), simbol('±', '\\pm ')), Equal: K(biasa('='), simbol('≈', '\\approx ')),

    // Baris atas: tanda kurung, akar, pangkat, pi.
    KeyQ: K(biasa('('), yunani('Ω', '\\Omega ')), KeyW: K(biasa(')'), yunani('Σ', '\\Sigma ')),
    KeyE: K(biasa('['), yunani('ε', '\\varepsilon ')), KeyR: K(biasa(']'), yunani('ρ', '\\rho ')),
    KeyT: K(simbol('{', '\\{'), yunani('τ', '\\tau ')), KeyY: K(simbol('}', '\\}'), yunani('ψ', '\\psi ')),
    KeyU: K(AKAR, yunani('θ', '\\theta ')), KeyI: K(PANGKAT, yunani('ι', '\\iota ')),
    KeyO: K(INDEKS, yunani('ω', '\\omega ')), KeyP: K(simbol('π', '\\pi '), yunani('Π', '\\Pi ')),
    BracketLeft: K(simbol('|', '|'), simbol('‖', '\\Vert ')), BracketRight: K(simbol('′', "'"), simbol('″', "''")),
    Backslash: K(simbol('∖', '\\setminus '), simbol('¦', '|')),

    // Baris tengah: operasi dasar dan perbandingan (A → +, S → −, D → ×, F → ÷, G → =, ...).
    KeyA: K(simbol('+', '+'), yunani('α', '\\alpha ')), KeyS: K(simbol('−', '-'), yunani('σ', '\\sigma ')),
    KeyD: K(simbol('×', '\\times '), yunani('δ', '\\delta ')), KeyF: K(simbol('÷', '\\div '), yunani('φ', '\\varphi ')),
    KeyG: K(simbol('=', '='), yunani('γ', '\\gamma ')), KeyH: K(simbol('≠', '\\neq '), yunani('η', '\\eta ')),
    KeyJ: K(simbol('≤', '\\leq '), yunani('ξ', '\\xi ')), KeyK: K(simbol('≥', '\\geq '), yunani('κ', '\\kappa ')),
    KeyL: K(simbol('±', '\\pm '), yunani('λ', '\\lambda ')),
    Semicolon: K(simbol('∞', '\\infty '), simbol('∴', '\\therefore ')), Quote: K(simbol('%', '\\%'), simbol('∵', '\\because ')),

    // Baris bawah: pembanding, bangun datar, jumlah, integral, pecahan.
    KeyZ: K(simbol('<', '<'), yunani('ζ', '\\zeta ')), KeyX: K(simbol('>', '>'), yunani('χ', '\\chi ')),
    KeyC: K(simbol('∠', '\\angle '), yunani('Δ', '\\Delta ')), KeyV: K(simbol('△', '\\triangle '), yunani('Φ', '\\Phi ')),
    KeyB: K(SIGMA, yunani('β', '\\beta ')), KeyN: K(INTEGRAL, yunani('ν', '\\nu ')), KeyM: K(simbol('⊥', '\\perp '), yunani('μ', '\\mu ')),
    Comma: K(biasa(','), simbol('∥', '\\parallel ')), Period: K(biasa('.'), simbol('…', '\\ldots ')), Slash: K(PECAHAN, simbol('?', '?')),
  },
};
