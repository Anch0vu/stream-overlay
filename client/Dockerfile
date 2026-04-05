# syntax=docker/dockerfile:1
# ===================================
# Dockerfile для фронтенда (Dock Panel)
# React + Vite билд, раздача через nginx
# ===================================

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./

# --mount=type=cache кэширует npm packages между пересборками
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline 2>/dev/null || npm install

COPY . .

RUN npm run build

# Продакшн-стадия — только nginx + статика
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
