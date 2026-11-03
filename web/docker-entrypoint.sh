#!/bin/sh
# Menyiapkan folder unggahan, lalu menjalankan aplikasi sebagai user "node" (bukan root).
#
# Volume atau folder yang dipasang dari luar (volume Docker lama, bind mount, atau platform hosting)
# sering dimiliki root, sehingga aplikasi gagal membuat gambar soal, logo, dan foto bukti
# ("EACCES: permission denied, mkdir '/data/uploads/gambar'"). Skrip ini memperbaikinya setiap
# container mulai; perubahan kepemilikan hanya dilakukan bila memang perlu.
set -e

UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOAD_DIR"
  if [ "$(stat -c %u "$UPLOAD_DIR")" != "$(id -u node)" ]; then
    echo "Folder $UPLOAD_DIR bukan milik user node; memperbaiki kepemilikan..."
    chown -R node:node "$UPLOAD_DIR" || echo "PERINGATAN: gagal mengubah kepemilikan $UPLOAD_DIR. Unggah gambar akan gagal. Periksa izin volume." >&2
  fi
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  fi
  exec su node -s /bin/sh -c 'exec "$0" "$@"' -- "$@"
fi

exec "$@"
