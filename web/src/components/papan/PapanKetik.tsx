import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PAPAN, PAPAN_BIASA, entriUntukBahasa, type EntriPapan } from '@/lib/papan/daftar';
import { hapusHangul, susunHangul, type Komposisi } from '@/lib/papan/hangul';
import { susunKana } from '@/lib/papan/kana';
import { PINYIN_AWAL, UKURAN_HALAMAN, kandidatPinyin, prosesPinyin, type KeadaanPinyin, type MasukanPinyin } from '@/lib/papan/pinyin';
import { pilihAksi, type Aksi, type TataLetak } from '@/lib/papan/tataLetak';
import type { Adapter } from './adapter';

/**
 * Papan ketik layar untuk formulir soal.
 *
 * - Papan biasa (QWERTY) selalu tersedia. Satu "papan alternatif" (Formula atau bahasa asing) dipilih lewat pilihan
 *   di papan layar; pilihan itu hanya menyiapkan papan, tidak mengaktifkannya.
 * - Ctrl+Shift+T (atau Alt+Shift+T) atau tombol "Ganti papan" mengaktifkan/menonaktifkan papan alternatif.
 *   Saat aktif, tombol FISIK menghasilkan karakter yang tertera di papan layar (pemetaan menurut posisi tombol).
 * - Memilih papan bahasa juga mengatur bahasa soal (font dan arah tulisan).
 */
type Nilai = {
  terbuka: boolean;
  setTerbuka: (b: boolean) => void;
  entri: EntriPapan[];
  idAlternatif: string;
  pilihAlternatif: (id: string) => void;
  /** Papan alternatif sedang menggantikan papan biasa. */
  aktif: boolean;
  ganti: () => void;
  /** Tata letak alternatif yang sudah termuat (null untuk "tanpa papan khusus" atau sedang memuat). */
  layoutAlt: TataLetak | null;
  memuat: boolean;
  /** Tata letak yang gambarnya ditampilkan di tombol layar. */
  layoutTampil: TataLetak;
  bahasa: string;
  pinyin: KeadaanPinyin;
  kandidat: string[];
  pilihKandidat: (indeks: number) => void;
  halamanKandidat: (arah: 1 | -1) => void;
  daftarkan: (el: Element, adapter: Adapter) => () => void;
  /** Penekanan tombol pada papan layar. */
  tekan: (kode: string, shift: boolean) => void;
};

const Konteks = createContext<Nilai | null>(null);
export const usePapan = () => useContext(Konteks);

const cache = new Map<string, Promise<TataLetak>>();
const muatTataLetak = (e: EntriPapan) => {
  if (!e.muat) return null;
  if (!cache.has(e.id)) cache.set(e.id, e.muat().catch((err) => { cache.delete(e.id); throw err; }));
  return cache.get(e.id)!;
};

const MASUKAN_PINYIN: Record<string, MasukanPinyin> = {
  Space: { jenis: 'spasi' }, Enter: { jenis: 'enter' }, Backspace: { jenis: 'hapus' }, Escape: { jenis: 'batal' },
  Equal: { jenis: 'berikut' }, Minus: { jenis: 'sebelum' },
};

export function PapanKetikProvider({ bahasa, onBahasa, children }: { bahasa: string; onBahasa: (kode: string) => void; children: ReactNode }) {
  const [terbuka, setTerbuka] = useState(false);
  const [idAlternatif, setIdAlternatif] = useState(() => entriUntukBahasa(bahasa).id);
  const [layoutAlt, setLayoutAlt] = useState<TataLetak | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [aktif, setAktif] = useState(false);
  const [pinyin, setPinyin] = useState<KeadaanPinyin>(PINYIN_AWAL);

  // Nilai terbaru untuk pendengar papan ketik (dipasang sekali).
  const ref = useRef({ aktif, layoutAlt, pinyin, terakhir: null as Adapter | null });
  ref.current.aktif = aktif && !!layoutAlt;
  ref.current.layoutAlt = layoutAlt;
  ref.current.pinyin = pinyin;
  const peta = useRef(new Map<Element, Adapter>());
  const onBahasaRef = useRef(onBahasa);
  onBahasaRef.current = onBahasa;

  const entri = PAPAN;

  // Muat tata letak papan alternatif yang dipilih.
  useEffect(() => {
    const e = PAPAN.find((p) => p.id === idAlternatif);
    const janji = e ? muatTataLetak(e) : null;
    setPinyin(PINYIN_AWAL);
    if (!janji) { setLayoutAlt(null); setMemuat(false); return; }
    let batal = false;
    setMemuat(true);
    janji.then((t) => { if (!batal) { setLayoutAlt(t); setMemuat(false); } }).catch(() => { if (!batal) { setLayoutAlt(null); setMemuat(false); } });
    return () => { batal = true; };
  }, [idAlternatif]);

  const daftarkan = useCallback((el: Element, a: Adapter) => {
    peta.current.set(el, a);
    return () => { if (peta.current.get(el) === a) peta.current.delete(el); };
  }, []);

  const cariAdapter = useCallback((jalur: EventTarget[]) => {
    for (const t of jalur) if (t instanceof Element) { const a = peta.current.get(t); if (a) return a; }
    return null;
  }, []);

  const ganti = useCallback(() => {
    if (!ref.current.layoutAlt) return;
    setPinyin(PINYIN_AWAL);
    setAktif((a) => !a);
  }, []);

  /** Satu penekanan tombol pada papan alternatif. true = sudah ditangani (jangan ketik bawaan browser). */
  const tekanKode = useCallback((kode: string, shift: boolean, caps: boolean, adapter: Adapter): boolean => {
    const { aktif: hidup, layoutAlt: layout, pinyin: kp } = ref.current;
    if (!hidup || !layout) return false;

    if (layout.komposer === 'pinyin') {
      let masukan: MasukanPinyin | undefined = MASUKAN_PINYIN[kode];
      if (/^Key[A-Z]$/.test(kode) && !shift) masukan = { jenis: 'huruf', huruf: kode.slice(3).toLowerCase() };
      else if (/^Digit[1-9]$/.test(kode) && !shift) masukan = { jenis: 'angka', n: Number(kode.slice(5)) };
      if (masukan) {
        const h = prosesPinyin(layout.kandidat ?? {}, kp, masukan);
        if (h.tangani) {
          ref.current.pinyin = h.keadaan;
          setPinyin(h.keadaan);
          if (h.sisip) adapter.sisipAksi({ tampil: h.sisip, teks: h.sisip });
          return true;
        }
      }
    }

    if (layout.komposer === 'hangul' && kode === 'Backspace') {
      const k = hapusHangul(adapter.konteks(1));
      if (!k) return false;
      adapter.ganti(k.hapus, k.sisip);
      return true;
    }

    const aksi = pilihAksi(layout, kode, shift, caps);
    if (!aksi) return false;
    // Penyusunan: suku kata Hangul, kana + tanda dakuten, huruf + aksen gabung.
    let komposisi: Komposisi | null = null;
    if (layout.komposer === 'hangul') komposisi = susunHangul(adapter.konteks(1), aksi.teks ?? '');
    else if (layout.komposer !== 'pinyin' && aksi.teks) komposisi = susunKana(adapter.konteks(1), aksi.teks);
    if (komposisi) adapter.ganti(komposisi.hapus, komposisi.sisip);
    else adapter.sisipAksi(aksi);
    return true;
  }, []);

  // Papan fisik: pintasan ganti papan, lalu pemetaan tombol saat papan alternatif aktif.
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      // Ctrl+Shift+T (browser tertentu menyimpannya untuk "buka kembali tab"), Alt+Shift+T sebagai cadangan.
      if (e.code === 'KeyT' && e.shiftKey && !e.metaKey && e.ctrlKey !== e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        ganti();
        return;
      }
      if (!ref.current.aktif || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
      const adapter = cariAdapter(e.composedPath());
      if (!adapter) return;
      if (tekanKode(e.code, e.shiftKey, e.getModifierState('CapsLock'), adapter)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const fokus = (e: FocusEvent) => {
      const a = cariAdapter(e.composedPath());
      if (!a) return;
      if (ref.current.terakhir !== a && ref.current.pinyin.penampung) { ref.current.pinyin = PINYIN_AWAL; setPinyin(PINYIN_AWAL); }
      ref.current.terakhir = a;
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', fokus, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', fokus, true);
    };
  }, [cariAdapter, ganti, tekanKode]);

  const tekan = useCallback((kode: string, shift: boolean) => {
    const adapter = ref.current.terakhir;
    if (!adapter) return;
    adapter.fokus();
    if (tekanKode(kode, shift, false, adapter)) return;
    // Tidak ditangani papan alternatif: perilaku papan biasa.
    if (kode === 'Space') adapter.sisipAksi({ tampil: ' ', teks: ' ' });
    else if (kode === 'Backspace') adapter.hapus();
    else if (kode === 'Enter') adapter.baris();
    else {
      const aksi: Aksi | null = pilihAksi(PAPAN_BIASA, kode, shift);
      if (aksi) adapter.sisipAksi(aksi);
    }
  }, [tekanKode]);

  const pilihAlternatif = useCallback((id: string) => {
    const e = PAPAN.find((p) => p.id === id);
    if (!e) return;
    setIdAlternatif(id);
    if (!e.muat) setAktif(false);
    // Papan bahasa sekaligus menentukan bahasa soal.
    if (e.bahasa) onBahasaRef.current(e.bahasa);
  }, []);

  const kandidat = useMemo(() => (layoutAlt?.kandidat ? kandidatPinyin(layoutAlt.kandidat, pinyin.penampung) : []), [layoutAlt, pinyin.penampung]);

  const pilihKandidat = useCallback((indeks: number) => {
    const adapter = ref.current.terakhir;
    const teks = kandidat[pinyin.halaman * UKURAN_HALAMAN + indeks];
    if (!adapter || !teks) return;
    adapter.fokus();
    adapter.sisipAksi({ tampil: teks, teks });
    ref.current.pinyin = PINYIN_AWAL;
    setPinyin(PINYIN_AWAL);
  }, [kandidat, pinyin.halaman]);

  const halamanKandidat = useCallback((arah: 1 | -1) => {
    setPinyin((k) => {
      const berikut = k.halaman + arah;
      return berikut < 0 || berikut * UKURAN_HALAMAN >= kandidat.length ? k : { ...k, halaman: berikut };
    });
  }, [kandidat.length]);

  const nilai: Nilai = {
    terbuka, setTerbuka, entri, idAlternatif, pilihAlternatif, aktif: aktif && !!layoutAlt, ganti, layoutAlt, memuat,
    layoutTampil: aktif && layoutAlt ? layoutAlt : PAPAN_BIASA, bahasa, pinyin, kandidat, pilihKandidat, halamanKandidat, daftarkan, tekan,
  };
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}
