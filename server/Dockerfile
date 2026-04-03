# ===================================
# Dockerfile для серверной части (WebRTC Node)
# Node.js + mediasoup SFU
# ===================================

FROM node:22-bullseye

# Build deps for mediasoup native addon (requires python3 + g++ + make)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL deps (including devDeps needed for mediasoup native build)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Prune devDeps after native build is complete
RUN npm prune --omit=dev

# Media storage dir
RUN mkdir -p /app/media/uploads

# Logs dir (winston will write here)
RUN mkdir -p /app/logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
