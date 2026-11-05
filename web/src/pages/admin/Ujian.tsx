import { ArrowsClockwise, ArrowsOut, Camera, ChartBar, Desktop, Monitor, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KepalaHalaman, useDaftarSekolah, useStaf } from '@/components/admin';
import { useKonfirmasi } from '@/components/Konfirmasi';
import { Galat, Kosong, Memuat } from '@/components/Keadaan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, pesanGalat } from '@/lib/api';
import { dariInputWaktu, formatTanggal, keInputWaktu } from '@/lib/format';
import type { Ujian } from '@/lib/tipe';
import { DialogAnalisis } from './Hasil';

type Data = { ujian: Ujian[]; daftarMapel: string[]; aplikasiTersedia: boolean };

const PILIHAN_INTERVAL: [string, string][] = [['0', 'Tidak direkam'], ['30', 'Setiap 30 detik'], ['60', 'Setiap 1 menit'], ['120', 'Setiap 2 menit'], ['300', 'Setiap 5 menit']];
const labelInterval = (detik: number) => (detik % 60 === 0 ? `${detik / 60} menit` : `${detik} detik`);

function statusJadwal(u: Ujian) {
  const sekarang = Date.now();
  if (!u.aktif) return { label: 'Nonaktif', varian: 'default' as const };
  if (u.waktuMulai && sekarang < new Date(u.waktuMulai).getTime()) return { label: 'Terjadwal', varian: 'biru' as const };
  if (u.waktuSelesai && sekarang > new Date(u.waktuSelesai).getTime()) return { label: 'Sudah ditutup', varian: 'merah' as const };
  return { label: 'Dibuka', varian: 'hijau' as const };
}

export default function HalamanUjian() {
  const qc = useQueryClient();
  const staf = useStaf();
  // Operator melihat ujian bersama dari instansi (hanya baca) dan mengelola ujian internal sekolahnya.
  const admin = staf.peran === 'ADMIN';
  const sekolahQ = useDaftarSekolah();
  const namaSekolah = useMemo(() => new Map((sekolahQ.data ?? []).map((s) => [s.id, s.nama])), [sekolahQ.data]);
  const [konfirmasi, dialog] = useKonfirmasi();
  const [form, setForm] = useState<Ujian | 'baru' | null>(null);
  const [analisis, setAnalisis] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['ujian'], queryFn: () => api.get<Data>('/admin/ujian') });

  const segarkan = () => qc.invalidateQueries({ queryKey: ['ujian'] });
  const token = useMutation({
    mutationFn: (id: string) => api.post<{ token: string }>(`/admin/ujian/${id}/token`),
    onSuccess: (r) => { toast.success(`Token baru: ${r.token}`); segarkan(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });
  const hapus = useMutation({
    mutationFn: (id: string) => api.delete<{ pesan: string }>(`/admin/ujian/${id}`),
    onSuccess: (r) => { toast.success(r.pesan); segarkan(); },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  return (
    <>
      <KepalaHalaman
        judul="Jadwal ujian"
        keterangan={admin
          ? 'Atur sekolah peserta, kapan ujian dibuka, tokennya, dan cara pengawasannya.'
          : 'Ujian bersama dari Suku Dinas (bacakan tokennya saat ujian dimulai) dan ujian internal sekolah Anda.'}
      >
        <Button onClick={() => setForm('baru')}><Plus /> {admin ? 'Buat ujian' : 'Buat ujian sekolah'}</Button>
      </KepalaHalaman>
      {q.isPending ? <Memuat /> : q.error ? <Galat galat={q.error} ulangi={() => q.refetch()} /> : !q.data.ujian.length ? (
        <Kosong judul="Belum ada ujian.">{admin ? 'Buat ujian pertama, lalu bagikan tokennya saat hari ujian.' : 'Belum ada ujian yang dijadwalkan untuk sekolah Anda.'}</Kosong>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {q.data.ujian.map((u) => {
            const s = statusJadwal(u);
            const kekurangan = Object.entries(u.soalPerKelas).filter(([, n]) => n === 0 || (u.jumlahSoal > 0 && n < u.jumlahSoal));
            return (
              <li key={u.id} className="flex flex-col rounded-lg border border-garis bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={s.varian}>{s.label}</Badge>
                      {u.pemilikId
                        ? <Badge variant="biru">{admin ? `Ujian internal ${u.namaPemilik}` : 'Ujian sekolah'}</Badge>
                        : !admin && <Badge>Dari Suku Dinas</Badge>}
                    </div>
                    <h2 className="mt-2 text-xl">{u.nama}</h2>
                    <p className="text-sm text-muted-foreground">{u.mataPelajaran} · {u.kelas.length ? `Kelas ${u.kelas.join(', ')}` : 'Semua kelas'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-muted-foreground">Token</p>
                    <p className="text-lg font-semibold tracking-widest">{u.token ?? 'Tanpa'}</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {admin && (
                    <>
                      <dt className="text-muted-foreground">Sekolah</dt>
                      <dd className="font-semibold">
                        {u.pemilikId ? u.namaPemilik : u.sekolah.length ? (u.sekolah.length > 2 ? `${u.sekolah.length} sekolah` : u.sekolah.map((id) => namaSekolah.get(id) ?? '?').join(', ')) : 'Semua sekolah'}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Waktu</dt><dd className="font-semibold">{u.durasiMenit ? `${u.durasiMenit} menit` : 'Tanpa batas'}</dd>
                  <dt className="text-muted-foreground">Soal</dt><dd className="font-semibold">{u.jumlahSoal ? `${u.jumlahSoal} diambil acak` : 'Semua soal'}</dd>
                  <dt className="text-muted-foreground">Jadwal</dt>
                  <dd className="font-semibold">{u.waktuMulai || u.waktuSelesai ? `${formatTanggal(u.waktuMulai)} sampai ${formatTanggal(u.waktuSelesai)}` : 'Kapan saja'}</dd>
                  <dt className="text-muted-foreground">Sudah mengerjakan</dt><dd className="font-semibold">{u.jumlahPeserta} siswa{admin ? '' : ' sekolah ini'}</dd>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {u.wajibLayarPenuh && <Badge><ArrowsOut /> Layar penuh</Badge>}
                  {u.wajibKamera && <Badge><Camera /> Kamera</Badge>}
                  {u.wajibAplikasi && <Badge><Desktop /> Hanya aplikasi Windows</Badge>}
                  {u.intervalRekamLayar > 0 && <Badge><Monitor /> Rekam layar tiap {labelInterval(u.intervalRekamLayar)}</Badge>}
                  {u.batasPeringatan > 0 && <Badge>Peringatan di pelanggaran ke-{u.batasPeringatan}</Badge>}
                  {u.maksPelanggaran > 0 && <Badge>Dihentikan di pelanggaran ke-{u.maksPelanggaran}</Badge>}
                </div>
                {u.bolehUbah && kekurangan.length > 0 && (
                  <p className="mt-3 rounded-md bg-merah-muda px-3 py-2 text-sm font-semibold text-merah">
                    Soal kurang: {kekurangan.map(([k, n]) => `kelas ${k} hanya ${n}`).join(', ')}.
                  </p>
                )}
                <div className="mt-4 flex flex-1 flex-wrap items-end gap-2">
                  {u.bolehUbah && <Button size="sm" variant="outline" onClick={() => setForm(u)}><PencilSimple /> Ubah</Button>}
                  <Button size="sm" variant="outline" onClick={() => setAnalisis(u.id)}><ChartBar /> Analisis</Button>
                  {u.bolehUbah && <Button size="sm" variant="outline" onClick={() => token.mutate(u.id)}><ArrowsClockwise /> Token baru</Button>}
                  {u.bolehUbah && (
                    <Button size="sm" variant="ghost" className="ml-auto text-merah" aria-label={`Hapus ${u.nama}`} onClick={async () => {
                      if (await konfirmasi({ judul: `Hapus "${u.nama}"?`, pesan: 'Jadwal dihapus. Hasil ujian yang sudah masuk tetap tersimpan.', ya: 'Hapus', bahaya: true })) hapus.mutate(u.id);
                    }}><Trash /></Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <FormUjian admin={admin} ujian={form === 'baru' ? null : form} daftarMapel={q.data?.daftarMapel ?? []} aplikasiTersedia={!!q.data?.aplikasiTersedia} tutup={() => setForm(null)} />}
      <DialogAnalisis ujianId={analisis} tutup={() => setAnalisis(null)} />
      {dialog}
    </>
  );
}

function Saklar({ id, label, ket, checked, ubah, disabled }: { id: string; label: string; ket?: string; checked: boolean; ubah: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={ubah} disabled={disabled} className="mt-0.5" />
      <div><Label htmlFor={id}>{label}</Label>{ket && <p className="text-xs text-muted-foreground">{ket}</p>}</div>
    </div>
  );
}

function FormUjian({ admin, ujian, daftarMapel, aplikasiTersedia, tutup }: {
  admin: boolean; ujian: Ujian | null; daftarMapel: string[]; aplikasiTersedia: boolean; tutup: () => void;
}) {
  // Ujian internal sekolah selalu hanya untuk sekolah pemiliknya; tidak ada pilihan sekolah peserta.
  const ujianSekolah = !admin || !!ujian?.pemilikId;
  const qc = useQueryClient();
  const [galat, setGalat] = useState('');
  const [d, setD] = useState({
    nama: ujian?.nama ?? '',
    mataPelajaran: ujian?.mataPelajaran ?? daftarMapel[0] ?? '',
    kelas: ujian?.kelas.join(', ') ?? '6',
    sekolah: ujian?.sekolah ?? [],
    semuaSekolah: !ujian?.sekolah.length,
    durasiMenit: String(ujian?.durasiMenit ?? 60),
    jumlahSoal: String(ujian?.jumlahSoal ?? 0),
    waktuMulai: keInputWaktu(ujian?.waktuMulai),
    waktuSelesai: keInputWaktu(ujian?.waktuSelesai),
    token: ujian?.token ?? '',
    acakSoal: ujian?.acakSoal ?? true,
    acakOpsi: ujian?.acakOpsi ?? false,
    tampilkanNilai: ujian?.tampilkanNilai ?? true,
    tampilkanPembahasan: ujian?.tampilkanPembahasan ?? false,
    maksPercobaan: String(ujian?.maksPercobaan ?? 1),
    wajibLayarPenuh: ujian?.wajibLayarPenuh ?? true,
    wajibKamera: ujian?.wajibKamera ?? false,
    batasPeringatan: String(ujian?.batasPeringatan ?? 5),
    maksPelanggaran: String(ujian?.maksPelanggaran ?? 10),
    wajibAplikasi: ujian?.wajibAplikasi ?? false,
    intervalRekamLayar: String(ujian?.intervalRekamLayar ?? 0),
    aktif: ujian?.aktif ?? true,
  });
  const ubah = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const simpan = useMutation({
    mutationFn: () => {
      const { semuaSekolah, ...isi } = d;
      const body = { ...isi, sekolah: semuaSekolah ? [] : d.sekolah, waktuMulai: dariInputWaktu(d.waktuMulai), waktuSelesai: dariInputWaktu(d.waktuSelesai) };
      return ujian ? api.put<{ pesan: string }>(`/admin/ujian/${ujian.id}`, body) : api.post<{ pesan: string }>('/admin/ujian', body);
    },
    onSuccess: (r) => { toast.success(r.pesan); qc.invalidateQueries({ queryKey: ['ujian'] }); tutup(); },
    onError: (e) => setGalat(pesanGalat(e)),
  });

  return (
    <Dialog open onOpenChange={(b) => !b && tutup()}>
      <DialogContent lebar>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!ujianSekolah && !d.semuaSekolah && !d.sekolah.length) { setGalat('Pilih minimal satu sekolah peserta, atau nyalakan "Semua sekolah".'); return; }
            setGalat('');
            simpan.mutate();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader><DialogTitle>{ujian ? 'Ubah ujian' : 'Buat ujian'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="u-nama">Nama ujian</Label><Input id="u-nama" value={d.nama} onChange={(e) => ubah('nama', e.target.value)} placeholder="mis. Try Out 1 Matematika" required /></div>
              <div className="space-y-1.5">
                <Label htmlFor="u-mapel">Mata pelajaran</Label>
                <Input id="u-mapel" list="mapel-ujian" value={d.mataPelajaran} onChange={(e) => ubah('mataPelajaran', e.target.value)} required />
                <datalist id="mapel-ujian">{daftarMapel.map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <div className="space-y-1.5"><Label htmlFor="u-kelas">Kelas</Label><Input id="u-kelas" value={d.kelas} onChange={(e) => ubah('kelas', e.target.value)} /><p className="text-xs text-muted-foreground">Contoh: 6 atau 5, 6. Kosongkan untuk semua kelas.</p></div>
            </section>

            {ujianSekolah ? (
              <p className="rounded-md bg-biru-muda px-3 py-2 text-sm">
                Ujian internal {ujian?.namaPemilik ?? 'sekolah Anda'}: hanya untuk siswa sekolah ini dan memakai <b>bank soal sekolah</b>
                (mata pelajaran dan kelas harus sama dengan soal di bank soal sekolah).
              </p>
            ) : (
              <PilihSekolahPeserta semua={d.semuaSekolah} ubahSemua={(v) => ubah('semuaSekolah', v)} nilai={d.sekolah} ubah={(v) => ubah('sekolah', v)} />
            )}

            <section>
              <h3 className="text-base">Waktu & soal</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5"><Label htmlFor="u-durasi">Durasi (menit)</Label><Input id="u-durasi" type="number" min={0} value={d.durasiMenit} onChange={(e) => ubah('durasiMenit', e.target.value)} /><p className="text-xs text-muted-foreground">0 = tanpa batas</p></div>
                <div className="space-y-1.5"><Label htmlFor="u-jumlah">Jumlah soal</Label><Input id="u-jumlah" type="number" min={0} value={d.jumlahSoal} onChange={(e) => ubah('jumlahSoal', e.target.value)} /><p className="text-xs text-muted-foreground">0 = semua soal</p></div>
                <div className="space-y-1.5"><Label htmlFor="u-mulai">Dibuka mulai</Label><Input id="u-mulai" type="datetime-local" value={d.waktuMulai} onChange={(e) => ubah('waktuMulai', e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="u-selesai">Ditutup pada</Label><Input id="u-selesai" type="datetime-local" value={d.waktuSelesai} onChange={(e) => ubah('waktuSelesai', e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="u-token">Token</Label><Input id="u-token" value={d.token} onChange={(e) => ubah('token', e.target.value.toUpperCase())} placeholder="Kosong = tanpa token" className="tracking-widest uppercase" /></div>
                <div className="space-y-1.5"><Label htmlFor="u-coba">Maks. percobaan</Label><Input id="u-coba" type="number" min={0} value={d.maksPercobaan} onChange={(e) => ubah('maksPercobaan', e.target.value)} /><p className="text-xs text-muted-foreground">0 = tidak terbatas (latihan)</p></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Saklar id="u-acak" label="Acak urutan soal" checked={d.acakSoal} ubah={(v) => ubah('acakSoal', v)} />
                <Saklar id="u-acak-opsi" label="Acak urutan pilihan jawaban" ket="Menyulitkan saling melihat jawaban teman." checked={d.acakOpsi} ubah={(v) => ubah('acakOpsi', v)} />
              </div>
            </section>

            <section className="rounded-lg border border-garis bg-latar p-4">
              <h3 className="text-base">Pengawasan</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Saklar id="u-penuh" label="Wajib layar penuh" ket="Keluar layar penuh atau pindah aplikasi dicatat sebagai pelanggaran; soal tetap bisa dikerjakan." checked={d.wajibLayarPenuh} ubah={(v) => ubah('wajibLayarPenuh', v)} />
                <Saklar id="u-kamera" label="Deteksi wajah dengan kamera" ket="Mencatat bila wajah tidak terlihat atau ada lebih dari satu wajah, disertai foto bukti." checked={d.wajibKamera} ubah={(v) => ubah('wajibKamera', v)} />
                <Saklar
                  id="u-aplikasi" label="Wajib lewat aplikasi ujian Windows"
                  ket={aplikasiTersedia
                    ? 'Siswa tidak bisa mengerjakan dari browser biasa atau HP. Aplikasi mengunci layar dan memblokir tangkapan layar.'
                    : 'Belum bisa dipakai: isi KUNCI_APLIKASI di server lalu buat installer dengan kunci yang sama.'}
                  checked={d.wajibAplikasi} ubah={(v) => ubah('wajibAplikasi', v)} disabled={!aplikasiTersedia && !d.wajibAplikasi}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="u-rekam">Rekam layar</Label>
                  <Select value={d.intervalRekamLayar} onValueChange={(v) => ubah('intervalRekamLayar', v)}>
                    <SelectTrigger id="u-rekam" aria-label="Rekam layar"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PILIHAN_INTERVAL.map(([nilai, label]) => <SelectItem key={nilai} value={nilai}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Tangkapan layar berkala dan saat pelanggaran. Di browser siswa wajib membagikan seluruh layar,
                    sehingga ujian tidak bisa dikerjakan di HP/tablet.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-peringatan">Peringatan wajib dikonfirmasi pada pelanggaran ke-</Label>
                  <Input id="u-peringatan" type="number" min={0} value={d.batasPeringatan} onChange={(e) => ubah('batasPeringatan', e.target.value)} className="max-w-32" />
                  <p className="text-xs text-muted-foreground">Pelanggaran lain cukup berupa notifikasi; siswa tetap bisa mengerjakan. 0 = tanpa peringatan.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-maks-langgar">Ujian dihentikan pada pelanggaran ke-</Label>
                  <Input id="u-maks-langgar" type="number" min={0} value={d.maksPelanggaran} onChange={(e) => ubah('maksPelanggaran', e.target.value)} className="max-w-32" />
                  <p className="text-xs text-muted-foreground">Jawaban dikirim otomatis dan siswa tidak bisa melanjutkan. 0 = hanya dicatat.</p>
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <Saklar id="u-nilai" label="Tampilkan nilai ke siswa" checked={d.tampilkanNilai} ubah={(v) => ubah('tampilkanNilai', v)} />
              <Saklar id="u-bahas" label="Tampilkan kunci & pembahasan" ket="Cocok untuk latihan, jangan untuk ujian resmi." checked={d.tampilkanPembahasan} ubah={(v) => ubah('tampilkanPembahasan', v)} />
              <Saklar id="u-aktif" label="Aktif (terlihat oleh siswa)" checked={d.aktif} ubah={(v) => ubah('aktif', v)} />
            </section>
            {galat && <p role="alert" className="rounded-md bg-merah-muda px-3 py-2 text-sm font-semibold text-merah">{galat}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={tutup}>Batal</Button>
            <Button type="submit" disabled={simpan.isPending}>{simpan.isPending ? 'Menyimpan...' : ujian ? 'Simpan perubahan' : 'Buat ujian'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Sekolah peserta: kosong berarti semua sekolah (termasuk sekolah yang ditambahkan nanti). */
function PilihSekolahPeserta({ semua, ubahSemua, nilai, ubah }: { semua: boolean; ubahSemua: (v: boolean) => void; nilai: string[]; ubah: (v: string[]) => void }) {
  const q = useDaftarSekolah();
  const [cari, setCari] = useState('');
  const sebagian = !semua;
  const daftar = (q.data ?? []).filter((s) => !cari || s.nama.toLowerCase().includes(cari.toLowerCase()));
  const dipilih = new Set(nilai);
  return (
    <section>
      <h3 className="text-base">Sekolah peserta</h3>
      <div className="mt-3 flex items-start gap-3">
        <Switch id="u-semua-sekolah" checked={!sebagian} onCheckedChange={ubahSemua} className="mt-0.5" />
        <div>
          <Label htmlFor="u-semua-sekolah">Semua sekolah</Label>
          <p className="text-xs text-muted-foreground">Termasuk sekolah yang ditambahkan kemudian. Matikan untuk memilih sekolah tertentu.</p>
        </div>
      </div>
      {sebagian && (
        <div className="mt-3 rounded-lg border border-garis p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="search" className="max-w-xs" placeholder="Cari sekolah..." aria-label="Cari sekolah peserta" value={cari} onChange={(e) => setCari(e.target.value)} />
            <span className="text-sm font-semibold">{nilai.length} dipilih</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => ubah([...new Set([...nilai, ...daftar.map((s) => s.id)])])}>Pilih semua yang tampil</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => ubah([])}>Kosongkan</Button>
          </div>
          <ul className="mt-3 grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {daftar.map((s) => (
              <li key={s.id}>
                <Label className="flex items-center gap-2 rounded-md px-2 py-1.5 font-normal hover:bg-muted">
                  <Checkbox
                    checked={dipilih.has(s.id)}
                    onCheckedChange={(v) => ubah(v ? [...nilai, s.id] : nilai.filter((x) => x !== s.id))}
                  />
                  {s.nama}{!s.aktif && <span className="text-xs text-muted-foreground">(nonaktif)</span>}
                </Label>
              </li>
            ))}
          </ul>
          {!nilai.length && <p className="mt-2 text-sm font-semibold text-merah">Pilih minimal satu sekolah, atau nyalakan "Semua sekolah".</p>}
        </div>
      )}
    </section>
  );
}
