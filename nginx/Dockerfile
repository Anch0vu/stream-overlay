# ===================================
# Dockerfile для Nginx обратного прокси
# ===================================

FROM nginx:alpine

# Удаляем дефолтную конфигурацию
RUN rm /etc/nginx/conf.d/default.conf

# Копируем конфигурацию
COPY nginx.conf /etc/nginx/nginx.conf

# Создаём директорию для сертификатов
RUN mkdir -p /etc/nginx/certs

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
