# Tahap 1: pasang dependensi & build klien
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=postgresql://build@localhost/build npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Tahap 2: image produksi
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
COPY --from=build /app /app
RUN mkdir -p /data/uploads && chown -R node:node /data && chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
# Entrypoint berjalan sebagai root hanya untuk memperbaiki izin folder unggahan, lalu menjalankan
# aplikasi sebagai user "node". Perintah manual lewat `docker compose exec` sebaiknya memakai `-u node`.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
# Migrasi database dijalankan setiap kali container mulai (aman diulang).
CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx server/index.ts"]
