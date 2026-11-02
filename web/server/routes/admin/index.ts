import { Router } from 'express';
import { rutAdminPengguna } from './pengguna.ts';
import { rutAdminSekolah } from './sekolah.ts';
import { rutAdminSiswa } from './siswa.ts';
import { rutAdminSistem } from './sistem.ts';
import { rutAdminSoal } from './soal.ts';
import { rutAdminUjian } from './ujian.ts';

export const rutAdmin = Router();
rutAdmin.use('/sekolah', rutAdminSekolah);
rutAdmin.use('/siswa', rutAdminSiswa);
rutAdmin.use('/pengguna', rutAdminPengguna);
rutAdmin.use('/soal', rutAdminSoal);
rutAdmin.use(rutAdminUjian);
rutAdmin.use(rutAdminSistem);
