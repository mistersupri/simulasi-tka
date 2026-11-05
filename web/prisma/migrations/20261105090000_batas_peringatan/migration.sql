-- Pelanggaran tidak lagi menghentikan pengerjaan: cukup notifikasi, peringatan wajib dikonfirmasi pada
-- pelanggaran ke-batasPeringatan, dan ujian dihentikan pada pelanggaran ke-maksPelanggaran.
ALTER TABLE "Ujian" ADD COLUMN "batasPeringatan" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Ujian" ALTER COLUMN "maksPelanggaran" SET DEFAULT 10;
-- Ujian yang masih memakai batas bawaan lama (5) mengikuti aturan baru: peringatan di 5, berhenti di 10.
UPDATE "Ujian" SET "maksPelanggaran" = 10 WHERE "maksPelanggaran" = 5;
