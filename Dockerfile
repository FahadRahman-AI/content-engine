FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NO_SANDBOX=1 \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package*.json ./
# Skip puppeteer's own download here; Chrome is installed once, explicitly, below.
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip ca-certificates \
 && npx puppeteer browsers install chrome --install-deps \
 && rm -rf /var/lib/apt/lists/*

COPY . .
CMD ["node", "src/cli.js", "serve"]
