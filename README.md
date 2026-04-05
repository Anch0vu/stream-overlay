# TOON-dok — OnionRP Streaming Tool

```
  ████████╗ ██████╗  ██████╗ ███╗   ██╗      ██████╗  ██████╗ ██╗  ██╗
     ██╔══╝██╔═══██╗██╔═══██╗████╗  ██║      ██╔══██╗██╔═══██╗██║ ██╔╝
     ██║   ██║   ██║██║   ██║██╔██╗ ██║█████╗██║  ██║██║   ██║█████╔╝
     ██║   ██║   ██║██║   ██║██║╚██╗██║╚════╝██║  ██║██║   ██║██╔═██╗
     ██║   ╚██████╔╝╚██████╔╝██║ ╚████║      ██████╔╝╚██████╔╝██║  ██╗
     ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
```

**WebRTC SFU** с минимальной задержкой для OBS-стримов: dock-панель управления, оверлеи, ключи модераторов, статистика в реальном времени.

---

## Быстрый старт

### Через CLI-установщик (рекомендуется)

```bash
git clone https://github.com/Anch0vu/stream-overlay.git
cd stream-overlay
bash install.sh
```

Откроется интерактивное меню — выберите **1 → Первоначальная установка**.

### Вручную

```bash
cp .env.example .env
# Отредактируйте .env: укажите IP, пароли (см. раздел «Переменные окружения»)
nano .env
docker compose up -d --build
```

---

## CLI-установщик `install.sh`

```
  ┌─────────────────────────────────────────────────────┐
  │  TOON-dok — OnionRP Streaming Tool                  │
  │  WebRTC · mediasoup SFU · OBS Overlay               │
  ├─────────────────────────────────────────────────────┤
  │   1  Первоначальная установка / Мастер настройки    │
  │   2  Управление сервисами                           │
  │   3  Показать статус                                │
  │   4  Просмотр логов                                 │
  │   5  Генерация ключа модератора                     │
  │   6  Текущая конфигурация                           │
  │   7  Редактировать .env                             │
  │   8  Резервное копирование                          │
  │   9  Обновить (git pull + rebuild)                  │
  │  10  Деинсталляция                                  │
  │   0  Выход                                          │
  └─────────────────────────────────────────────────────┘
```

Мастер настройки автоматически определяет публичный IP, генерирует все пароли и обновляет `.env` + `coturn/turnserver.conf`.

### Неинтерактивный (CI/автоматизация)

```bash
bash install.sh start        # запустить сервисы
bash install.sh stop         # остановить
bash install.sh restart      # перезапустить
bash install.sh build        # пересобрать образы и запустить
bash install.sh status       # показать статус
bash install.sh logs         # логи webrtc-node
bash install.sh logs nginx   # логи конкретного сервиса
bash install.sh update       # git pull + rebuild
bash install.sh uninstall    # удалить контейнеры и volumes
```

---

## Архитектура

```
                         Internet
                             │
                    ┌────────▼────────┐
                    │   nginx :13777  │  ← HTTP/WS revers proxy
                    └────────┬────────┘
                             │
           ┌─────────────────┼──────────────────┐
           │                 │                  │
    ┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼──────┐
    │  React SPA  │  │  webrtc-node  │  │   coturn    │
    │  (Vite)     │  │  Node 22 :3001│  │  TURN :3478 │
    └─────────────┘  └───────┬───────┘  └─────────────┘
                             │
                      ┌──────▼──────┐
                      │    Redis    │
                      │   :6379     │
                      └─────────────┘
                             │
              mediasoup SFU workers
              UDP 40000-49999
```

### Сервисы Docker

| Контейнер | Описание | Внутр. порт | Внешний порт |
|-----------|----------|-------------|--------------|
| `nginx` | Реверс-прокси, фронтенд | 80 | **13777** TCP |
| `webrtc-node` | Сигнальный сервер + mediasoup | 3001 | 3001 (localhost) |
| `web` | React SPA | 80 | — (через nginx) |
| `redis` | Ключи, токены | 6379 | 6379 (localhost) |
| `coturn` | NAT traversal TURN | 3478 | 3478 UDP+TCP |
| mediasoup RTC | UDP relay | — | 40000–49999 UDP |

---

## Переменные окружения

Все настройки хранятся в `.env` (создаётся из `.env.example`).

### Обязательные

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `MEDIASOUP_ANNOUNCED_IP` | **Публичный IP** VPS | `95.1.2.3` |
| `REDIS_PASSWORD` | Пароль Redis | `strongP@ss` |
| `JWT_SECRET` | Секрет JWT (≥32 символа) | `$(openssl rand -hex 32)` |
| `STREAMER_PASSWORD` | Пароль стримера | `mySecretPass` |
| `TURN_SERVER_PASSWORD` | Пароль TURN | `turnP@ss` |
| `CORS_ORIGIN` | URL фронтенда | `http://95.1.2.3:13777` |

### Сетевые параметры

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `SERVER_PORT` | `3001` | Порт сигнального сервера |
| `WEB_PORT` | `13777` | Внешний порт веб-панели |
| `MEDIASOUP_MIN_PORT` | `40000` | UDP диапазон (нижний) |
| `MEDIASOUP_MAX_PORT` | `49999` | UDP диапазон (верхний) |
| `MEDIASOUP_LOG_LEVEL` | `warn` | Уровень логов mediasoup |

### Redis

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `REDIS_HOST` | `redis` | Хост Redis (имя сервиса Docker) |
| `REDIS_PORT` | `6379` | Порт Redis |

### JWT и авторизация

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `JWT_EXPIRES_IN` | `24h` | Время жизни токена |
| `MODERATOR_KEY_TTL` | `600` | TTL одноразового ключа (сек) |

### TURN сервер

| Переменная | Пример | Описание |
|-----------|--------|----------|
| `TURN_SERVER_URL` | `turn:95.1.2.3:3478` | URL TURN |
| `TURN_SERVER_USERNAME` | `onionrp` | Имя пользователя |
| `TURN_SERVER_PASSWORD` | `turnP@ss` | Пароль |

### Rate Limiting

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Окно ограничения (мс) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Максимум запросов в окне |

---

## Порты и файрвол

Откройте следующие порты на сервере:

```bash
# UFW (Ubuntu)
ufw allow 13777/tcp    # Веб-панель
ufw allow 3478/tcp     # TURN
ufw allow 3478/udp     # TURN
ufw allow 40000:49999/udp  # mediasoup RTC
```

| Порт | Протокол | Назначение |
|------|----------|-----------|
| 13777 | TCP | Веб-панель + API |
| 3478 | TCP+UDP | TURN (coturn) |
| 40000–49999 | UDP | mediasoup WebRTC |

---

## Первый запуск шаг за шагом

### 1. Клонировать репозиторий

```bash
git clone https://github.com/Anch0vu/stream-overlay.git
cd stream-overlay
```

### 2. Запустить мастер настройки

```bash
bash install.sh
# Выбрать: 1 → Первоначальная установка
```

Мастер спросит:
- Публичный IP (определяется автоматически)
- Внешний порт панели (по умолчанию `13777`)
- CORS Origin
- Пароли (можно оставить пустыми — сгенерируются автоматически)
- UDP диапазон для WebRTC

### 3. Открыть порты

```bash
ufw allow 13777/tcp && ufw allow 3478 && ufw allow 40000:49999/udp
```

### 4. Проверить работу

```bash
curl http://YOUR_IP:13777/api/health
# → {"status":"ok"}
```

---

## Система ключей модераторов

```
  Стример                               Модератор
     │                                      │
     │  1. Нажать «Создать ключ»            │
     │     в Dock-панели                    │
     │     (или bash install.sh → п.5)      │
     │                                      │
     │  2. Передать ключ (UUID) ──────────► │
     │                                      │
     │                          3. Ввести ключ
     │                             в форму входа
     │                                      │
     │  ◄── JWT токен (role: moderator) ────│
     │                                      │
     │  [Ключ удаляется из Redis]           │
```

- Ключ одноразовый, хранится в Redis с TTL (по умолчанию 10 мин)
- После использования ключ мгновенно инвалидируется
- Модератор получает JWT с ролью `moderator`

---

## OBS Browser Source

URL для добавления в OBS:

```
http://YOUR_IP:13777/obs
```

Overlay обновляется в реальном времени через WebSocket (`/overlay` namespace) — без аутентификации, только чтение.

---

## Разработка (без Docker)

```bash
# 1. Redis (нужен локальный)
docker run -d -p 6379:6379 redis:7-alpine

# 2. Серверная часть
cd server
cp ../.env.example .env  # отредактировать REDIS_HOST=localhost
npm install
npm run dev              # порт 3001

# 3. Клиент (другой терминал)
cd client
npm install
npm run dev              # порт 5173, proxy → localhost:3001
```

---

## Структура проекта

```
stream-overlay/
├── install.sh                  # ← CLI установщик / панель управления
├── docker-compose.yml
├── .env.example
│
├── server/                     # WebRTC Node (Node.js 22 + mediasoup)
│   ├── Dockerfile
│   └── src/
│       ├── index.js            # HTTP + graceful shutdown
│       ├── config.js           # Все настройки из env
│       ├── api/
│       │   ├── routes.js       # /health, /system-info
│       │   ├── auth-routes.js
│       │   ├── media-routes.js
│       │   └── webrtc-routes.js
│       ├── auth/
│       │   ├── keys.js         # Одноразовые ключи (Redis SCAN)
│       │   └── middleware.js
│       ├── webrtc/
│       │   ├── mediasoup-config.js  # TCP fallback, 2Mbps start bitrate
│       │   └── room.js         # Workers + exponential backoff
│       ├── ws/
│       │   └── socket.js       # Namespace /  + /overlay (OBS)
│       └── utils/
│           ├── logger.js
│           ├── redis.js
│           └── rate-limit.js
│
├── client/                     # Dock Panel (React 18 + Vite + Tailwind)
│   ├── Dockerfile
│   └── src/
│       ├── hooks/
│       │   ├── useWebRTC.js    # RTCStatsReport (fps/bitrate/latency)
│       │   ├── useSocket.js
│       │   └── useAuth.jsx
│       ├── components/
│       │   ├── stream/         # ConnectionStatus, PerformanceDashboard
│       │   ├── media/          # Overlays, MediaPanel
│       │   └── layout/         # Sidebar (Monitoring tab)
│       └── pages/
│           ├── DockPanel.jsx
│           └── ObsOverlay.jsx
│
├── nginx/
│   └── nginx.conf              # upstream :3001, timeout 3600s
│
└── coturn/
    └── turnserver.conf         # TURN auth, SSRF protection
```

---

## Безопасность

| Механизм | Описание |
|---------|----------|
| JWT | Авторизация API и WebSocket |
| Одноразовые ключи | Redis + TTL, инвалидируются после использования |
| Role-based access | `streamer` / `moderator` на control-события |
| CORS strict | Точное совпадение Origin (не `startsWith`) |
| Rate Limiting | API / auth / upload — по окнам |
| Helmet | HTTP security headers |
| SSRF защита | Валидация внешних URL |
| MIME validation | Разрешённые типы для загрузок |
| Path Traversal | Защита медиахранилища |
| Redis localhost | Только `127.0.0.1:6379` снаружи |
| TURN auth | Обязательная аутентификация, без анонимного доступа |
| Graceful shutdown | Force-exit через 10 с |

---

## Функциональность

### Ядро
- [x] WebRTC ingest (mediasoup SFU, TCP fallback)
- [x] Dock-панель управления (React)
- [x] Одноразовые ключи модераторов
- [x] OBS overlay namespace (публичный WebSocket)
- [x] Статистика в реальном времени (fps, bitrate, latency, packet loss)
- [x] Мониторинг сервера (память, аптайм, пиры)
- [x] ConnectionStatus виджет
- [x] Exponential backoff для mediasoup workers
- [x] Docker healthchecks

### Медиа
- [x] Overlay-изображения, GIF, видео
- [x] Загрузка медиафайлов
- [x] Виртуальная медиаматрица
- [x] Управление громкостью

### Ops
- [x] CLI установщик с мастером настройки
- [x] Автогенерация паролей
- [x] Резервное копирование `.env`
- [x] BuildKit кэши (быстрая пересборка)
- [x] `MAKEFLAGS="-j$(nproc)"` — параллельная сборка mediasoup

---

## Требования к серверу

| Компонент | Минимум | Рекомендуется |
|----------|---------|--------------|
| ОС | Ubuntu 22.04 | Ubuntu 24.04 LTS |
| CPU | 2 ядра | 4+ ядер |
| RAM | 2 GB | 4+ GB |
| Docker | 24+ | 26+ |
| Docker Compose | v2+ | v2.20+ |
| Node.js | 22 (в контейнере) | — |

Открытые порты: `13777/tcp`, `3478/tcp+udp`, `40000–49999/udp`
