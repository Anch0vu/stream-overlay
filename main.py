import asyncio
import json
import logging
import hmac
import hashlib
import base64
import mimetypes
import os
import shutil
import time
import uuid
from collections import deque
from urllib.parse import unquote

from fastapi import (
    APIRouter,
    Body,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from redis.asyncio import Redis

# Структурированная конфигурация логов для сервера.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("stream-overlay")

# Пути проекта и хранилищ данных.
BASE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, "data")
UPLOAD_DIR = os.path.join(BASE, "uploads")
TEMPLATES_DIR = os.path.join(BASE, "templates")
STATIC_DIR = os.path.join(BASE, "static")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
SCENE_PATH = os.path.join(DATA_DIR, "scene.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Конфигурация через переменные окружения.
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
STREAMER_API_TOKEN = os.getenv("STREAMER_API_TOKEN", "change-me")
KEY_TTL_SECONDS = int(os.getenv("MODERATOR_KEY_TTL_SECONDS", "600"))
SESSION_TTL_SECONDS = int(os.getenv("MODERATOR_SESSION_TTL_SECONDS", "3600"))
ALLOWED_ORIGINS = {
    origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "").split(",") if origin.strip()
}
ENABLE_STRICT_ORIGIN = os.getenv("ENABLE_STRICT_ORIGIN", "false").lower() == "true"
WEBRTC_STUN_URL = os.getenv("WEBRTC_STUN_URL", "stun:stun.l.google.com:19302")
WEBRTC_TURN_URL = os.getenv("WEBRTC_TURN_URL", "")
WEBRTC_TURN_USERNAME = os.getenv("WEBRTC_TURN_USERNAME", "")
WEBRTC_TURN_CREDENTIAL = os.getenv("WEBRTC_TURN_CREDENTIAL", "")
WEBRTC_SIGNAL_SECRET = os.getenv("WEBRTC_SIGNAL_SECRET", "change-webrtc-secret")

# Инициализация файлов конфигурации по умолчанию.
if not os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"canvasWidth": 1920, "canvasHeight": 2160, "port": 13337}, f, ensure_ascii=False, indent=2)

if not os.path.exists(SCENE_PATH):
    with open(SCENE_PATH, "w", encoding="utf-8") as f:
        json.dump({"items": []}, f, ensure_ascii=False, indent=2)


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_scene():
    with open(SCENE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_scene(scene):
    tmp = SCENE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SCENE_PATH)


config = load_config()
scene = load_scene()

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Реестр WebSocket клиентов для синхронизации состояния.
overlay_clients: set[WebSocket] = set()
moderator_clients: set[WebSocket] = set()

redis_client: Redis | None = None

# Текущее состояние версии сцены для delta/full синхронизации.
scene_state = {"version": int(scene.get("_version", 0)) if isinstance(scene, dict) else 0}

# Метрики реального времени для QoL и диагностики.
runtime_metrics = {
    "scene_saves": 0,
    "ws_broadcasts": 0,
    "overlay_apply_reports": 0,
    "overlay_apply_latency_ms": deque(maxlen=300),
    "webrtc_signaling_messages": 0,
    "webrtc_rooms_active": 0,
}

# Реестр WebRTC signaling-комнат.
webrtc_rooms: dict[str, dict] = {}


def current_ice_servers() -> list[dict]:
    # Формируем ICE-конфигурацию для браузерных peer-ов.
    servers = [{"urls": [WEBRTC_STUN_URL]}]
    if WEBRTC_TURN_URL and WEBRTC_TURN_USERNAME and WEBRTC_TURN_CREDENTIAL:
        servers.append({
            "urls": [WEBRTC_TURN_URL],
            "username": WEBRTC_TURN_USERNAME,
            "credential": WEBRTC_TURN_CREDENTIAL,
        })
    return servers


def make_webrtc_token(room: str, role: str, ttl_sec: int = 300) -> str:
    # Генерируем подписанный токен доступа для signaling websocket.
    exp = int(time.time()) + max(10, int(ttl_sec))
    payload = f"{room}|{role}|{exp}"
    sig = hmac.new(WEBRTC_SIGNAL_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}|{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def verify_webrtc_token(token: str, room: str, role: str) -> bool:
    # Проверяем подпись и срок годности токена signaling websocket.
    try:
        raw = base64.urlsafe_b64decode((token or "").encode("utf-8")).decode("utf-8")
        tok_room, tok_role, tok_exp, tok_sig = raw.split("|", 3)
        if tok_room != room or tok_role != role:
            return False
        if int(tok_exp) < int(time.time()):
            return False
        payload = f"{tok_room}|{tok_role}|{tok_exp}"
        sig = hmac.new(WEBRTC_SIGNAL_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, tok_sig)
    except Exception:
        return False


def update_webrtc_room_metrics():
    # Обновляем счётчик активных signaling-комнат.
    runtime_metrics["webrtc_rooms_active"] = sum(1 for room in webrtc_rooms.values() if room.get("publisher") or room.get("viewers"))


def ensure_webrtc_room(room: str) -> dict:
    # Ленивая инициализация структуры комнаты.
    if room not in webrtc_rooms:
        webrtc_rooms[room] = {"publisher": None, "viewers": set(), "publisher_metrics": None}
    return webrtc_rooms[room]


async def webrtc_send(ws: WebSocket, payload: dict):
    # Безопасная отправка signaling-сообщения.
    try:
        await ws.send_text(json.dumps(payload, ensure_ascii=False))
    except Exception:
        pass


async def broadcast_webrtc_room_state(room: str):
    # Рассылаем участникам текущее состояние комнаты.
    entry = webrtc_rooms.get(room)
    if not entry:
        return
    payload = {
        "type": "room.state",
        "room": room,
        "publisher": bool(entry.get("publisher")),
        "viewers": len(entry.get("viewers", set())),
    }
    if entry.get("publisher"):
        await webrtc_send(entry["publisher"], payload)
    for vw in list(entry.get("viewers", set())):
        await webrtc_send(vw, payload)


def bump_scene_version() -> int:
    # Увеличение версии сцены после каждого подтвержденного изменения.
    scene_state["version"] += 1
    return scene_state["version"]


def scene_payload(scene_obj: dict) -> dict:
    # Унифицированная нагрузка полной сцены с версией и timestamp.
    return {
        "type": "scene.full",
        "scene": scene_obj,
        "version": scene_state["version"],
        "server_ts": int(time.time() * 1000),
    }


def metrics_latency_avg(values) -> float:
    # Средняя задержка применения сцены на overlay.
    if not values:
        return 0.0
    return round(sum(values) / len(values), 2)


@app.on_event("startup")
async def startup_event():
    # Подключение к Redis при запуске приложения (не валим веб при недоступности Redis).
    global redis_client
    try:
        redis_client = Redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        await redis_client.ping()
        logger.info("redis_connected", extra={"redis_url": REDIS_URL})
    except Exception as e:
        redis_client = None
        logger.warning("redis_unavailable_on_startup", extra={"error": str(e), "redis_url": REDIS_URL})


@app.on_event("shutdown")
async def shutdown_event():
    # Корректное закрытие пула соединений Redis.
    if redis_client is not None:
        await redis_client.aclose()


async def get_redis() -> Redis:
    # Гарантированно получаем рабочее Redis соединение.
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis unavailable")
    return redis_client


def validate_origin(origin: str | None):
    # Проверка Origin для защиты от неавторизованных источников.
    if not ENABLE_STRICT_ORIGIN:
        return
    if not origin or origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin forbidden")


async def enforce_rate_limit(subject: str, bucket: str, limit: int, window_sec: int):
    # Ограничение частоты запросов на базе Redis INCR/EXPIRE.
    # В degraded-режиме (без Redis) не блокируем основной функционал.
    if redis_client is None:
        return
    redis = await get_redis()
    now_window = int(time.time() // window_sec)
    key = f"rl:{bucket}:{subject}:{now_window}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_sec + 2)
    if count > limit:
        raise HTTPException(status_code=429, detail="Too many requests")


async def ws_broadcast(msg: dict, targets=None):
    runtime_metrics["ws_broadcasts"] += 1
    data = json.dumps(msg, ensure_ascii=False)
    targets = targets or (overlay_clients | moderator_clients)
    dead = []
    for ws in targets:
        try:
            await ws.send_text(data)
        except Exception as e:
            logger.error("ws_send_failed", extra={"error": str(e)})
            dead.append(ws)
    for ws in dead:
        overlay_clients.discard(ws)
        moderator_clients.discard(ws)


def _normalize_item(it: dict) -> dict:
    it.setdefault("id", "i" + uuid.uuid4().hex[:8])
    it.setdefault("kind", "text")
    it.setdefault("x", 100)
    it.setdefault("y", 100)
    if it["kind"] == "text":
        it.setdefault("w", 600)
        it.setdefault("text", "New text")
        it.setdefault("fontSize", 40)
        it.setdefault("color", "#ffffff")
        it.setdefault("bg", "transparent")
    elif it["kind"] in ("image", "video"):
        it.setdefault("w", 320)
        it.setdefault("h", 240)
        it.setdefault("src", "")
    else:
        it.setdefault("w", 320)
        it.setdefault("h", 240)
    it.setdefault("z", 1)
    return it


@app.get("/", response_class=HTMLResponse)
async def overlay_page(request: Request):
    return templates.TemplateResponse("overlay.html", {"request": request, "cfg": config})


@app.get("/preview", response_class=HTMLResponse)
async def overlay_preview_page(request: Request):
    # Удобный алиас для внешних preview-вкладок.
    return templates.TemplateResponse("overlay.html", {"request": request, "cfg": config})


@app.get("/health")
async def healthcheck():
    # Быстрая проверка доступности сервера и Redis.
    redis_ok = False
    if redis_client is not None:
        try:
            redis_ok = bool(await redis_client.ping())
        except Exception:
            redis_ok = False
    return {"ok": True, "redis": redis_ok}


@app.get("/moderator", response_class=HTMLResponse)
async def moderator_page(request: Request):
    return templates.TemplateResponse("mod_panel.html", {"request": request, "cfg": config, "scene": scene})


def _safe_rel_upload(path: str) -> str:
    # Запрет выхода за пределы директории uploads.
    path = (path or "").lstrip("/").replace("\\", "/")
    if path.startswith("uploads/"):
        path = path[len("uploads/"):]
    rel = os.path.normpath(path)
    if rel.startswith(".."):
        raise HTTPException(400, "bad path")
    return rel


ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"]


@app.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), folder: str = Form(None)):
    validate_origin(request.headers.get("origin"))
    await enforce_rate_limit(request.client.host if request.client else "unknown", "upload", 20, 60)

    if not file.filename:
        raise HTTPException(400, "No filename")
    mime = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
    if not any(mime.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
        raise HTTPException(400, "Unsupported file type")

    rel_folder = _safe_rel_upload(folder or "")
    dest_dir = os.path.join(UPLOAD_DIR, rel_folder)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, file.filename)

    with open(dest_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return {"ok": True, "path": "/uploads/" + os.path.join(rel_folder, file.filename).replace("\\", "/"), "mime": mime}


@app.get("/api/uploads")
async def api_uploads():
    files = []
    for root, _, fps in os.walk(UPLOAD_DIR):
        for n in fps:
            p = os.path.join(root, n)
            try:
                st = os.stat(p)
            except FileNotFoundError:
                continue
            rel = os.path.relpath(p, UPLOAD_DIR).replace("\\", "/")
            mime = mimetypes.guess_type(n)[0] or ""
            files.append({"name": n, "rel": rel, "path": "/uploads/" + rel, "size": st.st_size, "mime": mime})
    files.sort(key=lambda x: x["name"].lower())
    return {"files": files}


@app.delete("/api/uploads")
def api_delete_upload(path: str):
    safe_rel = path.strip("/\\")
    abs_path = os.path.abspath(os.path.join(UPLOAD_DIR, safe_rel))
    if not abs_path.startswith(os.path.abspath(UPLOAD_DIR) + os.sep):
        raise HTTPException(status_code=400, detail="Bad path")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Not found")
    if os.path.isdir(abs_path):
        shutil.rmtree(abs_path)
    else:
        os.remove(abs_path)
    return {"ok": True, "deleted": safe_rel}


@app.post("/api/moderator-keys/generate")
async def generate_moderator_key(request: Request, streamer_id: str = Form("streamer")):
    # Генерация одноразового ключа с TTL в Redis.
    validate_origin(request.headers.get("origin"))
    token = request.headers.get("x-streamer-token")
    if token != STREAMER_API_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")

    subject = request.client.host if request.client else "unknown"
    await enforce_rate_limit(subject, "modkey_generate", 10, 60)

    redis = await get_redis()
    key = str(uuid.uuid4())
    redis_key = f"modkey:{key}"
    await redis.setex(redis_key, KEY_TTL_SECONDS, streamer_id)
    return {"ok": True, "key": key, "ttl": KEY_TTL_SECONDS}


@app.post("/api/moderator-keys/consume")
async def consume_moderator_key(request: Request, key: str = Form(...)):
    # Погашение ключа и создание временной сессии модератора.
    validate_origin(request.headers.get("origin"))
    subject = request.client.host if request.client else "unknown"
    await enforce_rate_limit(subject, "modkey_consume", 20, 60)

    redis = await get_redis()
    redis_key = f"modkey:{key.strip()}"
    streamer_id = await redis.get(redis_key)
    if not streamer_id:
        raise HTTPException(status_code=400, detail="Invalid or expired key")

    await redis.delete(redis_key)
    session = str(uuid.uuid4())
    await redis.setex(f"modsess:{session}", SESSION_TTL_SECONDS, streamer_id)
    return {"ok": True, "session": session, "ttl": SESSION_TTL_SECONDS}


async def validate_moderator_session(session: str | None) -> str:
    # Проверка действительности сессии модератора.
    if not session:
        raise HTTPException(status_code=401, detail="Session required")
    redis = await get_redis()
    streamer_id = await redis.get(f"modsess:{session}")
    if not streamer_id:
        raise HTTPException(status_code=401, detail="Session expired")
    return streamer_id


@app.websocket("/ws/moderator")
async def ws_moderator(ws: WebSocket):
    # Вебсокет модератора принимает только валидную сессию.
    await ws.accept()
    try:
        if ENABLE_STRICT_ORIGIN:
            origin = ws.headers.get("origin")
            if not origin or origin not in ALLOWED_ORIGINS:
                await ws.close(code=1008)
                return

        session = ws.query_params.get("session")
        await validate_moderator_session(session)

        moderator_clients.add(ws)
        await ws.send_json(scene_payload(load_scene()))

        while True:
            data = await ws.receive_json()
            t = data.get("type")

            if t == "add":
                item = _normalize_item(data.get("item", {}) or {})
                scene_data = load_scene()
                scene_data.setdefault("items", [])
                scene_data["items"].append(item)
                save_scene(scene_data)
                bump_scene_version()
                await ws_broadcast({"type": "scene.add", "item": item, "version": scene_state["version"]})

            elif t == "update":
                item = data.get("item", {}) or {}
                scene_data = load_scene()
                items = scene_data.setdefault("items", [])
                for i, it in enumerate(items):
                    if it.get("id") == item.get("id"):
                        items[i] = item
                        break
                else:
                    items.append(item)
                save_scene(scene_data)
                bump_scene_version()
                await ws_broadcast({"type": "scene.update", "item": item, "version": scene_state["version"]})

            elif t == "remove":
                _id = data.get("id")
                scene_data = load_scene()
                scene_data["items"] = [it for it in scene_data.get("items", []) if it.get("id") != _id]
                save_scene(scene_data)
                bump_scene_version()
                await ws_broadcast({"type": "scene.remove", "id": _id, "version": scene_state["version"]})

            elif t == "bringToFront":
                _id = data.get("id")
                scene_data = load_scene()
                items = scene_data.get("items", [])
                maxz = max([it.get("z", 1) for it in items], default=1)
                for it in items:
                    if it.get("id") == _id:
                        it["z"] = maxz + 1
                        break
                save_scene(scene_data)
                bump_scene_version()
                await ws_broadcast(scene_payload(scene_data))

            elif t == "clear":
                scene_data = {"items": []}
                save_scene(scene_data)
                bump_scene_version()
                await ws_broadcast({"type": "scene.clear", "version": scene_state["version"]})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws_moderator_failed", extra={"error": str(e)})
    finally:
        moderator_clients.discard(ws)


@app.websocket("/ws/overlay")
async def ws_overlay(ws: WebSocket):
    await ws.accept()
    overlay_clients.add(ws)
    try:
        await ws.send_text(json.dumps(scene_payload(load_scene()), ensure_ascii=False))
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws_overlay_failed", extra={"error": str(e)})
    finally:
        overlay_clients.discard(ws)


_api_fb = APIRouter()


@_api_fb.get("/api/scene")
def fb_get_scene():
    try:
        with open(SCENE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            data.setdefault("_version", scene_state["version"])
            return data
    except FileNotFoundError:
        return {"items": [], "_version": scene_state["version"]}


@_api_fb.put("/api/scene")
async def fb_put_scene(payload: dict):
    # Сохраняем сцену батчем и пушим полную версию только по факту изменения.
    if not isinstance(payload, dict):
        raise HTTPException(400, "payload must be object")

    meta = payload.pop("_meta", {}) if isinstance(payload.get("_meta"), dict) else {}
    payload.setdefault("items", [])

    new_version = bump_scene_version()
    payload["_version"] = new_version
    os.makedirs(os.path.dirname(SCENE_PATH), exist_ok=True)
    with open(SCENE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    runtime_metrics["scene_saves"] += 1
    await ws_broadcast(scene_payload(payload))
    return JSONResponse({
        "ok": True,
        "version": new_version,
        "server_ts": int(time.time() * 1000),
        "echo_client_ts": meta.get("client_ts"),
    })


@_api_fb.delete("/api/uploads/{name}")
def fb_delete_upload(name: str):
    name = os.path.basename(unquote(name))
    path = os.path.join(UPLOAD_DIR, name)
    if not os.path.isfile(path):
        raise HTTPException(404, "file not found")
    os.remove(path)
    return {"ok": True}


def _route_exists(path, method):
    for r in app.router.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
            return True
    return False


if not _route_exists("/api/scene", "GET"):
    app.include_router(_api_fb)


@app.post("/api/media/play")
async def api_media_play(id: str = Form(...), url: str = Form(...), loop: bool = Form(True)):
    payload = {"type": "media.play", "id": id, "url": url, "loop": loop}
    for ws in list(overlay_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            pass
    return {"ok": True, **payload}


@app.post("/api/media/stop")
async def api_media_stop(id: str = Form(...)):
    payload = {"type": "media.stop", "id": id}
    for ws in list(overlay_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            pass
    return {"ok": True, **payload}


@app.post("/api/tts/speak")
async def api_tts_speak(request: Request, payload: dict = Body(...)):
    # Отправка команды TTS на overlay-клиенты в реальном времени.
    validate_origin(request.headers.get("origin"))
    subject = request.client.host if request.client else "unknown"
    await enforce_rate_limit(subject, "tts_speak", 30, 60)

    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    message = {
        "type": "tts.speak",
        "text": text,
        "lang": str(payload.get("lang") or "ru-RU"),
        "rate": float(payload.get("rate") if payload.get("rate") is not None else 1.0),
        "pitch": float(payload.get("pitch") if payload.get("pitch") is not None else 1.0),
        "volume": float(payload.get("volume") if payload.get("volume") is not None else 1.0),
        "voiceName": str(payload.get("voiceName") or ""),
    }
    await ws_broadcast(message, targets=overlay_clients)
    return {"ok": True, **message}


@app.post("/api/overlay/applied")
async def api_overlay_applied(payload: dict = Body(...)):
    # Overlay сообщает факт применения версии сцены для расчета задержки.
    runtime_metrics["overlay_apply_reports"] += 1
    version = int(payload.get("version") or 0)
    client_ts = payload.get("client_ts")
    server_ts = payload.get("server_ts")

    try:
        if server_ts is not None:
            latency = int(time.time() * 1000) - int(server_ts)
            if 0 <= latency <= 600000:
                runtime_metrics["overlay_apply_latency_ms"].append(latency)
    except Exception:
        pass

    return {
        "ok": True,
        "version": version,
        "received_client_ts": client_ts,
    }


@app.get("/api/metrics/realtime")
async def api_metrics_realtime():
    # Сводка метрик QoL/производительности для панели диагностики.
    latencies = list(runtime_metrics["overlay_apply_latency_ms"])
    return {
        "ok": True,
        "scene_version": scene_state["version"],
        "scene_saves": runtime_metrics["scene_saves"],
        "ws_broadcasts": runtime_metrics["ws_broadcasts"],
        "overlay_apply_reports": runtime_metrics["overlay_apply_reports"],
        "overlay_apply_latency_avg_ms": metrics_latency_avg(latencies),
        "overlay_apply_latency_p95_ms": (sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0),
        "webrtc_signaling_messages": runtime_metrics["webrtc_signaling_messages"],
        "webrtc_rooms_active": runtime_metrics["webrtc_rooms_active"],
    }




@app.get("/api/webrtc/config")
async def api_webrtc_config():
    # Выдача ICE-конфигурации для WebRTC peer connection.
    return {"ok": True, "iceServers": current_ice_servers()}


@app.post("/api/webrtc/token")
async def api_webrtc_token(request: Request, payload: dict = Body(...)):
    # Выдача временного токена для роли publisher/viewer в комнате.
    token = request.headers.get("x-streamer-token")
    if token != STREAMER_API_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")

    room = str(payload.get("room") or "default").strip()
    role = str(payload.get("role") or "viewer").strip().lower()
    ttl = int(payload.get("ttl") or 300)
    if role not in {"publisher", "viewer"}:
        raise HTTPException(status_code=400, detail="role must be publisher/viewer")

    signed = make_webrtc_token(room=room, role=role, ttl_sec=ttl)
    ws_scheme = "wss" if (request.url.scheme == "https") else "ws"
    ws_url = f"{ws_scheme}://{request.url.netloc}/ws/webrtc/{room}/{role}?token={signed}"
    return {"ok": True, "room": room, "role": role, "ttl": ttl, "token": signed, "ws_url": ws_url}


@app.get("/api/webrtc/rooms/{room}/stats")
async def api_webrtc_room_stats(room: str):
    # Статистика комнаты WebRTC для панели диагностики.
    entry = webrtc_rooms.get(room, {"publisher": None, "viewers": set(), "publisher_metrics": None})
    pub_metrics = entry.get("publisher_metrics")
    return {
        "ok": True,
        "room": room,
        "publisher_online": bool(entry.get("publisher")),
        "viewers": len(entry.get("viewers", set())),
        "publisher_metrics": pub_metrics,
    }


@app.websocket("/ws/webrtc/{room}/{role}")
async def ws_webrtc_signaling(ws: WebSocket, room: str, role: str):
    # Signaling-канал WebRTC: publisher/viewer в рамках комнаты.
    await ws.accept()

    role = (role or "").strip().lower()
    if role not in {"publisher", "viewer"}:
        await ws.close(code=1008)
        return

    ws_token = ws.query_params.get("token")
    if not verify_webrtc_token(ws_token or "", room=room, role=role):
        await ws.close(code=1008)
        return

    entry = ensure_webrtc_room(room)

    if role == "publisher":
        old_pub = entry.get("publisher")
        if old_pub and old_pub is not ws:
            await webrtc_send(old_pub, {"type": "publisher.replaced", "room": room})
            try:
                await old_pub.close(code=1012)
            except Exception:
                pass
        entry["publisher"] = ws
    else:
        entry.setdefault("viewers", set()).add(ws)

    update_webrtc_room_metrics()
    await broadcast_webrtc_room_state(room)

    try:
        while True:
            raw = await ws.receive_text()
            runtime_metrics["webrtc_signaling_messages"] += 1

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await webrtc_send(ws, {"type": "error", "detail": "bad_json"})
                continue

            mtype = str(msg.get("type") or "")

            if mtype == "ping":
                await webrtc_send(ws, {"type": "pong", "ts": int(time.time() * 1000)})
                continue

            if role == "publisher":
                if mtype in {"offer", "ice-candidate", "publisher.metrics"}:
                    if mtype == "publisher.metrics":
                        entry["publisher_metrics"] = {
                            "data": msg.get("metrics", {}),
                            "updated_ts": int(time.time() * 1000),
                        }
                    payload = {**msg, "from": "publisher", "room": room}
                    for vw in list(entry.get("viewers", set())):
                        await webrtc_send(vw, payload)
                continue

            if role == "viewer":
                pub = entry.get("publisher")
                if not pub:
                    await webrtc_send(ws, {"type": "error", "detail": "publisher_offline"})
                    continue

                if mtype in {"answer", "ice-candidate", "viewer.request-keyframe"}:
                    payload = {**msg, "from": "viewer", "room": room}
                    await webrtc_send(pub, payload)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws_webrtc_failed", extra={"error": str(e), "room": room, "role": role})
    finally:
        entry = webrtc_rooms.get(room)
        if entry:
            if role == "publisher" and entry.get("publisher") is ws:
                entry["publisher"] = None
            if role == "viewer":
                entry.get("viewers", set()).discard(ws)

            if not entry.get("publisher") and not entry.get("viewers"):
                webrtc_rooms.pop(room, None)

        update_webrtc_room_metrics()
        await broadcast_webrtc_room_state(room)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=config.get("port", 5000), reload=False)
