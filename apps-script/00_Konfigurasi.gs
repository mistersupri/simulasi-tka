/**
 * Simulasi TKA — konfigurasi dan skema database.
 *
 * Database  : Google Spreadsheet (satu lembar = satu tabel, baris 1 = header).
 * Penyimpanan file : Google Drive (gambar soal, logo, backup, hasil ekspor).
 *
 * Catatan: file .gs di Apps Script berbagi satu ruang global. Bagian atas
 * file hanya berisi nilai tetap (tanpa memanggil fungsi file lain) agar
 * urutan file tidak berpengaruh.
 */

const KONFIGURASI = {
  // ID Google Spreadsheet database. Kosongkan ('') jika script dibuat dari
  // menu Ekstensi > Apps Script di spreadsheet database itu sendiri.
  SPREADSHEET_ID: '18tugdIyOXBAnOmYoHaT0WxSsYW4BW54Phg5i0w0GmS8',

  // Jangan diubah setelah ada akun: hash lama tidak akan cocok lagi.
  ITERASI_HASH: 10000,

  // Lama sesi login (maksimum CacheService: 6 jam).
  DURASI_SESI_DETIK: 6 * 60 * 60,

  // Jawaban masih diterima sekian detik setelah waktu habis (jeda jaringan).
  TOLERANSI_WAKTU_DETIK: 120,

  // Akun dikunci sementara setelah sekian kali salah password.
  MAKS_GAGAL_LOGIN: 5,
  LAMA_KUNCI_LOGIN_DETIK: 5 * 60,

  PANJANG_PASSWORD_MIN: 6,
  UKURAN_GAMBAR_MAKS_BYTE: 5 * 1024 * 1024,

  NAMA_FOLDER_DRIVE: 'Simulasi TKA'
};

const PENGATURAN_BAWAAN = {
  NAMA_SEKOLAH: 'SDN Johar Baru 01 Pagi',
  TAHUN_AJARAN: '2026/2027',
  PENGUMUMAN: '',
  KKM: '70',
  LOGO_ID: '',
  SISWA_BOLEH_GANTI_PASSWORD: 'YA',
  FOLDER_ID: '',
  FOLDER_GAMBAR_ID: '',
  FOLDER_BACKUP_ID: '',
  FOLDER_EKSPOR_ID: ''
};

// Kunci pengaturan yang boleh diubah lewat halaman admin.
const PENGATURAN_DAPAT_DIUBAH = ['NAMA_SEKOLAH', 'TAHUN_AJARAN', 'PENGUMUMAN', 'KKM', 'SISWA_BOLEH_GANTI_PASSWORD'];

const PERAN = { ADMIN: 'ADMIN', GURU: 'GURU' };
const HURUF_OPSI = ['A', 'B', 'C', 'D'];
const TIPE_SOAL = { PG: 'PG', PGK: 'PGK' }; // PG = pilihan ganda, PGK = pilihan ganda kompleks

/**
 * Skema tabel. Nama lembar = kunci objek.
 *   kolom   : header wajib, urutan untuk lembar baru (kolom lain boleh ada)
 *   kunci   : kolom ID unik
 *   tanggal : kolom berisi tanggal/waktu (dibaca sebagai milidetik epoch)
 *   angka   : kolom bilangan bulat
 *   kolom lain diperlakukan sebagai teks biasa (format "@") agar nilai
 *   seperti "3/4" tidak berubah menjadi tanggal.
 *
 * Tiga lembar pertama sesuai database lama; kolom baru ditambahkan di
 * sebelah kanan oleh setupAplikasi().
 */
const SKEMA = {
  DATA_SISWA: {
    kolom: ['NISN', 'NAMA_SISWA', 'KELAS', 'USERNAME', 'PASSWORD_HASH', 'STATUS', 'PASSWORD_SALT', 'LOGIN_TERAKHIR'],
    kunci: 'USERNAME',
    tanggal: ['LOGIN_TERAKHIR'],
    angka: []
  },
  BANK_SOAL: {
    kolom: ['ID_SOAL', 'MATA_PELAJARAN', 'KELAS', 'PERTANYAAN', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D',
      'KUNCI_JAWABAN', 'SKOR', 'TIPE_SOAL', 'GAMBAR_ID', 'PEMBAHASAN', 'STATUS', 'DIBUAT'],
    kunci: 'ID_SOAL',
    tanggal: ['DIBUAT'],
    angka: []
  },
  HASIL_UJIAN: {
    kolom: ['ID_HASIL', 'NISN', 'NAMA_SISWA', 'TANGGAL_UJIAN', 'NILAI', 'JUMLAH_BENAR', 'JUMLAH_SALAH',
      'DURASI_DETIK', 'STATUS_UJIAN', 'MATA_PELAJARAN', 'KELAS', 'ID_UJIAN', 'NAMA_UJIAN', 'USERNAME',
      'JUMLAH_KOSONG', 'JAWABAN', 'ID_SESI'],
    kunci: 'ID_HASIL',
    tanggal: ['TANGGAL_UJIAN'],
    angka: ['NILAI', 'JUMLAH_BENAR', 'JUMLAH_SALAH', 'DURASI_DETIK', 'JUMLAH_KOSONG']
  },
  UJIAN: {
    kolom: ['ID_UJIAN', 'NAMA_UJIAN', 'MATA_PELAJARAN', 'KELAS', 'DURASI_MENIT', 'JUMLAH_SOAL',
      'WAKTU_MULAI', 'WAKTU_SELESAI', 'TOKEN', 'ACAK_SOAL', 'ACAK_OPSI', 'TAMPILKAN_NILAI',
      'TAMPILKAN_PEMBAHASAN', 'MAKS_PERCOBAAN', 'STATUS', 'DIBUAT'],
    kunci: 'ID_UJIAN',
    tanggal: ['WAKTU_MULAI', 'WAKTU_SELESAI', 'DIBUAT'],
    angka: ['DURASI_MENIT', 'JUMLAH_SOAL', 'MAKS_PERCOBAAN']
  },
  SESI_UJIAN: {
    kolom: ['ID_SESI', 'ID_UJIAN', 'USERNAME', 'NISN', 'NAMA_SISWA', 'KELAS', 'WAKTU_MULAI', 'BATAS_WAKTU',
      'URUTAN', 'JAWABAN', 'RAGU', 'STATUS', 'TERAKHIR_AKTIF'],
    kunci: 'ID_SESI',
    tanggal: ['WAKTU_MULAI', 'BATAS_WAKTU', 'TERAKHIR_AKTIF'],
    angka: []
  },
  PENGGUNA: {
    kolom: ['ID_PENGGUNA', 'NAMA', 'USERNAME', 'PASSWORD_HASH', 'PASSWORD_SALT', 'PERAN', 'STATUS', 'LOGIN_TERAKHIR'],
    kunci: 'ID_PENGGUNA',
    tanggal: ['LOGIN_TERAKHIR'],
    angka: []
  },
  PENGATURAN: {
    kolom: ['KUNCI', 'NILAI'],
    kunci: 'KUNCI',
    tanggal: [],
    angka: []
  },
  LOG_AKTIVITAS: {
    kolom: ['WAKTU', 'PENGGUNA', 'PERAN', 'AKSI', 'DETAIL'],
    kunci: 'WAKTU',
    tanggal: ['WAKTU'],
    angka: []
  }
};
