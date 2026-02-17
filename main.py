import asyncio
import json
import logging
import mimetypes
import os
import shutil
import time
import uuid
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
        await ws.send_json({"type": "scene.full", "scene": load_scene()})

        while True:
            data = await ws.receive_json()
            t = data.get("type")

            if t == "add":
                item = _normalize_item(data.get("item", {}) or {})
                scene_data = load_scene()
                scene_data.setdefault("items", [])
                scene_data["items"].append(item)
                save_scene(scene_data)
                await ws_broadcast({"type": "scene.add", "item": item})

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
                await ws_broadcast({"type": "scene.update", "item": item})

            elif t == "remove":
                _id = data.get("id")
                scene_data = load_scene()
                scene_data["items"] = [it for it in scene_data.get("items", []) if it.get("id") != _id]
                save_scene(scene_data)
                await ws_broadcast({"type": "scene.remove", "id": _id})

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
                await ws_broadcast({"type": "scene.full", "scene": scene_data})

            elif t == "clear":
                scene_data = {"items": []}
                save_scene(scene_data)
                await ws_broadcast({"type": "scene.clear"})
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
        await ws.send_text(json.dumps({"type": "scene.full", "scene": load_scene()}, ensure_ascii=False))
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
    # Сохраняем сцену и сразу пушим полный снапшот в overlay/moderator.
    if not isinstance(payload, dict):
        raise HTTPException(400, "payload must be object")

    meta = payload.pop("_meta", {}) if isinstance(payload.get("_meta"), dict) else {}
    payload.setdefault("items", [])

    new_version = bump_scene_version()
    payload["_version"] = new_version
    os.makedirs(os.path.dirname(SCENE_PATH), exist_ok=True)
    with open(SCENE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    await ws_broadcast({"type": "scene.full", "scene": payload})
    return JSONResponse({"ok": True})


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
    }
    await ws_broadcast(message, targets=overlay_clients)
    return {"ok": True, **message}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=config.get("port", 5000), reload=False)
