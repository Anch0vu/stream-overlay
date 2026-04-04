# ===================================
# Dockerfile для фронтенда (Dock Panel)
# React + Vite билд, раздача через nginx
# ===================================

# Стадия сборки
FROM node:22-alpine AS build

WORKDIR /app

# Копируем файлы зависимостей
COPY package.json package-lock.json* ./

# Устанавливаем зависимости (npm install — работает с и без lock-файла)
RUN npm install --prefer-offline 2>/dev/null || npm install

# Копируем исходный код
COPY . .

# Собираем проект
RUN npm run build

# Стадия продакшена — раздача статики через nginx
FROM nginx:alpine

# Копируем собранный проект
COPY --from=build /app/dist /usr/share/nginx/html

# Конфигурация nginx для SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
