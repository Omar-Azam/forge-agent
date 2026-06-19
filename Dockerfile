# STAGE 1 — deps (install dependencies)
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# STAGE 2 — playwright (download Chromium)
FROM node:20-slim AS playwright
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# STAGE 3 — final (production image)
FROM node:20-slim AS final

# Install required system libraries for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the app and Playwright's Chromium from the playwright stage
COPY --from=playwright /app/node_modules ./node_modules
COPY --from=playwright /root/.cache/ms-playwright /root/.cache/ms-playwright
COPY src/ ./src/
COPY package.json ./

# Set environment variables for Docker operation
ENV HEADLESS=true
ENV NO_TUI=false
ENV DISPLAY=:99
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
ENV DOCKER_CONTAINER=true

# Create directories
RUN mkdir -p /root/.deepseek-agent/session \
             /root/.deepseek-agent/logs \
             /root/.deepseek-agent/tools \
             /workspace

# Set working directory for user projects
WORKDIR /workspace

ENTRYPOINT ["node", "/app/src/index.js"]
CMD ["--help"]
