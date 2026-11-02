-- Soal & ujian internal sekolah, username siswa unik per sekolah, penguncian login di database.
-- DropIndex
DROP INDEX "Siswa_username_key";

-- AlterTable
ALTER TABLE "Soal" ADD COLUMN     "sekolahId" TEXT;

-- AlterTable
ALTER TABLE "Ujian" ADD COLUMN     "pemilikId" TEXT;

-- CreateTable
CREATE TABLE "GagalLogin" (
    "kunci" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "sampai" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GagalLogin_pkey" PRIMARY KEY ("kunci")
);

-- CreateIndex
CREATE INDEX "GagalLogin_sampai_idx" ON "GagalLogin"("sampai");

-- CreateIndex
CREATE INDEX "Siswa_username_idx" ON "Siswa"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Siswa_sekolahId_username_key" ON "Siswa"("sekolahId", "username");

-- CreateIndex
CREATE INDEX "Soal_sekolahId_mataPelajaran_kelas_idx" ON "Soal"("sekolahId", "mataPelajaran", "kelas");

-- AddForeignKey
ALTER TABLE "Soal" ADD CONSTRAINT "Soal_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ujian" ADD CONSTRAINT "Ujian_pemilikId_fkey" FOREIGN KEY ("pemilikId") REFERENCES "Sekolah"("id") ON DELETE CASCADE ON UPDATE CASCADE;

