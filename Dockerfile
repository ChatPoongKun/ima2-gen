FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci

COPY . .
RUN npm run ui:build \
  && npm run build:server \
  && npm run build:cli \
  && npm prune --omit=dev \
  && rm -rf ui/node_modules

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
  HOME=/data \
  CODEX_HOME=/data/codex \
  IMA2_CONFIG_DIR=/data/ima2 \
  IMA2_HOST=0.0.0.0 \
  IMA2_PORT=3333 \
  IMA2_GENERATED_DIR=/data/generated \
  IMA2_TRASH_DIR=/data/generated/.trash \
  IMA2_DB_PATH=/data/sessions.db \
  IMA2_GENERATION_REQUEST_LOG_FILE=/data/generation-requests.json

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
  && mkdir -p /data/ima2 /data/codex /data/generated \
  && chown -R node:node /data /app

USER node
VOLUME ["/data"]
EXPOSE 3333

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "bin/ima2.js", "serve"]

