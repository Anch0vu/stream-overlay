# syntax=docker/dockerfile:1
# ===================================
# Dockerfile для серверной части (WebRTC Node)
# Node.js + mediasoup SFU
# ===================================

FROM node:22-bullseye

# Параллельная компиляция mediasoup C++ worker на всех ядрах процессора
ENV MAKEFLAGS="-j$(nproc)"

# Build deps для mediasoup native addon
# --mount=type=cache кэширует пакеты apt между пересборками (не скачивает повторно)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    pkg-config

WORKDIR /app

COPY package.json package-lock.json* ./

# --mount=type=cache кэширует npm registry между пересборками
# Если package.json не менялся — этот слой берётся из Docker layer cache (0s)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

# Удаляем devDeps после нативной сборки
RUN npm prune --omit=dev

RUN mkdir -p /app/media/uploads /app/logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
