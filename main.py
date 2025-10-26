import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os, json, uuid, shutil, mimetypes, asyncio

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------- paths ----------
BASE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, "data")
UPLOAD_DIR = os.path.join(BASE, "uploads")
TEMPLATES_DIR = os.path.join(BASE, "templates")
STATIC_DIR = os.path.join(BASE, "static")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
SCENE_PATH = os.path.join(DATA_DIR, "scene.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------- defaults ----------
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
    globals()['scene'] = load_scene()

config = load_config()
scene = load_scene()

# ---------- app ----------
app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# ---------- websockets ----------
overlay_clients: set[WebSocket] = set()
moderator_clients: set[WebSocket] = set()

async def ws_broadcast(msg: dict, targets=None):
    data = json.dumps(msg, ensure_ascii=False)
    targets = targets or (overlay_clients | moderator_clients)
    dead = []
    for ws in targets:
        try:
            await ws.send_text(data)
        except Exception as e:
            logger.error(f"Error sending to websocket: {e}")
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

def _find_idx(item_id: str) -> int:
    for i, it in enumerate(scene["items"]):
        if it["id"] == item_id:
            return i
    return -1

# ---------- pages ----------
@app.get("/", response_class=HTMLResponse)
async def overlay_page(request: Request):
    return templates.TemplateResponse("overlay.html", {"request": request, "cfg": config})

@app.get("/moderator", response_class=HTMLResponse)
async def moderator_page(request: Request):
    return templates.TemplateResponse("mod_panel.html", {"request": request, "cfg": config, "scene": scene})

# ---------- uploads API ----------
def _safe_rel_upload(path: str) -> str:
    # запрет выхода за пределы uploads
    path = (path or "").lstrip("/").replace("\\", "/")
    if path.startswith("uploads/"):
        path = path[len("uploads/"):]
    rel = os.path.normpath(path)
    if rel.startswith(".."):
        raise HTTPException(400, "bad path")
    return rel

ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"]

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), folder: str = Form(None)):
    if not file.filename:
        raise HTTPException(400, "No filename")
    mime = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
    if not any(mime.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
        raise HTTPException(400, "Unsupported file type")
    name = file.filename
    rel_folder = _safe_rel_upload(folder or "")
    dest_dir = os.path.join(UPLOAD_DIR, rel_folder)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, name)
    # write safely
    with open(dest_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    return {"ok": True, "path": "/uploads/" + os.path.join(rel_folder, name).replace("\\", "/"), "mime": mime}

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
            files.append({
                "name": n,
                "rel": rel,
                "path": "/uploads/" + rel,
                "size": st.st_size,
                "mime": mime
            })
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

# ---------- websocket handlers ----------
@app.websocket("/ws/moderator")
async def ws_moderator(ws: WebSocket):
    await ws.accept()
    moderator_clients.add(ws)
    try:
        # отдать актуальную сцену при подключении
        await ws.send_json({"type": "scene.full", "scene": load_scene()})

        while True:
            data = await ws.receive_json()
            t = data.get("type")

            if t == "add":
                item = data.get("item", {}) or {}
                item = _normalize_item(item)
                scene = load_scene()
                scene.setdefault("items", [])
                scene["items"].append(item)
                save_scene(scene)
                await ws_broadcast({"type": "scene.add", "item": item})

            elif t == "update":
                item = data.get("item", {}) or {}
                scene = load_scene()
                items = scene.setdefault("items", [])
                for i, it in enumerate(items):
                    if it.get("id") == item.get("id"):
                        items[i] = item
                        break
                else:
                    items.append(item)
                save_scene(scene)
                await ws_broadcast({"type": "scene.update", "item": item})

            elif t == "remove":
                _id = data.get("id")
                scene = load_scene()
                scene["items"] = [it for it in scene.get("items", []) if it.get("id") != _id]
                save_scene(scene)
                await ws_broadcast({"type": "scene.remove", "id": _id})

            elif t == "bringToFront":
                _id = data.get("id")
                scene = load_scene()
                items = scene.get("items", [])
                maxz = max([it.get("z", 1) for it in items], default=1)
                for it in items:
                    if it.get("id") == _id:
                        it["z"] = maxz + 1
                        break
                save_scene(scene)
                await ws_broadcast({"type": "scene.full", "scene": scene})

            elif t == "clear":
                scene = {"items": []}
                save_scene(scene)
                await ws_broadcast({"type": "scene.clear"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Moderator websocket error: {e}")
    finally:
        moderator_clients.discard(ws)

@app.websocket("/ws/overlay")
async def ws_overlay(ws: WebSocket):
    await ws.accept()
    overlay_clients.add(ws)
    try:
        # сразу отдадим полный снапшот
        await ws.send_text(json.dumps({"type": "scene.full", "scene": scene}, ensure_ascii=False))
        while True:
            # Overlay обычно ничего не шлёт — просто держим соединение
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Overlay websocket error: {e}")
    finally:
        overlay_clients.discard(ws)

# ---------- fallback API ----------
from fastapi import APIRouter
from urllib.parse import unquote

_api_fb = APIRouter()

@_api_fb.get("/api/scene")
def fb_get_scene():
    try:
        with open(SCENE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"items": []}

@_api_fb.put("/api/scene")
def fb_put_scene(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(400, "payload must be object")
    payload.setdefault("items", [])
    os.makedirs(os.path.dirname(SCENE_PATH), exist_ok=True)
    with open(SCENE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
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
    try:
        for r in app.router.routes:
            if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
                return True
    except Exception:
        pass
    return False

if not _route_exists("/api/scene", "GET"):
    app.include_router(_api_fb)

# ---------- dev run ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=config.get("port", 5000), reload=False)
# ---------- media control ----------
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
