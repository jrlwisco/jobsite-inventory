# Job Site Inventory - container image
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Build tools only in case a prebuilt better-sqlite3 binary isn't available
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data
EXPOSE 3000
# Mount a persistent disk at /data (database + photos live there).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/server.js"]
