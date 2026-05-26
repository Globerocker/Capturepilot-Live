# Playwright ships its own runtime image with Chromium + all required
# system libs preinstalled. Pinned to the same Playwright version as
# package.json so the binary matches the API.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Install deps first so Docker caches the layer across code changes.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY worker.js ./

# Healthcheck — Railway will mark the service unhealthy if this fails.
HEALTHCHECK --interval=120s --timeout=10s --start-period=30s --retries=3 \
  CMD pgrep -f "node.*worker.js" > /dev/null || exit 1

CMD ["node", "--enable-source-maps", "worker.js"]
