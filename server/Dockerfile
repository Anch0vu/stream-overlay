# syntax=docker/dockerfile:1
# ===================================
# Dockerfile для серверной части (WebRTC Node)
# Node.js + mediasoup SFU
# ===================================

# Debian 12 (bookworm) — glibc 2.36. ВАЖНО: mediasoup prebuilt-воркер
# (linux-x64-kernel6) требует glibc >= 2.32 и GLIBCXX_3.4.29. На bullseye
# (glibc 2.31) prebuilt НЕ запускается, и сборка каждый раз молча уходит в
# компиляцию из исходников (нужны pip/pypi + build-essential, 5-10 мин).
# На bookworm prebuilt валиден → npm ci ~4 c без компиляции.
FROM node:22-bookworm

# ── Стратегия сборки mediasoup ─────────────────────────────────────────────
# По умолчанию mediasoup пытается скачать prebuilt-бинарь с GitHub Releases
# (~5-10 МБ, <10 секунд). Только если скачивание недоступно — компилирует из
# исходников (5-10 минут). Оба пути обрабатываются одним npm ci.
#
# ВАЖНО: не устанавливать MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD в "false" —
# любая непустая строка воспринимается как truthy в JS и отключает скачивание.
# MAKEFLAGS="-j$(nproc)"  → параллельная компиляция, если скачивание недоступно
# ──────────────────────────────────────────────────────────────────────────
ENV MAKEFLAGS="-j$(nproc)"

# Build deps — нужны только если prebuilt не удалось скачать и идёт компиляция.
# python3-pip нужен mediasoup для установки invoke (сборочный инструмент).
# Кэшируются между пересборками через BuildKit cache mount.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
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
