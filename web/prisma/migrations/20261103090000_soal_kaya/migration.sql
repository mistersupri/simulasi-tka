-- Soal isian/kode, gambar pada pilihan jawaban, dan bahasa/aksara soal.
-- AlterEnum
ALTER TYPE "TipeSoal" ADD VALUE 'ISIAN';

-- AlterTable
ALTER TABLE "Soal" ADD COLUMN     "bahasa" TEXT NOT NULL DEFAULT 'id',
ADD COLUMN     "kode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opsiGambar" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pekaHuruf" BOOLEAN NOT NULL DEFAULT false;

