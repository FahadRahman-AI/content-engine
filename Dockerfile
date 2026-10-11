FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NO_SANDBOX=1 \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package*.json ./
RUN npm ci --omit=dev \
 && npx puppeteer browsers install chrome --install-deps \
 && rm -rf /var/lib/apt/lists/*

COPY . .
CMD ["node", "src/cli.js", "serve"]
