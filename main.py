from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os, json, uuid, shutil, mimetypes, asyncio

# ---------- paths ----------
BASE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, "data")
UPLOAD_DIR = os.path.join(BASE, "uploads")
TEMPLATES_DIR = os.path.join(BASE, "templates")
STATIC_DIR = os.path.join(BASE, "static")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
SCENE_PATH  = os.path.join(DATA_DIR, "scene.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------- defaults ----------
if not os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"canvasWidth": 1920, "canvasHeight": 1080, "port": 13337}, f, ensure_ascii=False, indent=2)

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
scene  = load_scene()

# ---------- app ----------
app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# ---------- websockets ----------
overlay_clients: list[WebSocket]   = []
moderator_clients: list[WebSocket] = []

async def ws_broadcast(msg: dict, targets=None):
    data = json.dumps(msg, ensure_ascii=False)
    targets = targets or (overlay_clients + moderator_clients)
    dead = []
    for ws in targets:
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in overlay_clients:   overlay_clients.remove(ws)
        if ws in moderator_clients: moderator_clients.remove(ws)

def _normalize_item(it: dict) -> dict:
    it.setdefault("id", "i" + uuid.uuid4().hex[:8])
    it.setdefault("kind", "text")
    it.setdefault("x", 100); it.setdefault("y", 100)
    if it["kind"] == "text":
        it.setdefault("w", 600)
    else:
        it.setdefault("w", 320); it.setdefault("h", 240)
    it.setdefault("fontSize", 40)
    it.setdefault("color", "#ffffff")
    it.setdefault("bg", "transparent")
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

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), folder: str = Form(None)):
    name = file.filename or uuid.uuid4().hex
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
    return {"ok": True, "path": "/uploads/" + os.path.join(rel_folder, name).replace("\\", "/")}

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
            files.append({
                "name": n,
                "rel": rel,
                "path": "/uploads/" + rel,
                "size": st.st_size,
                "mime": mimetypes.guess_type(n)[0] or ""
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

# --- наверху файла (если нет этих импортов/структур) ---
from fastapi import HTTPException, WebSocket
from starlette.websockets import WebSocketDisconnect

moderator_clients: set[WebSocket] = set()
overlay_clients: set[WebSocket] = set()   # если уже есть — не дублируй

def load_scene():
    with open(SCENE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_scene(scene: dict):
    with open(SCENE_PATH, "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False, indent=2)

async def _ws_send_all(pool: set[WebSocket], payload: dict):
    dead = []
    for ws in list(pool):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        pool.discard(ws)


# --- сам сокет модератора ---
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
                item.setdefault("id", str(int(__import__("time").time() * 1000)))
                item.setdefault("kind", "text")
                item.setdefault("x", 100); item.setdefault("y", 100); item.setdefault("z", 1)
                if item["kind"] == "text":
                    item.setdefault("text", "New text")
                    item.setdefault("fontSize", 40)
                    item.setdefault("color", "#ffffff")
                    item.setdefault("bg", "transparent")
                scene = load_scene(); scene.setdefault("items", [])
                scene["items"].append(item); save_scene(scene)
                await _ws_send_all(moderator_clients, {"type": "scene.add", "item": item})
                await _ws_send_all(overlay_clients,   {"type": "scene.add", "item": item})

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
                await _ws_send_all(moderator_clients, {"type": "scene.update", "item": item})
                await _ws_send_all(overlay_clients,   {"type": "scene.update", "item": item})

            elif t == "remove":
                _id = data.get("id")
                scene = load_scene()
                scene["items"] = [it for it in scene.get("items", []) if it.get("id") != _id]
                save_scene(scene)
                await _ws_send_all(moderator_clients, {"type": "scene.remove", "id": _id})
                await _ws_send_all(overlay_clients,   {"type": "scene.remove", "id": _id})

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
                await _ws_send_all(moderator_clients, {"type": "scene.full", "scene": scene})
                await _ws_send_all(overlay_clients,   {"type": "scene.full", "scene": scene})

            elif t == "clear":
                scene = {"items": []}
                save_scene(scene)
                await _ws_send_all(moderator_clients, {"type": "scene.clear"})
                await _ws_send_all(overlay_clients,   {"type": "scene.clear"})
    except WebSocketDisconnect:
        pass
    finally:
        moderator_clients.discard(ws)


# ---------- overlay websocket ----------
@app.websocket("/ws/overlay")
async def ws_overlay(ws: WebSocket):
    await ws.accept()
    overlay_clients.append(ws)
    # сразу отдадим полный снапшот
    await ws.send_text(json.dumps({"type":"scene.full","scene":scene}, ensure_ascii=False))
    try:
        while True:
            # Overlay обычно ничего не шлёт — просто держим соединение
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in overlay_clients:
            overlay_clients.remove(ws)

# ---------- dev run ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=config.get("port",13337), reload=False)

# --- Fallback API: /api/scene + DELETE /api/uploads/{name} ---
import os, json
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

_BASE = globals().get('BASE', os.path.dirname(__file__))
_DATA = globals().get('DATA_DIR', os.path.join(_BASE, 'data'))
_UPLOAD = globals().get('UPLOAD_DIR', os.path.join(_BASE, 'uploads'))
_SCENE = globals().get('SCENE_PATH', os.path.join(_DATA, 'scene.json'))

_api_fb = APIRouter()

@_api_fb.get("/api/scene")
def fb_get_scene():
    try:
        with open(_SCENE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"items": []}

@_api_fb.put("/api/scene")
def fb_put_scene(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(400, "payload must be object")
    payload.setdefault("items", [])
    os.makedirs(os.path.dirname(_SCENE), exist_ok=True)
    with open(_SCENE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    for attr in ("broadcast_scene", "notify_scene", "broadcast"):
        fn = globals().get(attr)
        if callable(fn):
            try: fn(payload)
            except Exception: pass
    return JSONResponse({"ok": True})

@_api_fb.delete("/api/uploads/{name}")
def fb_delete_upload(name: str):
    name = os.path.basename(unquote(name))
    path = os.path.join(_UPLOAD, name)
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
# --- /Fallback API ---
# --- Fallback API: /api/scene + DELETE /api/uploads/{name} ---
import os, json
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

_BASE = globals().get('BASE', os.path.dirname(__file__))
_DATA = globals().get('DATA_DIR', os.path.join(_BASE, 'data'))
_UPLOAD = globals().get('UPLOAD_DIR', os.path.join(_BASE, 'uploads'))
_SCENE = globals().get('SCENE_PATH', os.path.join(_DATA, 'scene.json'))

_api_fb = APIRouter()

@_api_fb.get("/api/scene")
def fb_get_scene():
    try:
        with open(_SCENE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"items": []}

@_api_fb.put("/api/scene")
def fb_put_scene(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(400, "payload must be object")
    payload.setdefault("items", [])
    os.makedirs(os.path.dirname(_SCENE), exist_ok=True)
    with open(_SCENE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    for attr in ("broadcast_scene", "notify_scene", "broadcast"):
        fn = globals().get(attr)
        if callable(fn):
            try: fn(payload)
            except Exception: pass
    return JSONResponse({"ok": True})

@_api_fb.delete("/api/uploads/{name}")
def fb_delete_upload(name: str):
    name = os.path.basename(unquote(name))
    path = os.path.join(_UPLOAD, name)
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
# --- /Fallback API ---
