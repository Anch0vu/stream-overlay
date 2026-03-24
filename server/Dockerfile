# ===================================
# Dockerfile для серверной части (WebRTC Node)
# Node.js + mediasoup SFU
# ===================================

FROM node:20-bullseye

# Устанавливаем зависимости для сборки mediasoup
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем файлы зависимостей
COPY package.json package-lock.json* ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаём директорию для медиафайлов
RUN mkdir -p /app/media/uploads

# Порт сервера
EXPOSE 3000

# Запуск сервера
CMD ["node", "src/index.js"]
