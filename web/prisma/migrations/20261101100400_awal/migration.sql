-- CreateEnum
CREATE TYPE "Peran" AS ENUM ('ADMIN', 'GURU');

-- CreateEnum
CREATE TYPE "JenisSesiLogin" AS ENUM ('SISWA', 'STAF');

-- CreateEnum
CREATE TYPE "TipeSoal" AS ENUM ('PG', 'PGK');

-- CreateEnum
CREATE TYPE "StatusSesiUjian" AS ENUM ('BERLANGSUNG', 'SELESAI');

-- CreateEnum
CREATE TYPE "StatusHasil" AS ENUM ('SELESAI', 'WAKTU_HABIS', 'DIHENTIKAN', 'PELANGGARAN');

-- CreateEnum
CREATE TYPE "JenisPelanggaran" AS ENUM ('KELUAR_LAYAR_PENUH', 'PINDAH_TAB', 'WAJAH_TIDAK_TERLIHAT', 'WAJAH_LEBIH_DARI_SATU', 'KAMERA_TIDAK_AKTIF', 'SALIN_TEMPEL', 'PINTASAN_TERLARANG');

-- CreateTable
CREATE TABLE "Pengaturan" (
    "kunci" TEXT NOT NULL,
    "nilai" TEXT NOT NULL,

    CONSTRAINT "Pengaturan_pkey" PRIMARY KEY ("kunci")
);

-- CreateTable
CREATE TABLE "Pengguna" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "peran" "Peran" NOT NULL DEFAULT 'GURU',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "loginTerakhir" TIMESTAMP(3),
    "dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pengguna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Siswa" (
    "id" TEXT NOT NULL,
    "nisn" TEXT NOT NULL DEFAULT '',
    "nama" TEXT NOT NULL,
    "kelas" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "loginTerakhir" TIMESTAMP(3),
    "dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Siswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiLogin" (
    "token" TEXT NOT NULL,
    "jenis" "JenisSesiLogin" NOT NULL,
    "penggunaId" TEXT,
    "siswaId" TEXT,
    "kadaluarsa" TIMESTAMP(3) NOT NULL,
    "dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesiLogin_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Soal" (
    "id" TEXT NOT NULL,
    "mataPelajaran" TEXT NOT NULL,
    "kelas" TEXT NOT NULL,
    "pertanyaan" TEXT NOT NULL,
    "opsi" TEXT[],
    "kunci" TEXT NOT NULL,
    "skor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "tipe" "TipeSoal" NOT NULL DEFAULT 'PG',
    "gambar" TEXT,
    "pembahasan" TEXT NOT NULL DEFAULT '',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diubah" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Soal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ujian" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "mataPelajaran" TEXT NOT NULL,
    "kelas" TEXT[],
    "durasiMenit" INTEGER NOT NULL DEFAULT 60,
    "jumlahSoal" INTEGER NOT NULL DEFAULT 0,
    "waktuMulai" TIMESTAMP(3),
    "waktuSelesai" TIMESTAMP(3),
    "token" TEXT,
    "acakSoal" BOOLEAN NOT NULL DEFAULT true,
    "acakOpsi" BOOLEAN NOT NULL DEFAULT false,
    "tampilkanNilai" BOOLEAN NOT NULL DEFAULT true,
    "tampilkanPembahasan" BOOLEAN NOT NULL DEFAULT false,
    "maksPercobaan" INTEGER NOT NULL DEFAULT 1,
    "wajibLayarPenuh" BOOLEAN NOT NULL DEFAULT true,
    "wajibKamera" BOOLEAN NOT NULL DEFAULT false,
    "maksPelanggaran" INTEGER NOT NULL DEFAULT 5,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ujian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiUjian" (
    "id" TEXT NOT NULL,
    "ujianId" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "mulai" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batasWaktu" TIMESTAMP(3),
    "urutan" JSONB NOT NULL,
    "jawaban" JSONB NOT NULL DEFAULT '{}',
    "ragu" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "StatusSesiUjian" NOT NULL DEFAULT 'BERLANGSUNG',
    "terakhirAktif" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jumlahPelanggaran" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SesiUjian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pelanggaran" (
    "id" TEXT NOT NULL,
    "sesiUjianId" TEXT NOT NULL,
    "jenis" "JenisPelanggaran" NOT NULL,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foto" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Pelanggaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hasil" (
    "id" TEXT NOT NULL,
    "sesiUjianId" TEXT,
    "ujianId" TEXT,
    "namaUjian" TEXT NOT NULL,
    "mataPelajaran" TEXT NOT NULL,
    "siswaId" TEXT,
    "nisn" TEXT NOT NULL,
    "namaSiswa" TEXT NOT NULL,
    "kelas" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nilai" INTEGER NOT NULL,
    "benar" INTEGER NOT NULL,
    "salah" INTEGER NOT NULL,
    "kosong" INTEGER NOT NULL,
    "durasiDetik" INTEGER NOT NULL,
    "status" "StatusHasil" NOT NULL,
    "jawaban" JSONB NOT NULL DEFAULT '{}',
    "jumlahPelanggaran" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Hasil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAktivitas" (
    "id" TEXT NOT NULL,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pengguna" TEXT NOT NULL,
    "peran" TEXT NOT NULL,
    "aksi" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "LogAktivitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pengguna_username_key" ON "Pengguna"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Siswa_username_key" ON "Siswa"("username");

-- CreateIndex
CREATE INDEX "Siswa_kelas_idx" ON "Siswa"("kelas");

-- CreateIndex
CREATE INDEX "SesiLogin_kadaluarsa_idx" ON "SesiLogin"("kadaluarsa");

-- CreateIndex
CREATE INDEX "Soal_mataPelajaran_kelas_idx" ON "Soal"("mataPelajaran", "kelas");

-- CreateIndex
CREATE INDEX "SesiUjian_siswaId_status_idx" ON "SesiUjian"("siswaId", "status");

-- CreateIndex
CREATE INDEX "SesiUjian_status_idx" ON "SesiUjian"("status");

-- CreateIndex
CREATE INDEX "Pelanggaran_sesiUjianId_idx" ON "Pelanggaran"("sesiUjianId");

-- CreateIndex
CREATE UNIQUE INDEX "Hasil_sesiUjianId_key" ON "Hasil"("sesiUjianId");

-- CreateIndex
CREATE INDEX "Hasil_ujianId_idx" ON "Hasil"("ujianId");

-- CreateIndex
CREATE INDEX "Hasil_siswaId_idx" ON "Hasil"("siswaId");

-- CreateIndex
CREATE INDEX "LogAktivitas_waktu_idx" ON "LogAktivitas"("waktu");

-- AddForeignKey
ALTER TABLE "SesiLogin" ADD CONSTRAINT "SesiLogin_penggunaId_fkey" FOREIGN KEY ("penggunaId") REFERENCES "Pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiLogin" ADD CONSTRAINT "SesiLogin_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiUjian" ADD CONSTRAINT "SesiUjian_ujianId_fkey" FOREIGN KEY ("ujianId") REFERENCES "Ujian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiUjian" ADD CONSTRAINT "SesiUjian_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pelanggaran" ADD CONSTRAINT "Pelanggaran_sesiUjianId_fkey" FOREIGN KEY ("sesiUjianId") REFERENCES "SesiUjian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hasil" ADD CONSTRAINT "Hasil_sesiUjianId_fkey" FOREIGN KEY ("sesiUjianId") REFERENCES "SesiUjian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hasil" ADD CONSTRAINT "Hasil_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
