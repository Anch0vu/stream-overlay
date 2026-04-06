# syntax=docker/dockerfile:1
# ===================================
# Dockerfile для серверной части (WebRTC Node)
# Node.js + mediasoup SFU
# ===================================

FROM node:22-bullseye

# ── Стратегия сборки mediasoup ─────────────────────────────────────────────
# По умолчанию mediasoup пытается скачать prebuilt-бинарь с GitHub Releases
# (~5-10 МБ, <10 секунд). Только если скачивание недоступно — компилирует из
# исходников (5-10 минут). Оба пути обрабатываются одним npm ci.
#
# MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD=false  → предпочесть скачивание (default)
# MAKEFLAGS="-j$(nproc)"                         → параллельная компиляция, если всё же нужна
# ──────────────────────────────────────────────────────────────────────────
ENV MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD=false
ENV MAKEFLAGS="-j$(nproc)"

# Build deps — нужны только если prebuilt не удалось скачать и идёт компиляция.
# Кэшируются между пересборками через BuildKit cache mount.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

# npm ci запускает postinstall mediasoup:
#   1. Пробует скачать prebuilt-бинарь → успех за ~10 сек
#   2. Если недоступен — компилирует с MAKEFLAGS (параллельно)
# Слой кэшируется в Docker: повторная сборка при неизменном package-lock = 0 сек
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

# Убираем devDependencies из финального образа
RUN npm prune --omit=dev

RUN mkdir -p /app/media/uploads /app/logs

EXPOSE 3001

# start_period=45s: 2 воркера mediasoup стартуют за ~5-10s,
# но Redis-соединение + инициализация router занимают время
HEALTHCHECK --interval=20s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
