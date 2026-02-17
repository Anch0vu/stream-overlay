# Stream Overlay / OnionRP Dock MVP

MVP-платформа для управления стрим-оверлеем и одноразовыми ключами модераторов.

## Что реализовано в этом этапе

- FastAPI-приложение для overlay и moderator-панели.
- WebSocket-синхронизация сцены в реальном времени без лишних перезапусков media.
- Загрузка медиафайлов с базовой валидацией MIME.
- Генерация и погашение одноразовых ключей модераторов через Redis TTL.
- TTS-команды для озвучки текста в overlay (через браузерный SpeechSynthesis).
- Сессии модераторов через Redis (в памяти процесса ключи не хранятся).
- Базовая защита: rate limit для критичных API, проверка Origin (опционально).
- Production-сборка контейнера web через `Dockerfile` (без bind mount исходников).
- Docker Compose с сервисами `web`, `webrtc-node`, `redis`, `media-storage`, `nginx`, `coturn`.

## Запуск на VPS (production)

```bash
git clone <URL_РЕПО>.git
cd stream-overlay
cp .env.example .env
# отредактируйте STREAMER_API_TOKEN и остальные значения

docker compose build web
docker compose up -d
```

Проверка статуса:

```bash
docker compose ps
docker compose logs -f web
```

Приложение будет доступно на `http://<VPS_IP>/`.

## Важные переменные окружения

- `REDIS_URL` — строка подключения к Redis.
- `STREAMER_API_TOKEN` — токен стримера для генерации ключей.
- `MODERATOR_KEY_TTL_SECONDS` — TTL одноразового ключа.
- `MODERATOR_SESSION_TTL_SECONDS` — TTL сессии модератора.
- `ENABLE_STRICT_ORIGIN` — включение строгой проверки Origin.
- `ALLOWED_ORIGINS` — список разрешённых Origin через запятую.

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
- `GET /api/webrtc/rooms/{room}/stats` — диагностика комнаты (publisher/viewers/metrics).
- `WS /ws/webrtc/{room}/publisher?token=...` — канал паблишера.
- `WS /ws/webrtc/{room}/viewer?token=...` — канал viewer/consumer.

Поддерживаемые signaling-сообщения:

- publisher -> viewer: `offer`, `ice-candidate`, `publisher.metrics`
- viewer -> publisher: `answer`, `ice-candidate`, `viewer.request-keyframe`
- служебные: `ping`/`pong`, `room.state`

Для overlay можно включить WebRTC viewer режим query-параметром:

`/preview?webrtc_room=<room_name>`

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
