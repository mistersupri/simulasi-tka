/**
 * Titik masuk web app.
 *   URL_APLIKASI            → halaman siswa
 *   URL_APLIKASI?page=admin → halaman admin/guru
 */
function doGet(e) {
  const halaman = e && e.parameter && e.parameter.page === 'admin' ? 'Admin' : 'Index';
  const template = HtmlService.createTemplateFromFile(halaman);
  template.urlAplikasi = ScriptApp.getService().getUrl();

  let judul = 'Simulasi TKA';
  try {
    judul += ' ' + ambilPengaturan_().NAMA_SEKOLAH;
  } catch (err) {
    console.warn(err);
  }

  return template.evaluate()
    .setTitle(halaman === 'Admin' ? 'Admin ' + judul : judul)
    // Tag viewport di file HTML diabaikan Apps Script; wajib lewat addMetaTag.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Dipakai di template HTML: <?!= include('Gaya') ?> */
function include(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}
