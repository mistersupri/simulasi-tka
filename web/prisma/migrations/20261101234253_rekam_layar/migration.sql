-- CreateEnum
CREATE TYPE "PemicuTangkapan" AS ENUM ('BERKALA', 'PELANGGARAN');

-- AlterEnum
ALTER TYPE "JenisPelanggaran" ADD VALUE 'LAYAR_TIDAK_DIBAGIKAN';

-- AlterTable
ALTER TABLE "Ujian" ADD COLUMN     "intervalRekamLayar" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TangkapanLayar" (
    "id" TEXT NOT NULL,
    "sesiUjianId" TEXT NOT NULL,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "berkas" TEXT NOT NULL,
    "pemicu" "PemicuTangkapan" NOT NULL DEFAULT 'BERKALA',
    "keterangan" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TangkapanLayar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TangkapanLayar_sesiUjianId_waktu_idx" ON "TangkapanLayar"("sesiUjianId", "waktu");

-- CreateIndex
CREATE INDEX "TangkapanLayar_waktu_idx" ON "TangkapanLayar"("waktu");

-- AddForeignKey
ALTER TABLE "TangkapanLayar" ADD CONSTRAINT "TangkapanLayar_sesiUjianId_fkey" FOREIGN KEY ("sesiUjianId") REFERENCES "SesiUjian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
