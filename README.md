# TOON-док: OnionRP Streaming Tool

Кастомный WebRTC-инструмент для OBS с минимальной задержкой.

## Архитектура

Система состоит из контейнеризированных сервисов, работающих через Docker Compose:

### Docker-контейнеры

| Сервис | Описание | Внутренний порт | Внешний порт |
|--------|----------|----------------|-------------|
| `nginx` | Обратный прокси (фронтенд + API) | 80 | **13777** |
| `webrtc-node` | Node.js 22 + mediasoup SFU | 3001 | 3001 (localhost) |
| `web` | React SPA (Dock Panel) | 80 | — (через nginx) |
| `redis` | Хранилище ключей/токенов | 6379 | 6379 (localhost) |
| `coturn` | TURN сервер | 3478 | 3478 (UDP+TCP) |
| mediasoup RTC | UDP relay | 40000-49999 | 40000-49999 (UDP) |

## Быстрый старт

### 1. Настройка конфигурации

```bash
# Скопируйте пример конфигурации
cp .env.example .env

# Обязательно отредактируйте .env:
# - Смените все пароли (REDIS_PASSWORD, JWT_SECRET, STREAMER_PASSWORD, TURN_SERVER_PASSWORD)
# - Укажите публичный IP (MEDIASOUP_ANNOUNCED_IP, TURN_SERVER_URL)
# - Укажите домен или IP в CORS_ORIGIN
```

### 2. Запуск через Docker Compose

```bash
# Сборка и запуск всех контейнеров
docker compose up -d --build

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f webrtc-node
```

### 3. Доступ

- **Dock-панель:** `http://YOUR_IP:13777`
- **API Health:** `http://YOUR_IP:13777/api/health`
- **OBS Browser Source:** `http://YOUR_IP:13777/obs`

### 4. Проверка работоспособности

```bash
# Фронтенд доступен
curl http://localhost:13777/

# API отвечает
curl http://localhost:13777/api/health

# Логи без ошибок
docker compose logs webrtc-node | grep -i error
```

## Разработка

### Локальный запуск без Docker

```bash
# Сервер
cd server
npm install
npm run dev

# Клиент (в отдельном терминале)
cd client
npm install
npm run dev
```

Фронтенд будет доступен на `http://localhost:5173`.

## Структура проекта

```
stream-overlay/
├── docker-compose.yml          # Оркестрация контейнеров
├── .env                        # Конфигурация (не в git!)
├── .env.example                # Пример конфигурации
│
├── server/                     # WebRTC Node (Node.js 22)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Точка входа
│       ├── config.js           # Конфигурация
│       ├── api/                # REST API маршруты
│       │   ├── routes.js       # Роутер + /health + /system-info
│       │   ├── auth-routes.js
│       │   ├── media-routes.js
│       │   └── webrtc-routes.js
│       ├── auth/               # Аутентификация
│       │   ├── keys.js         # Одноразовые ключи (Redis SCAN)
│       │   └── middleware.js   # JWT middleware
│       ├── media/              # Медиахранилище
│       │   ├── upload.js
│       │   └── validation.js
│       ├── webrtc/             # WebRTC/mediasoup
│       │   ├── mediasoup-config.js
│       │   └── room.js         # Воркеры с экспоненциальным бэкофом
│       ├── ws/                 # WebSocket
│       │   └── socket.js       # Основной + /overlay namespace
│       └── utils/
│           ├── logger.js
│           ├── redis.js
│           └── rate-limit.js
│
├── client/                     # Dock Panel (React + Vite + Tailwind)
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── lib/                # Утилиты клиента
│       │   ├── utils.js
│       │   ├── api.js
│       │   ├── socket.js
│       │   └── webrtc.js
│       ├── hooks/              # React хуки
│       │   ├── useAuth.jsx
│       │   ├── useSocket.js
│       │   └── useWebRTC.js
│       ├── components/
│       │   ├── ui/             # shadcn/ui компоненты
│       │   ├── layout/         # Шапка, сайдбар
│       │   ├── stream/         # Превью, метрики, громкость, мониторинг
│       │   ├── media/          # Медиапанель, оверлеи
│       │   ├── auth/           # Логин, генератор ключей
│       │   └── matrix/         # Медиаматрица
│       └── pages/
│           ├── LoginPage.jsx
│           ├── DockPanel.jsx   # Главная панель управления
│           ├── StreamPage.jsx
│           └── ObsOverlay.jsx  # OBS browser source
│
├── nginx/                      # Обратный прокси
│   ├── Dockerfile
│   └── nginx.conf
│
└── coturn/                     # TURN сервер
    └── turnserver.conf
```

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|-----------|----------|-----------------------|
| `NODE_ENV` | Окружение | `production` |
| `SERVER_PORT` | Порт сигнального сервера | `3001` |
| `WEB_PORT` | Внешний порт фронтенда | `13777` |
| `MEDIASOUP_ANNOUNCED_IP` | Публичный IP для WebRTC | (обязательно) |
| `MEDIASOUP_MIN_PORT` | Минимальный UDP порт | `40000` |
| `MEDIASOUP_MAX_PORT` | Максимальный UDP порт | `49999` |
| `TURN_SERVER_URL` | URL TURN сервера | `turn:YOUR_IP:3478` |
| `CORS_ORIGIN` | Разрешённый Origin | `http://YOUR_DOMAIN:13777` |

Полный список — в `.env.example`.

## Система ключей модераторов

1. Стример генерирует одноразовый ключ через Dock-панель
2. Ключ (UUID) сохраняется в Redis с TTL (по умолчанию 10 минут)
3. Стример передаёт ключ модератору
4. Модератор вводит ключ для авторизации
5. Ключ автоматически удаляется после использования

## Безопасность

- **JWT** авторизация для API и WebSocket
- **Одноразовые ключи** в Redis с TTL
- **Rate Limiting** для API, авторизации и загрузки файлов
- **CORS** ограничение по Origin (strict equality, не startsWith)
- **SSRF защита** при работе с внешними URL
- **MIME валидация** загружаемых файлов
- **TURN аутентификация** — без анонимного доступа
- **Helmet** заголовки безопасности
- **Path Traversal** защита в медиахранилище
- **Role-based access** на WebSocket control events
- **Overlay namespace** — публичный канал только-чтение для OBS
- **Redis доступен только с localhost** (127.0.0.1:6379)
- **Graceful shutdown** с 10-секундным таймаутом

## Функциональность

### MVP
- [x] WebRTC ingest (mediasoup SFU)
- [x] Dock-панель с управлением громкостью
- [x] Генерация одноразовых ключей
- [x] Overlay-модуль (изображения, GIF, видео)
- [x] WebSocket синхронизация

### Расширенное
- [x] Виртуальная медиаматрица
- [x] Загрузка медиафайлов
- [x] Внешние ссылки на медиа
- [x] Статистика стрима (fps, bitrate, latency, packet loss)
- [x] Управление пирами (перезапуск, отключение)
- [x] Мониторинг производительности (память, аптайм, пиры)
- [x] ConnectionStatus — виджет состояния подключения
- [x] OBS overlay namespace (публичный WebSocket)
- [x] Docker healthchecks для всех сервисов
- [x] Exponential backoff для перезапуска mediasoup worker
- [x] TCP fallback для WebRTC (за строгим NAT)

## Требования

- Docker & Docker Compose v2+
- Node.js >= 22 (для локальной разработки)
- Ubuntu 24.04 LTS (или совместимая ОС)
- Открытые порты: 13777/tcp, 3478/tcp+udp, 40000-49999/udp
