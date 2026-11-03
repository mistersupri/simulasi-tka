import { ImageSquare, Translate, Trash, UploadSimple } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GambarSoal } from '@/components/GambarSoal';
import { diPerangkatMathLive } from '@/components/editor/mathlive';
import { EditorTeks } from '@/components/editor/EditorTeks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, pesanGalat, urlGambar } from '@/lib/api';
import { atributLang, DAFTAR_BAHASA, labelBahasa } from '@/lib/bahasa';
import { perkecilGambar } from '@/lib/gambar';
import type { Soal, TipeSoal } from '@/lib/tipe';
import { cn } from '@/lib/utils';

const HURUF = ['A', 'B', 'C', 'D'];

const KETERANGAN_TIPE: Record<TipeSoal, string> = {
  PG: 'Pilihan ganda: satu jawaban benar.',
  PGK: 'Pilihan ganda kompleks: semua jawaban benar harus dipilih.',
  ISIAN: 'Isian singkat: siswa mengetik jawaban (angka, kata, kode, atau keluaran program) dan dinilai otomatis.',
};

/** Unggah satu gambar (diperkecil di browser dulu) dan kembalikan nama berkasnya. */
async function kirimGambar(file: File): Promise<string> {
  const form = new FormData();
  form.append('gambar', await perkecilGambar(file), file.name);
  return (await api.post<{ nama: string }>('/admin/soal/gambar', form)).nama;
}

export function FormSoal({ soal, sekolahId, daftarMapel, awalKelas, awalMapel, tutup }: {
  soal: Soal | null; sekolahId: string | null; daftarMapel: string[]; awalKelas: string | null; awalMapel: string | null; tutup: () => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState(() => ({
    id: soal?.id ?? '',
    mataPelajaran: soal?.mataPelajaran ?? awalMapel ?? daftarMapel[0] ?? 'Matematika',
    kelas: soal?.kelas ?? awalKelas ?? '6',
    tipe: soal?.tipe ?? ('PG' as TipeSoal),
    bahasa: soal?.bahasa ?? 'id',
    pertanyaan: soal?.pertanyaan ?? '',
    opsi: soal && soal.tipe !== 'ISIAN' ? soal.opsi : ['', '', '', ''],
    opsiGambar: Array.from({ length: 4 }, (_, i) => soal?.opsiGambar?.[i] ?? ''),
    kunci: soal && soal.tipe !== 'ISIAN' ? soal.kunci.split(',').filter(Boolean) : [],
    kunciIsian: soal?.tipe === 'ISIAN' ? soal.kunci : '',
    pekaHuruf: soal?.pekaHuruf ?? false,
    kode: soal?.kode ?? false,
    skor: String(soal?.skor ?? 1),
    pembahasan: soal?.pembahasan ?? '',
    aktif: soal?.aktif ?? true,
    gambar: soal?.gambar ?? null,
  }));
  const [galat, setGalat] = useState('');
  const [mengunggah, setMengunggah] = useState(false);
  // Keyboard layar MathLive dipasang di luar dialog; tutup bersama formulir.
  useEffect(() => () => { window.mathVirtualKeyboard?.hide(); }, []);
  const ubah = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const isian = d.tipe === 'ISIAN';
  const infoBahasa = DAFTAR_BAHASA.find((b) => b.kode === d.bahasa);

  const simpan = useMutation({
    mutationFn: () => {
      const body = {
        id: d.id, mataPelajaran: d.mataPelajaran, kelas: d.kelas, tipe: d.tipe, bahasa: d.bahasa, pertanyaan: d.pertanyaan,
        gambar: d.gambar, skor: Number(d.skor), pembahasan: d.pembahasan, aktif: d.aktif, sekolahId,
        opsi: isian ? [] : d.opsi,
        opsiGambar: isian ? [] : d.opsiGambar,
        kunci: isian ? d.kunciIsian : d.kunci.join(','),
        pekaHuruf: d.pekaHuruf, kode: d.kode,
      };
      return soal ? api.put<{ pesan: string }>(`/admin/soal/${soal.id}`, body) : api.post<{ pesan: string }>('/admin/soal', body);
    },
    onSuccess: (r) => { toast.success(r.pesan); qc.invalidateQueries({ queryKey: ['soal'] }); tutup(); },
    onError: (e) => setGalat(pesanGalat(e)),
  });

  const unggah = async (file: File | undefined, simpanNama: (nama: string) => void) => {
    if (!file) return;
    setMengunggah(true);
    try {
      simpanNama(await kirimGambar(file));
    } catch (e) {
      toast.error(pesanGalat(e));
    } finally {
      setMengunggah(false);
    }
  };

  const pilihKunci = (h: string) => {
    if (d.tipe === 'PG') return ubah('kunci', [h]);
    ubah('kunci', d.kunci.includes(h) ? d.kunci.filter((k) => k !== h) : [...d.kunci, h].sort());
  };

  const ubahTipe = (v: TipeSoal) => setD((x) => ({ ...x, tipe: v, kunci: v === 'PG' ? x.kunci.slice(0, 1) : x.kunci }));

  return (
    <Dialog open onOpenChange={(b) => !b && tutup()}>
      {/* Keyboard layar dan menu MathLive dipasang di luar dialog; mengkliknya tidak boleh menutup dialog. */}
      <DialogContent
        lebar
        // Formulir soal panjang: klik di luar tidak menutupnya (isian tidak hilang tanpa sengaja). Tutup lewat X atau Batal.
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => { if (diPerangkatMathLive(e.target)) e.preventDefault(); }}
        onInteractOutside={(e) => e.preventDefault()}
        // Escape di dalam editor hanya keluar dari rumus/menutup keyboard layar, bukan menutup dialog.
        onEscapeKeyDown={(e) => { if (e.target instanceof Element && (e.target.closest('.editor-teks') || diPerangkatMathLive(e.target))) e.preventDefault(); }}
      >
        <form onSubmit={(e) => { e.preventDefault(); setGalat(''); simpan.mutate(); }} className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>{soal ? `Ubah soal ${soal.id}` : 'Tambah soal'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="s-id">ID soal</Label><Input id="s-id" value={d.id} disabled={!!soal} placeholder="Otomatis" onChange={(e) => ubah('id', e.target.value.toUpperCase())} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="s-mapel">Mata pelajaran</Label>
                <Input id="s-mapel" list="daftar-mapel" value={d.mataPelajaran} onChange={(e) => ubah('mataPelajaran', e.target.value)} required />
                <datalist id="daftar-mapel">{[...new Set([...daftarMapel, 'Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'Bahasa Arab', 'Bahasa Mandarin', 'Bahasa Rusia', 'Informatika'])].map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <div className="space-y-1.5"><Label htmlFor="s-kelas">Kelas</Label><Input id="s-kelas" value={d.kelas} onChange={(e) => ubah('kelas', e.target.value)} required /></div>
              <div className="space-y-1.5">
                <Label htmlFor="s-tipe">Tipe soal</Label>
                <Select value={d.tipe} onValueChange={(v) => ubahTipe(v as TipeSoal)}>
                  <SelectTrigger id="s-tipe" aria-label="Tipe soal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PG">Pilihan ganda</SelectItem>
                    <SelectItem value="PGK">Pilihan ganda kompleks</SelectItem>
                    <SelectItem value="ISIAN">Isian singkat / kode</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">{KETERANGAN_TIPE[d.tipe]}</p>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="s-bahasa"><Translate className="mr-1 inline size-4" />Bahasa soal</Label>
                <Select value={d.bahasa} onValueChange={(v) => ubah('bahasa', v)}>
                  <SelectTrigger id="s-bahasa" aria-label="Bahasa soal"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {DAFTAR_BAHASA.map((b) => <SelectItem key={b.kode} value={b.kode}>{labelBahasa(b)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Menentukan font yang dipakai. Arah tulisan kanan-ke-kiri (Arab, Ibrani, Persia, Urdu) dikenali otomatis dari hurufnya,
                sehingga soal berbahasa Indonesia dengan pilihan berhuruf Arab juga tampil benar. Ketik dengan keyboard bahasa itu
                {infoBahasa?.aksara ? ` (${infoBahasa.aksara})` : ''}.
              </p>
            </div>

            <EditorTeks
              label="Pertanyaan" value={d.pertanyaan} onChange={(v) => ubah('pertanyaan', v)} bahasa={d.bahasa}
              placeholder="Ketik pertanyaan. Klik Rumus untuk menulis rumus matematika, atau Kode untuk soal pemrograman."
              petunjuk="Rumus dibuat langsung seperti menulis di kertas (pecahan, akar, pangkat); keyboard layar ada di dalam kotak rumus. Boleh dikosongkan bila soal berupa gambar."
            />

            <div className="space-y-1.5">
              <span className="text-sm font-semibold">Gambar soal (opsional)</span>
              {d.gambar && <GambarSoal nama={d.gambar} className="max-h-48" />}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-3 text-[13px] font-semibold hover:bg-muted focus-within:outline-3 focus-within:outline-biru">
                  <UploadSimple className="size-4" /> {mengunggah ? 'Mengunggah...' : d.gambar ? 'Ganti gambar' : 'Pilih gambar'}
                  <input type="file" accept="image/*" className="sr-only" disabled={mengunggah} onChange={(e) => { void unggah(e.target.files?.[0], (n) => ubah('gambar', n)); e.target.value = ''; }} />
                </label>
                {d.gambar && <Button type="button" size="sm" variant="ghost" onClick={() => ubah('gambar', null)}>Hapus gambar</Button>}
                <span className="text-xs text-muted-foreground">Gambar rumus, grafik, atau diagram. Gambar besar otomatis diperkecil.</span>
              </div>
            </div>

            {isian ? (
              <fieldset className="space-y-3 rounded-lg border border-garis bg-latar p-4">
                <legend className="px-1 text-sm font-semibold">Jawaban yang diterima</legend>
                <div className="space-y-1.5">
                  <Label htmlFor="s-isian">Satu jawaban benar per baris</Label>
                  <Textarea
                    id="s-isian" rows={3} value={d.kunciIsian} required onChange={(e) => ubah('kunciIsian', e.target.value)}
                    lang={atributLang(d.bahasa)} dir="auto" className={cn(d.kode && 'font-mono')} spellCheck={false}
                    placeholder={'14\nempat belas'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Siswa benar bila jawabannya sama dengan salah satu baris di atas. Spasi berlebih diabaikan. Maksimal 10 jawaban, kunci tidak terlihat oleh siswa selama ujian.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Switch id="s-peka" checked={d.pekaHuruf} onCheckedChange={(v) => ubah('pekaHuruf', v)} className="mt-0.5" />
                  <div>
                    <Label htmlFor="s-peka">Bedakan huruf besar dan kecil</Label>
                    <p className="text-xs text-muted-foreground">Nyalakan untuk kode program. Bila mati, "Spasibo" sama dengan "спасибо", harakat Arab diabaikan, dan huruf lebar penuh dari keyboard Mandarin/Jepang dianggap biasa.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Switch id="s-kode" checked={d.kode} onCheckedChange={(v) => setD((x) => ({ ...x, kode: v, pekaHuruf: v ? true : x.pekaHuruf }))} className="mt-0.5" />
                  <div>
                    <Label htmlFor="s-kode">Jawaban berupa kode atau keluaran program</Label>
                    <p className="text-xs text-muted-foreground">Kotak jawaban siswa memakai huruf monospace dan boleh beberapa baris (baris baru dianggap spasi saat dinilai).</p>
                  </div>
                </div>
                {/* Pratinjau kotak jawaban seperti yang dilihat siswa. */}
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Tampilan kotak jawaban siswa</p>
                  <div lang={atributLang(d.bahasa)} dir="auto" aria-hidden className={cn('rounded-md border border-input bg-white px-3 py-2 text-muted-foreground', d.kode && 'font-mono')}>
                    {d.kode ? 'Ketik kode atau keluaran program...' : 'Ketik jawaban...'}
                  </div>
                </div>
              </fieldset>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">
                  Pilihan jawaban <span className="font-semibold text-muted-foreground">({d.tipe === 'PGK' ? 'tandai SEMUA jawaban benar' : 'tandai satu jawaban benar'})</span>
                </legend>
                <p className="text-xs text-muted-foreground">Setiap pilihan boleh berupa teks, rumus, gambar, atau gabungannya.</p>
                {HURUF.map((h, i) => (
                  <div key={h} className="space-y-1">
                    <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                      <button
                        type="button" onClick={() => pilihKunci(h)} aria-pressed={d.kunci.includes(h)} aria-label={`Jadikan ${h} kunci jawaban`}
                        className={cn('grid size-11 shrink-0 place-content-center border font-semibold', d.tipe === 'PGK' ? 'rounded-md' : 'rounded-full',
                          d.kunci.includes(h) ? 'border-hijau bg-hijau text-white' : 'border-input bg-white')}
                      >{h}</button>
                      <EditorTeks
                        ringkas labelTersembunyi className="min-w-0 flex-1" label={`Pilihan ${h}`} bahasa={d.bahasa}
                        value={d.opsi[i]} onChange={(v) => ubah('opsi', d.opsi.map((o, j) => (j === i ? v : o)))}
                        placeholder={d.opsiGambar[i] ? 'Teks (opsional, sudah ada gambar)' : `Pilihan ${h}: teks atau rumus`}
                      />
                      {d.opsiGambar[i] ? (
                        <span className="flex items-center gap-1">
                          <img src={urlGambar(d.opsiGambar[i])} alt={`Gambar pilihan ${h}`} className="size-11 rounded-md border border-border bg-white object-contain" />
                          <Button type="button" size="icon-sm" variant="ghost" className="text-merah" aria-label={`Hapus gambar pilihan ${h}`} onClick={() => ubah('opsiGambar', d.opsiGambar.map((g, j) => (j === i ? '' : g)))}><Trash /></Button>
                        </span>
                      ) : (
                        <label
                          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-white px-2.5 text-[13px] font-semibold hover:bg-muted focus-within:outline-3 focus-within:outline-biru"
                          title={`Tambah gambar pada pilihan ${h}`}
                        >
                          <ImageSquare className="size-4" /> Gambar
                          <input
                            type="file" accept="image/*" className="sr-only" disabled={mengunggah} aria-label={`Gambar pilihan ${h}`}
                            onChange={(e) => { void unggah(e.target.files?.[0], (n) => ubah('opsiGambar', d.opsiGambar.map((g, j) => (j === i ? n : g)))); e.target.value = ''; }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </fieldset>
            )}

            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <div className="space-y-1.5"><Label htmlFor="s-skor">Skor</Label><Input id="s-skor" type="number" min="0.5" step="0.5" value={d.skor} onChange={(e) => ubah('skor', e.target.value)} /></div>
              <EditorTeks
                label="Pembahasan (opsional)" value={d.pembahasan} onChange={(v) => ubah('pembahasan', v)} bahasa={d.bahasa} tinggiMin={4}
                placeholder="Tampil ke siswa bila ujian mengizinkan pembahasan. Rumus bisa dipakai di sini."
              />
            </div>
            <Label className="font-semibold"><Switch checked={d.aktif} onCheckedChange={(v) => ubah('aktif', v)} /> Soal aktif (bisa muncul di ujian)</Label>
            {galat && <p role="alert" className="rounded-md bg-merah-muda px-3 py-2 text-sm font-semibold text-merah">{galat}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={tutup}>Batal</Button>
            <Button type="submit" disabled={simpan.isPending || mengunggah}>{simpan.isPending ? 'Menyimpan...' : 'Simpan soal'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
