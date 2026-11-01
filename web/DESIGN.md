# DESIGN.md: Simulasi TKA

## Arah dari pemilik
- Suasana: **formal, seperti aplikasi ujian resmi (ANBK)**. Menggantikan arah sebelumnya
  ("ceria, ramah anak SD"), yang menurut pemilik terlalu kekanakan.
- Logo: **nama sekolah sebagai teks**; logo gambar bisa diunggah lewat Pengaturan.

## Usulan turunan (dibuat agen, silakan ganti)
**Design Read:** aplikasi ujian sekolah untuk siswa kelas 6 dan guru, bergaya
aplikasi ujian negara: tenang, padat informasi, tanpa hiasan.
Dial: **ENERGY 1 / RHYTHM 1 / MOTION 1**. Keseragaman antarhalaman disengaja:
siswa harus langsung mengenali tata letak yang sama di setiap ujian.

### Palet (2 inti + 1 aksen, ditambah netral)
| Token | Warna | Alasan |
|---|---|---|
| Tinta (netral) | `#1A2433` | Teks utama, kontras 14:1 di latar |
| Latar (netral) | `#F3F5F8` | Abu kebiruan sangat muda; memisahkan kartu putih tanpa bayangan |
| Garis (netral) | `#D5DCE5` | Garis tepi 1px untuk kartu, tabel, input |
| Biru (inti) | `#1E3A6E` | Bilah kepala, aksi utama, soal aktif; biru tua lazim untuk aplikasi resmi |
| Hijau (inti) | `#1F6B3B` | Status "sudah dijawab", benar, tuntas |
| Kuning (aksen) | `#F2B705` | Satu aksen: penanda ragu-ragu (konvensi ANBK), selalu berteks tinta |
| Merah (fungsi) | `#B42318` | Hanya galat, pelanggaran, aksi berbahaya |

### Huruf
**Source Sans 3** (variabel, dibundel tanpa CDN): huruf humanis netral yang lazim untuk
dokumen institusi, tetap sangat terbaca di layar kecil, dan mendukung bahasa Indonesia.
Judul berat 600 sampai 700, isi 400. Tanpa huruf membulat, tanpa label kapital berspasi lebar.

### Motif identitas: bilah kepala resmi
Setiap halaman diawali **bilah biru tua berisi nama sekolah**, seperti kop surat institusi.
Di bawahnya konten di atas kartu putih bergaris tepi 1px. Tidak ada bayangan kecuali dialog
(penanda elevasi: dialog menutupi halaman).

### Bentuk & ruang
- Radius kecil dan konsisten: 4px untuk tombol, input, kartu; 6px untuk dialog.
- Spasi kelipatan 4px; antarbagian 32px, di dalam kartu 16 sampai 24px.

### Gerak (MOTION 1)
Hanya perubahan warna pada hover/pilihan dan kedipan timer saat sisa 5 menit.

### Ikon
**Phosphor berat "regular"**: garis tipis netral, hanya bila menambah makna
(jam = waktu, kamera = pengawasan wajah).

### Bahasa
Teks untuk siswa memakai sapaan **"Anda"** dan kalimat lengkap, seperti petunjuk ujian resmi.

### Tema
**Terang tetap, tanpa mode gelap.** Dipakai siang hari di kelas, sering diproyeksikan,
dan kartu login dicetak.
