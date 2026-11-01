# DESIGN.md: Simulasi TKA

## Arah dari pemilik
- Suasana: **ceria, ramah anak SD** (dipilih pemilik produk).
- Logo: **nama sekolah sebagai teks**; logo gambar bisa diunggah belakangan lewat Pengaturan.

## Usulan turunan (dibuat agen, silakan ganti)
Bagian di bawah ini adalah terjemahan agen dari arahan "ceria, ramah anak SD".
Bukan keputusan pemilik; ubah bebas.

**Design Read:** aplikasi ujian sekolah untuk siswa kelas 6 SD (11 sampai 12 tahun) dan guru,
bergaya *buku kerja bersticker*: hangat seperti kertas, tegas seperti spidol.
Dial: **ENERGY 2 / RHYTHM 2 / MOTION 1**.
Layar ujian sengaja turun ke ENERGY 1: anak harus fokus pada soal, bukan pada hiasan.

### Palet (2 inti + 1 aksen, ditambah netral)
| Token | Warna | Alasan |
|---|---|---|
| Tinta (netral) | `#1E2A3B` | Teks & garis tepi "stiker"; biru tua lebih lembut dari hitam pekat untuk anak |
| Kertas (netral) | `#FFF8EC` | Latar hangat seperti buku tulis; mengurangi silau layar putih di kelas |
| Jeruk (inti) | `#C2410C` | Aksi utama; oranye tua agar teks putih di atasnya tetap kontras (5.2:1) |
| Daun (inti) | `#237032` | Tanda "sudah dijawab", "benar", "tuntas"; hijau dibaca anak sebagai berhasil |
| Matahari (aksen) | `#FFD43B` | Satu aksen: tanda ragu-ragu & sorotan penting (selalu berteks tinta) |
| Merah bata (fungsi) | `#B42318` | Hanya untuk kesalahan, pelanggaran, dan aksi berbahaya |

### Huruf
**Nunito** (variabel, dibundel, tanpa CDN): ujung huruf membulat terasa ramah,
x-height tinggi mudah dibaca anak, dan mendukung semua karakter bahasa Indonesia.
Judul memakai berat 800 dan isi 500. Tidak ada huruf monospace dan tidak ada label kapital berspasi lebar.

### Motif identitas: "stiker"
Kartu dan tombol penting memakai **garis tepi tinta 2px + bayangan padat bergeser 4px**
(tanpa blur), seperti stiker yang ditempel di buku kerja. Tombol "turun" 2px saat ditekan.
Bayangan padat dipakai sebagai **penanda elevasi** (kartu yang bisa diklik), bukan pada semua elemen.

### Bentuk & ruang
- Radius: kartu 16px, tombol/input 12px, lencana kecil 999px (hanya penghitung & status).
- Spasi: kelipatan 4px; jarak antarbagian lebih lega dari jarak di dalam kartu.

### Gerak (MOTION 1)
Hanya umpan balik: tombol turun saat ditekan, transisi warna saat dipilih, timer berkedip
saat sisa 5 menit. Tidak ada animasi muncul saat menggulir.

### Ikon
**Phosphor (berat "bold")**: garisnya tebal, serasi dengan garis tepi stiker, lebih mudah
dikenali anak dibanding ikon bergaris tipis. Ikon dipakai hanya bila menambah makna
(mis. kamera = pengawasan wajah, jam = sisa waktu).

### Tema
**Terang tetap, tanpa mode gelap.** Alasan: dipakai siang hari di kelas, sering
diproyeksikan/dicetak (kartu login), dan identitas "kertas" bergantung pada latar terang.
