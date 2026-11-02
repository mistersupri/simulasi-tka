-- Manajemen sekolah: admin = instansi (Sudin), operator & guru terikat ke satu sekolah.
-- Data lama (satu sekolah) dipindahkan ke sekolah pertama yang namanya diambil dari
-- pengaturan NAMA_SEKOLAH. Siswa, guru, dan hasil lama otomatis menjadi milik sekolah itu.
-- AlterEnum
ALTER TYPE "Peran" ADD VALUE 'OPERATOR';

-- AlterTable
ALTER TABLE "Hasil" ADD COLUMN     "namaSekolah" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sekolahId" TEXT;

-- AlterTable
ALTER TABLE "LogAktivitas" ADD COLUMN     "sekolahId" TEXT;

-- AlterTable
ALTER TABLE "Pengguna" ADD COLUMN     "sekolahId" TEXT;

-- AlterTable (diisi dulu, baru dijadikan NOT NULL setelah data lama dipindahkan)
ALTER TABLE "Siswa" ADD COLUMN     "sekolahId" TEXT;

-- AlterTable
ALTER TABLE "Ujian" ADD COLUMN     "sekolah" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Sekolah" (
    "id" TEXT NOT NULL,
    "npsn" TEXT,
    "nama" TEXT NOT NULL,
    "alamat" TEXT NOT NULL DEFAULT '',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "dibuat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sekolah_pkey" PRIMARY KEY ("id")
);

-- Pindahkan data lama ke sekolah pertama
INSERT INTO "Sekolah" ("id", "nama")
SELECT 'sekolah_awal', COALESCE((SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = 'NAMA_SEKOLAH'), 'SDN Johar Baru 01 Pagi')
WHERE EXISTS (SELECT 1 FROM "Siswa")
   OR EXISTS (SELECT 1 FROM "Hasil")
   OR EXISTS (SELECT 1 FROM "Pengguna" WHERE "peran" = 'GURU');

UPDATE "Siswa" SET "sekolahId" = 'sekolah_awal';
UPDATE "Pengguna" SET "sekolahId" = 'sekolah_awal' WHERE "peran" = 'GURU';
UPDATE "Hasil" SET "sekolahId" = 'sekolah_awal', "namaSekolah" = (SELECT "nama" FROM "Sekolah" WHERE "id" = 'sekolah_awal')
WHERE EXISTS (SELECT 1 FROM "Sekolah" WHERE "id" = 'sekolah_awal');

ALTER TABLE "Siswa" ALTER COLUMN "sekolahId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sekolah_npsn_key" ON "Sekolah"("npsn");

-- CreateIndex
CREATE INDEX "Hasil_sekolahId_idx" ON "Hasil"("sekolahId");

-- CreateIndex
CREATE INDEX "LogAktivitas_sekolahId_waktu_idx" ON "LogAktivitas"("sekolahId", "waktu");

-- CreateIndex
CREATE INDEX "Pengguna_sekolahId_idx" ON "Pengguna"("sekolahId");

-- CreateIndex
CREATE INDEX "Siswa_sekolahId_kelas_idx" ON "Siswa"("sekolahId", "kelas");

-- AddForeignKey
ALTER TABLE "Pengguna" ADD CONSTRAINT "Pengguna_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siswa" ADD CONSTRAINT "Siswa_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hasil" ADD CONSTRAINT "Hasil_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;
