# Stream Overlay / OnionRP Dock MVP

MVP-платформа для управления стрим-оверлеем и одноразовыми ключами модераторов.

## Что реализовано в этом этапе

- FastAPI-приложение для overlay и moderator-панели.
- WebSocket-синхронизация сцены в реальном времени без лишних перезапусков media.
- Загрузка медиафайлов с базовой валидацией MIME.
- Генерация и погашение одноразовых ключей модераторов через Redis TTL.
- TTS-команды для озвучки текста в overlay (через браузерный SpeechSynthesis).
- Несколько TTS-профилей в панели (Normal / Announcer / Robot) и выбор голоса по имени.
- Настраиваемые темы панели (Dark / Turquoise / Midnight) с сохранением выбора в браузере.
- Сессии модераторов через Redis (в памяти процесса ключи не хранятся).
- Базовая защита: rate limit для критичных API, проверка Origin (опционально).
- Production-сборка контейнера web через `Dockerfile` (без bind mount исходников).
- Docker Compose с сервисами `web`, `webrtc-node`, `redis`, `media-storage`, `nginx` (опционально), `coturn`.

## Быстрый запуск (интерактивный установщик)

Есть минималистичный installer в стиле «мастер-настройки» (TUI через `whiptail`):

```bash
git clone https://github.com/Anch0vu/stream-overlay.git
cd stream-overlay
chmod +x scripts/install.sh
./scripts/install.sh
```

Установщик умеет:
- выбрать режим публикации (`direct`, `edge`, `reverse`),
- выбрать внешний порт web (`APP_HTTP_PORT`),
- задать `STREAMER_API_TOKEN`,
- запустить `docker compose build web && docker compose up -d` (с profile `edge` при необходимости).

> Если `whiptail` не установлен, скрипт переключится в обычные консольные вопросы.

---

## Ручной запуск (3 режима)

```bash
git clone https://github.com/Anch0vu/stream-overlay.git
cd stream-overlay
cp .env.example .env
# отредактируйте STREAMER_API_TOKEN и порты
```

### 1) Direct mode (рекомендуется для VPS с несколькими сайтами)

Без встроенного nginx-контейнера, только web на произвольном порту:

```bash
APP_HTTP_PORT=13337 docker compose up -d --build web redis media-storage webrtc-node coturn
```

Проверка:

```bash
docker compose ps
docker compose logs -f web
```

Открывайте приложение на `http://<VPS_IP>:13337` (или вашем порту).

### 2) Edge mode (встроенный nginx в compose)

Если хотите публиковать из этого проекта напрямую через nginx-контейнер (HTTP):

```bash
NGINX_HTTP_PORT=80 docker compose --profile edge up -d --build
```

> Важно: если порт `80` уже занят (как у вас в логе), задайте другой, например `NGINX_HTTP_PORT=8080`.

### 3) Reverse proxy mode (существующий nginx/caddy/traefik)

Запускаете только `web` на внутреннем порту (например 13337), а внешний TLS/домены обслуживает ваш основной reverse proxy.

```bash
APP_HTTP_PORT=13337 docker compose up -d --build web redis media-storage webrtc-node coturn
```

Дальше проксируете домен(ы) на `127.0.0.1:13337`.

---

## Пример host Nginx (reverse proxy)

`/etc/nginx/sites-available/stream-overlay.conf`:

```nginx
server {
    listen 80;
    server_name overlay.example.com;

    location / {
        proxy_pass http://127.0.0.1:13337;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:13337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/stream-overlay.conf /etc/nginx/sites-enabled/stream-overlay.conf
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS через Let's Encrypt + certbot

После настройки DNS на ваш VPS:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d overlay.example.com
```

Проверка автообновления:

```bash
sudo certbot renew --dry-run
```

---


## Troubleshooting (важно для вашей ошибки)

### `failed to bind host port 0.0.0.0:80: address already in use`

Это значит, что на VPS уже работает другой сервис на 80 порту. Варианты:

1. Не запускать встроенный nginx (режим `direct`/`reverse`) и использовать ваш текущий host reverse-proxy.
2. Запускать встроенный nginx на другом порту: `NGINX_HTTP_PORT=8080 docker compose --profile edge up -d`.

### В браузере `HTTP ERROR 502`

Чаще всего это проблема upstream в внешнем reverse-proxy:

- убедитесь, что `web` контейнер поднят и слушает `APP_HTTP_PORT` (`docker compose ps`, `docker compose logs -f web`);
- для host nginx `proxy_pass` должен смотреть в `http://127.0.0.1:<APP_HTTP_PORT>`;
- проверьте, что блок `/ws/` проксируется с `Upgrade/Connection` хедерами (см. пример выше).

---

## Git hygiene для production

Перед релизом проверьте, что скрипты и инфраструктурные файлы реально попадают в git:

```bash
git status
git ls-files scripts
git check-ignore -v scripts/install.sh scripts/check_merge_conflicts.sh || true
```

Ожидаемо:
- `.sh` файлы в `scripts/` **не** игнорируются и видны в `git ls-files`;
- `uploads/` игнорируется, но `uploads/.gitkeep` версионируется для корректной структуры проекта.

---

## Важные переменные окружения

- `REDIS_URL` — строка подключения к Redis.
- `STREAMER_API_TOKEN` — токен стримера для генерации ключей.
- `MODERATOR_KEY_TTL_SECONDS` — TTL одноразового ключа.
- `MODERATOR_SESSION_TTL_SECONDS` — TTL сессии модератора.
- `ENABLE_STRICT_ORIGIN` — включение строгой проверки Origin.
- `ALLOWED_ORIGINS` — список разрешённых Origin через запятую.
- `APP_HTTP_PORT` — внешний порт web-сервиса (docker compose mapping).
- `NGINX_HTTP_PORT` — внешний порт встроенного nginx (режим `edge`).

## API одноразовых ключей

### 1) Генерация ключа

`POST /api/moderator-keys/generate`

- Header: `x-streamer-token: <STREAMER_API_TOKEN>`
- Form: `streamer_id` (опционально)

### 2) Погашение ключа

`POST /api/moderator-keys/consume`

- Form: `key`

Ответ вернёт `session`, который передаётся в WebSocket:

`/ws/moderator?session=<session>`

## API TTS

`POST /api/tts/speak`

JSON body:

- `text` — обязательный текст для озвучки
- `lang` — например `ru-RU`
- `rate`, `pitch`, `volume` — параметры голоса
- `voiceName` — опционально, подстрока имени голоса

Команда отправляется в overlay через WebSocket-событие `tts.speak`.

## Примечание по storage в контейнерах

- Код приложения находится внутри образа `web`.
- Для пользовательских данных используются именованные docker-тома:
  - `app-uploads` → `/app/uploads`
  - `app-data` → `/app/data`

## QoL / производительность

- В `mod_panel` сохранение сцены идёт через debounce/batch (меньше лишних PUT при drag/клавишах).
- Каждое сохранение сцены получает версию (`_version`) и рассылается как `scene.full` с `version` и `server_ts`.
- Overlay отправляет подтверждение применения версии в `POST /api/overlay/applied`.
- Сводка realtime-метрик доступна по `GET /api/metrics/realtime`.

## WebRTC signaling (MVP)

Реализован signaling-контур для комнаты `publisher/viewer`:

- `GET /api/webrtc/config` — ICE-конфиг (`STUN/TURN`) из env.
- `POST /api/webrtc/token` — выдача signed токена на роль `publisher/viewer` (под `x-streamer-token`).
- В мод-панели токен streamer теперь вводится отдельным полем (без prompt), затем генерируется готовый `ws_url`.
- `GET /api/webrtc/rooms/{room}/stats` — диагностика комнаты (publisher/viewers/metrics).
- `WS /ws/webrtc/{room}/publisher?token=...` — канал паблишера.
- `WS /ws/webrtc/{room}/viewer?token=...` — канал viewer/consumer.

Поддерживаемые signaling-сообщения:

- publisher -> viewer: `offer`, `ice-candidate`, `publisher.metrics`
- viewer -> publisher: `answer`, `ice-candidate`, `viewer.request-keyframe`
- служебные: `ping`/`pong`, `room.state`

Для overlay можно включить WebRTC viewer режим query-параметром:

`/preview?webrtc_room=<room_name>&webrtc_token=<viewer_token>`

## Статус Twitch

Реализация Twitch отложена по запросу: в текущем этапе фокус на стабильности WebRTC/QoL.

## Проверка merge-конфликтов

Перед пушем можно быстро проверить, что в репозитории не осталось маркеров `<<<<<<<`, `=======`, `>>>>>>>`:

```bash
./scripts/check_merge_conflicts.sh
```

## Ограничения текущего MVP

- `webrtc-node` пока заглушка-контейнер для дальнейшей интеграции mediasoup/pion.
- Не реализована полноценная медиаматрица метрик (fps/bitrate/loss/latency) — это следующий этап.
