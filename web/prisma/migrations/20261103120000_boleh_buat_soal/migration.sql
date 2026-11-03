-- Admin instansi menentukan sekolah mana yang boleh membuat bank soal sendiri. Sekolah lama tetap boleh.
ALTER TABLE "Sekolah" ADD COLUMN "bolehBuatSoal" BOOLEAN NOT NULL DEFAULT true;
