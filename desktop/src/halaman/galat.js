const pesan = new URLSearchParams(location.search).get('pesan');
if (pesan) document.getElementById('detail').textContent = `Keterangan teknis: ${pesan}`;
document.getElementById('ulang').addEventListener('click', () => window.aplikasiTka.cobaLagi());
document.getElementById('tutup').addEventListener('click', () => window.aplikasiTka.keluar());
// Coba sambung ulang otomatis setiap 15 detik.
setInterval(() => window.aplikasiTka.cobaLagi(), 15000);
