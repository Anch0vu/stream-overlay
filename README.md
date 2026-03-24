# TOON-док: OnionRP Streaming Tool

Кастомный WebRTC-инструмент для OBS с минимальной задержкой.

## Архитектура

Система состоит из двух узлов:

- **s1.onionrp.ru** (95.165.172.153:13777) — WebRTC streaming node
- **dock.onionrp.ru** — Dock-панель управления стримом

### Docker-контейнеры

| Сервис | Описание | Порт |
|--------|----------|------|
| `webrtc-node` | Node.js + mediasoup SFU | 3000 |
| `web` | React SPA (Dock Panel) | 80 |
| `redis` | Хранилище ключей/токенов | 6379 |
| `nginx` | Обратный прокси | 80, 443 |
| `coturn` | TURN сервер | 3478, 49152-49200 |

## Быстрый старт

### 1. Настройка конфигурации

```bash
# Скопируйте пример конфигурации
cp .env.example .env

# Отредактируйте .env — обязательно смените пароли!
```

### 2. Запуск через Docker Compose

```bash
# Сборка и запуск всех контейнеров
docker-compose up -d --build

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f webrtc-node
```

### 3. Доступ

- Dock-панель: `http://dock.onionrp.ru` (или `http://localhost`)
- Streaming API: `http://s1.onionrp.ru` (или `http://localhost:3000`)

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
webrtc/
├── docker-compose.yml          # Оркестрация контейнеров
├── .env                        # Конфигурация (не в git!)
├── .env.example                # Пример конфигурации
│
├── server/                     # WebRTC Node (Node.js)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Точка входа
│       ├── config.js           # Конфигурация
│       ├── api/                # REST API маршруты
│       │   ├── routes.js
│       │   ├── auth-routes.js
│       │   ├── media-routes.js
│       │   └── webrtc-routes.js
│       ├── auth/               # Аутентификация
│       │   ├── keys.js         # Одноразовые ключи
│       │   └── middleware.js   # JWT middleware
│       ├── media/              # Медиахранилище
│       │   ├── upload.js
│       │   └── validation.js
│       ├── webrtc/             # WebRTC/mediasoup
│       │   ├── mediasoup-config.js
│       │   └── room.js
│       ├── ws/                 # WebSocket
│       │   └── socket.js
│       └── utils/              # Утилиты
│           ├── logger.js
│           ├── redis.js
│           └── rate-limit.js
│
├── client/                     # Dock Panel (React)
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
│       │   ├── stream/         # Превью, метрики, громкость
│       │   ├── media/          # Медиапанель, оверлеи
│       │   ├── auth/           # Логин, генератор ключей
│       │   └── matrix/         # Медиаматрица
│       └── pages/              # Страницы
│           ├── LoginPage.jsx
│           ├── DockPanel.jsx
│           └── StreamPage.jsx
│
├── nginx/                      # Обратный прокси
│   ├── Dockerfile
│   └── nginx.conf
│
└── coturn/                     # TURN сервер
    └── turnserver.conf
```

## Система ключей модераторов

1. Стример генерирует одноразовый ключ через Dock-панель
2. Ключ (UUID) сохраняется в Redis с TTL (по умолчанию 10 минут)
3. Стример передаёт ключ модератору
4. Модератор вводит ключ для авторизации
5. Ключ автоматически удаляется после использования

## Безопасность

- **JWT** авторизация для API и WebSocket
- **Одноразовые ключи** в Redis с TTL
- **Rate Limiting** для API и авторизации
- **CORS** ограничение по Origin
- **SSRF защита** при работе с внешними URL
- **MIME валидация** загружаемых файлов
- **TURN аутентификация** — без анонимного доступа
- **Helmet** заголовки безопасности
- **Path Traversal** защита в медиахранилище

## Функциональность

### MVP
- [x] WebRTC ingest (mediasoup SFU)
- [x] Dock-панель с управлением громкостью
- [x] Генерация одноразовых ключей
- [x] Overlay-модуль (изображения, GIF, видео)
- [x] WebSocket синхронизация

### Дополнительно
- [x] Виртуальная медиаматрица
- [x] Загрузка медиафайлов
- [x] Внешние ссылки на медиа
- [x] Статистика стрима (fps, bitrate, latency, packet loss)
- [x] Управление пирами (перезапуск, отключение)
