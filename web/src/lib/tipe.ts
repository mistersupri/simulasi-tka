// Bentuk data dari API (lihat server/routes).

export type ProfilSiswa = { jenis: 'siswa'; nama: string; kelas: string; username: string; nisn: string; namaSekolah: string; bolehGantiPassword: boolean };
/** ADMIN = instansi (Sudin), OPERATOR & GURU = sekolah. */
export type Peran = 'ADMIN' | 'OPERATOR' | 'GURU';
export const LABEL_PERAN: Record<Peran, string> = { ADMIN: 'Admin instansi', OPERATOR: 'Operator sekolah', GURU: 'Guru' };
export type ProfilStaf = { jenis: 'staf'; id: string; nama: string; username: string; peran: Peran; sekolahId: string | null; namaSekolah: string | null; bolehBuatSoal: boolean };
export type SekolahPilihan = { id: string; nama: string; npsn: string | null; aktif: boolean; bolehBuatSoal: boolean };
export type Sekolah = SekolahPilihan & {
  alamat: string; dibuat: string; jumlahSiswa: number; jumlahOperator: number; jumlahGuru: number; jumlahHasil: number; rataRata: number | null;
};
export type Info = { namaInstansi: string; tahunAjaran: string; pengumuman: string; adaLogo: boolean };

export type StatusUjian = 'TERSEDIA' | 'BERLANGSUNG' | 'SELESAI' | 'BELUM_DIBUKA' | 'DITUTUP';
export type UjianSiswa = {
  id: string; nama: string; mataPelajaran: string; durasiMenit: number; jumlahSoal: number;
  waktuMulai: string | null; waktuSelesai: string | null; perluToken: boolean; wajibLayarPenuh: boolean;
  wajibKamera: boolean; wajibAplikasi: boolean; rekamLayar: boolean; maksPercobaan: number; jumlahSelesai: number; sesiId: string | null; status: StatusUjian;
};
export type Riwayat = { id: string; namaUjian: string; mataPelajaran: string; tanggal: string; nilai: number | null; tuntas: boolean | null; adaPembahasan: boolean };

export type TipeSoal = 'PG' | 'PGK' | 'ISIAN';
export type SoalTampil = {
  id: string; tipe: TipeSoal; bahasa: string; kode: boolean; pertanyaan: string; gambar: string | null; opsi: string[]; opsiGambar: string[];
};
export type PaketUjian = {
  sesiId: string;
  ujian: { id: string; nama: string; mataPelajaran: string; wajibLayarPenuh: boolean; wajibKamera: boolean; maksPelanggaran: number; intervalRekamLayar: number };
  soal: SoalTampil[];
  jawaban: Record<string, string>;
  ragu: string[];
  sisaDetik: number | null;
  jumlahPelanggaran: number;
};

export type ItemPembahasan = {
  nomor: number; id: string; tipe: TipeSoal; bahasa: string; kode: boolean; pertanyaan: string; gambar: string | null; opsi: string[]; opsiGambar: string[];
  jawaban: string; kunci: string; benar: boolean; pembahasan: string;
};
export type StatusHasil = 'SELESAI' | 'WAKTU_HABIS' | 'DIHENTIKAN' | 'PELANGGARAN';
export type HasilSiswa = {
  id: string; namaUjian: string; mataPelajaran: string; tampilkanNilai: boolean; nilai: number | null; jumlahSoal: number;
  benar: number | null; salah: number | null; kosong: number; durasiDetik: number; status: StatusHasil;
  jumlahPelanggaran: number; kkm: number; tuntas: boolean | null; pembahasan: ItemPembahasan[] | null;
};

export type JenisPelanggaran =
  | 'KELUAR_LAYAR_PENUH' | 'PINDAH_TAB' | 'WAJAH_TIDAK_TERLIHAT' | 'WAJAH_LEBIH_DARI_SATU'
  | 'KAMERA_TIDAK_AKTIF' | 'SALIN_TEMPEL' | 'PINTASAN_TERLARANG' | 'LAYAR_TIDAK_DIBAGIKAN';

export const LABEL_PELANGGARAN: Record<JenisPelanggaran, string> = {
  KELUAR_LAYAR_PENUH: 'Keluar dari layar penuh',
  PINDAH_TAB: 'Pindah tab / aplikasi',
  WAJAH_TIDAK_TERLIHAT: 'Wajah tidak terlihat',
  WAJAH_LEBIH_DARI_SATU: 'Lebih dari satu wajah',
  KAMERA_TIDAK_AKTIF: 'Kamera tidak aktif',
  SALIN_TEMPEL: 'Mencoba menyalin / menempel',
  PINTASAN_TERLARANG: 'Menekan tombol pintasan terlarang',
  LAYAR_TIDAK_DIBAGIKAN: 'Berhenti membagikan layar',
};

export type Soal = {
  id: string; mataPelajaran: string; kelas: string; pertanyaan: string; opsi: string[]; opsiGambar: string[]; kunci: string; skor: number;
  tipe: TipeSoal; bahasa: string; pekaHuruf: boolean; kode: boolean; gambar: string | null; pembahasan: string; aktif: boolean;
};
export type Ujian = {
  id: string; nama: string; mataPelajaran: string; kelas: string[]; durasiMenit: number; jumlahSoal: number;
  waktuMulai: string | null; waktuSelesai: string | null; token: string | null; acakSoal: boolean; acakOpsi: boolean;
  tampilkanNilai: boolean; tampilkanPembahasan: boolean; maksPercobaan: number; wajibLayarPenuh: boolean;
  wajibKamera: boolean; maksPelanggaran: number; wajibAplikasi: boolean; intervalRekamLayar: number; aktif: boolean; sekolah: string[];
  pemilikId: string | null; namaPemilik: string | null; bolehUbah: boolean; soalPerKelas: Record<string, number>; jumlahPeserta: number;
};
export type Siswa = {
  id: string; nisn: string; nama: string; kelas: string; username: string; aktif: boolean; loginTerakhir: string | null; sekolahId: string; namaSekolah: string;
};
export type Pengguna = {
  id: string; nama: string; username: string; peran: Peran; aktif: boolean; loginTerakhir: string | null; sekolahId: string | null; namaSekolah: string | null;
};
export type Hasil = {
  id: string; ujianId: string | null; namaUjian: string; mataPelajaran: string; sekolahId: string | null; namaSekolah: string; nisn: string; namaSiswa: string; kelas: string;
  username: string; tanggal: string; nilai: number; benar: number; salah: number; kosong: number; durasiDetik: number;
  status: StatusHasil; jumlahPelanggaran: number;
};
export type Pelanggaran = { id: string; jenis: JenisPelanggaran; waktu: string; foto: string | null; detail: string };
export type TangkapanLayar = { id: string; waktu: string; berkas: string; pemicu: 'BERKALA' | 'PELANGGARAN'; keterangan: string };
export type Akun = { nama: string; kelas: string; username: string; password: string; sekolah?: string };
