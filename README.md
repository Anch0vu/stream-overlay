# TOON-dok — OnionRP Streaming Tool

```
                                                       /\   /\
                                                      ( OwO )
                                                       )   (   )~
  ████████╗ ██████╗  ██████╗ ███╗   ██╗      ██████╗  ██████╗ ██╗  ██╗
     ██╔══╝██╔═══██╗██╔═══██╗████╗  ██║      ██╔══██╗██╔═══██╗██║ ██╔╝
     ██║   ██║   ██║██║   ██║██╔██╗ ██║█████╗██║  ██║██║   ██║█████╔╝
     ██║   ██║   ██║██║   ██║██║╚██╗██║╚════╝██║  ██║██║   ██║██╔═██╗
     ██║   ╚██████╔╝╚██████╔╝██║ ╚████║      ██████╔╝╚██████╔╝██║  ██╗
     ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
                                                               ~~~~w~~
```

**WebRTC SFU** с минимальной задержкой для OBS-стримов: dock-панель управления, оверлеи, ключи модераторов, статистика в реальном времени.

---

## Быстрый старт

```bash
git clone https://github.com/Anch0vu/stream-overlay.git
cd stream-overlay
bash install.sh
```

Откроется интерактивное меню — выберите **1 → Первоначальная установка**.  
Мастер автоматически определит IP, сгенерирует пароли, обнаружит системный Redis и запустит сборку Docker-образов.

---

## CLI-установщик `install.sh`

```
  ┌─────────────────────────────────────────────────────┐
  │   1  Установка / Мастер настройки                   │
  │   2  Управление сервисами                           │
  │   3  Статус                                         │
  │   4  Логи                                           │
  │   5  Ключ модератора                                │
  │   6  Текущая конфигурация                           │
  │   7  Редактировать .env                             │
  │   8  Резервная копия                                │
  │   9  Обновить (git pull)                            │
  │  10  Деинсталляция                                  │
  │   0  Выход                                          │
  └─────────────────────────────────────────────────────┘
```

### Что делает мастер настройки

1. **Публичный IP** — определяется автоматически через `ipify`
2. **Redis** — обнаруживает системный Redis на порту 6379; предлагает использовать его или запустить Docker-контейнер (нет конфликта портов)
3. **Пароли** — все генерируются автоматически, если не указаны вручную (Redis, JWT, стример, TURN)
4. **Firewall** — после запуска проверяет `ufw`/`iptables` и предупреждает, если UDP-порты WebRTC не открыты
5. **Healthcheck** — опрашивает `/api/health` до 90 секунд и сообщает, когда сервис готов
6. **Доступы** — выводит пароль стримера прямо в терминал после успешного запуска

### Неинтерактивный режим (CI / автоматизация)

```bash
bash install.sh install     # запустить мастер
bash install.sh start       # запустить сервисы
bash install.sh stop        # остановить
bash install.sh restart     # перезапустить
bash install.sh build       # пересобрать образы и запустить
bash install.sh status      # статус контейнеров
bash install.sh logs        # логи всех сервисов (50 строк)
bash install.sh logs nginx  # логи конкретного сервиса
bash install.sh update      # git pull + показать новые коммиты + rebuild
bash install.sh uninstall   # удалить контейнеры и volumes
```

---

## Архитектура

```
                         Internet
                             │
                    ┌────────▼────────┐
                    │   nginx :13777  │  ← реверс-прокси HTTP/WS
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
                      │    Redis    │  ← Docker или системный
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

> **Redis** запускается в Docker только при выборе `REDIS_MODE=docker` (профиль `docker-redis`).  
> При `REDIS_MODE=external` используется системный Redis через `host.docker.internal`.

---

## Переменные окружения

Все настройки хранятся в `.env` (создаётся из `.env.example`, права `600`).

### Обязательные

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `MEDIASOUP_ANNOUNCED_IP` | **Публичный IP** VPS | `95.1.2.3` |
| `REDIS_PASSWORD` | Пароль Redis | `strongP@ss` |
| `JWT_SECRET` | Секрет JWT (≥32 символа) | `$(openssl rand -hex 32)` |
| `STREAMER_PASSWORD` | Пароль стримера | `mySecretPass` |
| `TURN_SERVER_PASSWORD` | Пароль TURN | `turnP@ss` |
| `CORS_ORIGIN` | URL фронтенда | `http://95.1.2.3:13777` |

### Сетевые

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
| `REDIS_MODE` | `docker` | `docker` или `external` |
| `REDIS_HOST` | `redis` | `redis` (Docker) или `host.docker.internal` (системный) |
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
| `TURN_SERVER_USERNAME` | `onionrp` | Имя пользователя coturn |
| `TURN_SERVER_PASSWORD` | `turnP@ss` | Пароль |

### Rate Limiting

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Окно (мс) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Максимум запросов в окне |

---

## Порты и файрвол

```bash
# Ubuntu (ufw)
ufw allow 13777/tcp        # Веб-панель
ufw allow 3478/tcp
ufw allow 3478/udp         # TURN
ufw allow 40000:49999/udp  # mediasoup WebRTC
```

| Порт | Протокол | Назначение |
|------|----------|-----------|
| 13777 | TCP | Веб-панель + API |
| 3478 | TCP+UDP | TURN (coturn) |
| 40000–49999 | UDP | mediasoup WebRTC |

> `install.sh` проверяет открытые порты сразу после деплоя и предупреждает, если WebRTC-диапазон заблокирован.

---

## Пошаговый первый запуск

```bash
# 1. Клонировать
git clone https://github.com/Anch0vu/stream-overlay.git
cd stream-overlay

# 2. Мастер настройки
bash install.sh
# → Выбрать: 1 → Первоначальная установка
# → Подтвердить IP, оставить пароли пустыми (автогенерация)
# → При вопросе про Redis: 1 если порт 6379 занят, 1 если свободен

# 3. Открыть порты (если ufw активен)
ufw allow 13777/tcp && ufw allow 3478 && ufw allow 40000:49999/udp

# 4. Убедиться в работе
curl http://YOUR_IP:13777/api/health
# → {"status":"ok",...}
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

- Ключ **одноразовый**, хранится в Redis с TTL (по умолчанию 10 мин)
- После использования мгновенно инвалидируется
- Модератор получает JWT с ролью `moderator`

---

## OBS Browser Source

```
http://YOUR_IP:13777/obs
```

Overlay обновляется в реальном времени через WebSocket (`/overlay` namespace) — без аутентификации, только чтение.

---

## Разработка (без Docker)

```bash
# 1. Redis
docker run -d -p 6379:6379 redis:7-alpine

# 2. Сервер
cd server
cp ../.env.example .env   # REDIS_HOST=localhost
npm install
npm run dev               # порт 3001

# 3. Клиент (другой терминал)
cd client
npm install
npm run dev               # порт 5173, proxy → localhost:3001
```

---

## Структура проекта

```
stream-overlay/
├── install.sh                  # CLI установщик / панель управления
├── docker-compose.yml
├── .env.example
│
├── server/                     # WebRTC Node (Node.js 22 + mediasoup)
│   ├── Dockerfile
│   ├── package-lock.json       # зафиксированные зависимости (npm ci)
│   └── src/
│       ├── index.js
│       ├── config.js
│       ├── api/
│       │   ├── routes.js           # /health (public), /system-info (auth)
│       │   ├── auth-routes.js
│       │   ├── media-routes.js
│       │   └── webrtc-routes.js    # /ice-servers, /stats, /room-stats
│       ├── auth/
│       │   ├── keys.js             # одноразовые ключи (Redis SCAN + TTL)
│       │   └── middleware.js       # JWT + строгая проверка origin
│       ├── webrtc/
│       │   ├── mediasoup-config.js
│       │   └── room.js             # workers + router null-check + setMaxBitrate
│       ├── ws/
│       │   └── socket.js           # / + /overlay (OBS), валидация volume
│       └── utils/
│           ├── logger.js
│           ├── redis.js
│           └── rate-limit.js
│
├── client/                     # Dock Panel (React 18 + Vite + Tailwind)
│   ├── Dockerfile
│   └── src/
│       ├── lib/
│       │   ├── socket.js           # singleton с токен-инвалидацией
│       │   └── webrtc.js           # _request() с 15s timeout
│       ├── hooks/
│       │   ├── useWebRTC.js
│       │   ├── useSocket.js        # cleanup: socket.off в return
│       │   └── useAuth.jsx
│       ├── components/
│       └── pages/
│
├── nginx/
│   └── nginx.conf
│
└── coturn/
    └── turnserver.conf
```

---

## Безопасность

| Механизм | Описание |
|---------|----------|
| JWT | Авторизация API и WebSocket |
| Одноразовые ключи | Redis + TTL, инвалидируются после использования |
| Role-based access | `streamer` / `moderator` на control-события |
| CORS strict | Точное совпадение Origin (не `startsWith`) |
| Rate Limiting | API / auth / upload |
| Helmet | HTTP security headers |
| `.env` chmod 600 | Пароли недоступны другим пользователям системы |
| `/system-info` auth | Эндпоинт с heap/PID требует JWT |
| OBS namespace | Headless-клиенты (без origin) разрешены только в `/overlay` |
| Redis localhost | `127.0.0.1:6379` снаружи, внутри Docker — через сеть |
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
- [x] Exponential backoff для mediasoup workers

### Медиа
- [x] Overlay-изображения, GIF, видео
- [x] Загрузка медиафайлов
- [x] Управление громкостью

### Ops
- [x] CLI установщик с мастером настройки (OwO)
- [x] Выбор режима Redis: Docker или системный (нет конфликта портов)
- [x] Автогенерация паролей
- [x] Healthcheck-polling после `compose up`
- [x] Проверка firewall (ufw/iptables) после деплоя
- [x] Вывод доступов сразу после установки
- [x] Ротация логов Docker (50 МБ × 5 файлов)
- [x] `chmod 600 .env` при каждой записи
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
