const form = document.getElementById('form');
const kirim = document.getElementById('kirim');
const galat = document.getElementById('galat');

document.getElementById('username').focus();
document.getElementById('batal').addEventListener('click', () => window.pengawas.batal());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pengawas.batal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  galat.textContent = '';
  kirim.disabled = true;
  kirim.textContent = 'Memeriksa...';
  const r = await window.pengawas.izinKeluar(document.getElementById('username').value, document.getElementById('sandi').value);
  if (!r.ok) {
    galat.textContent = r.pesan;
    kirim.disabled = false;
    kirim.textContent = 'Tutup aplikasi';
    document.getElementById('sandi').value = '';
    document.getElementById('sandi').focus();
  }
});
