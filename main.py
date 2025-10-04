from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os, json, uuid, shutil, mimetypes

BASE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, "data")
UPLOAD_DIR = os.path.join(BASE, "uploads")
PRESETS_DIR = os.path.join(DATA_DIR, "presets")
TEMPLATES_DIR = os.path.join(BASE, "templates")
STATIC_DIR = os.path.join(BASE, "static")

CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
SCENE_PATH = os.path.join(DATA_DIR, "scene.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PRESETS_DIR, exist_ok=True)

# defaults
if not os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "canvasWidth": 1920,
            "canvasHeight": 1080,
            "port": 13337,
            # если непустой — требуется ?token=... для /moderator и ws
            "moderatorToken": "",
            # снап к сетке по умолчанию
            "grid": 10
        }, f, ensure_ascii=False, indent=2)

if not os.path.exists(SCENE_PATH):
    with open(SCENE_PATH, "w", encoding="utf-8") as f:
        json.dump({"items": []}, f, ensure_ascii=False, indent=2)

def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def load_scene():
    with open(SCENE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_scene(scene_obj):
    tmp = SCENE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(scene_obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SCENE_PATH)

config = load_config()

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

overlay_clients: list[WebSocket] = []
moderator_clients: list[WebSocket] = []

# ---- history (server-side undo/redo) ----
HISTORY_MAX = 50
_history: list[dict] = []
_redo: list[dict] = []

def deep_copy(obj):  # дешёвый deepcopy
    return json.loads(json.dumps(obj))

def push_history(snapshot_scene: dict):
    _history.append(deep_copy(snapshot_scene))
    if len(_history) > HISTORY_MAX:
        _history.pop(0)
    _redo.clear()

async def broadcast(msg: dict):
    dead = []
    data = json.dumps(msg, ensure_ascii=False)
    for ws in overlay_clients + moderator_clients:
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in overlay_clients:
            overlay_clients.remove(ws)
        if ws in moderator_clients:
            moderator_clients.remove(ws)

def sanitize_relpath(p: str) -> str:
    # без .., без абсолютных, без обратных слэшей
    p = (p or "").replace("\\", "/").strip("/")
    if not p or p.startswith("../") or "/../" in p or p.startswith("/"):
        raise ValueError("Bad path")
    return p

ALLOWED_IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
ALLOWED_VIDEO = {".mp4", ".webm", ".mov", ".mkv"}
ALLOWED_AUDIO = {".mp3", ".ogg", ".wav", ".m4a"}
ALLOWED_ALL = ALLOWED_IMAGE | ALLOWED_VIDEO | ALLOWED_AUDIO

def guess_kind_by_ext(ext: str) -> str:
    ext = ext.lower()
    if ext in ALLOWED_IMAGE: return "image"
    if ext in ALLOWED_VIDEO: return "video"
    if ext in ALLOWED_AUDIO: return "audio"
    return "file"

def moderator_token_ok(request_or_ws) -> bool:
    need = (config.get("moderatorToken") or "").strip()
    if not need:
        return True
    # Request: .query_params; WS: .query_params
    token = request_or_ws.query_params.get("token")
    return token == need

# ---------- Pages ----------
@app.get("/", response_class=HTMLResponse)
async def overlay_page(request: Request):
    return templates.TemplateResponse("overlay.html", {"request": request, "cfg": load_config()})

@app.get("/moderator", response_class=HTMLResponse)
async def moderator_page(request: Request):
    if not moderator_token_ok(request):
        return HTMLResponse("Forbidden", status_code=403)
    scn = load_scene()
    return templates.TemplateResponse("mod_panel.html", {"request": request, "cfg": load_config(), "scene": scn})

# ---------- REST: uploads ----------
@app.get("/api/uploads")
async def api_uploads(dir: str = ""):
    """
    Список папок и файлов в uploads (в пределах dir).
    """
    try:
        rel = sanitize_relpath(dir) if dir else ""
    except ValueError:
        return JSONResponse({"ok": False, "error": "Bad dir"}, status_code=400)

    base = os.path.join(UPLOAD_DIR, rel) if rel else UPLOAD_DIR
    if not os.path.isdir(base):
        return {"ok": True, "cwd": rel, "parent": "", "dirs": [], "files": []}

    # подпапки
    dirs = []
    for d in sorted(os.listdir(base)):
        p = os.path.join(base, d)
        if os.path.isdir(p) and not d.startswith("."):
            dirs.append(d)

    # файлы
    files = []
    for name in sorted(os.listdir(base)):
        path = os.path.join(base, name)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_ALL:
            continue
        size = os.path.getsize(path)
        kind = guess_kind_by_ext(ext)
        rel_path = f"{rel}/{name}".strip("/")
        files.append({
            "name": name,
            "path": rel_path,                 # относительный путь
            "url": f"/uploads/{rel_path}",
            "size": size,
            "kind": kind
        })

    parent = "/".join(rel.split("/")[:-1]) if rel else ""
    return {"ok": True, "cwd": rel, "parent": parent, "dirs": dirs, "files": files}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), dir: str = Form(default="")):
    try:
        rel = sanitize_relpath(dir) if dir else ""
    except ValueError:
        return JSONResponse({"ok": False, "error": "Bad dir"}, status_code=400)

    # ensure dir exists
    dst_dir = os.path.join(UPLOAD_DIR, rel) if rel else UPLOAD_DIR
    os.makedirs(dst_dir, exist_ok=True)

    name = os.path.basename(file.filename or "")
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_ALL:
        return JSONResponse({"ok": False, "error": f"Unsupported extension: {ext}"}, status_code=400)

    safe = f"{uuid.uuid4().hex}{ext}"
    dst = os.path.join(dst_dir, safe)
    with open(dst, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = os.path.getsize(dst)
    kind = guess_kind_by_ext(ext)
    rel_path = f"{rel}/{safe}".strip("/")
    return {"ok": True, "file": {"name": safe, "path": rel_path, "url": f"/uploads/{rel_path}", "size": size, "kind": kind}}

@app.post("/api/upload/mkdir")
async def api_upload_mkdir(name: str = Form(...), dir: str = Form(default="")):
    try:
        base = sanitize_relpath(dir) if dir else ""
        folder = sanitize_relpath(name)
    except ValueError:
        return JSONResponse({"ok": False, "error": "Bad folder name"}, status_code=400)
    full = os.path.join(UPLOAD_DIR, base, folder)
    os.makedirs(full, exist_ok=True)
    return {"ok": True}

@app.post("/api/upload/delete")
async def api_upload_delete(path: str = Form(...), cascade: int = Form(default=0)):
    """
    Удалить файл из uploads. Если используется в сцене:
      - по умолчанию вернёт 409 с перечнем элементов
      - если cascade=1 — удалит эти элементы из сцены
    """
    try:
        rel = sanitize_relpath(path)
    except ValueError:
        return JSONResponse({"ok": False, "error": "Bad path"}, status_code=400)

    full = os.path.join(UPLOAD_DIR, rel)
    if not os.path.isfile(full):
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)

    url = f"/uploads/{rel}"
    scn = load_scene()
    used_ids = [it["id"] for it in scn.get("items", []) if (it.get("content") == url)]

    if used_ids and not cascade:
        return JSONResponse({"ok": False, "error": "In use", "items": used_ids}, status_code=409)

    # если каскад — удаляем элементы, пишем историю
    if used_ids and cascade:
        push_history(scn)
        scn["items"] = [it for it in scn["items"] if it["id"] not in used_ids]
        save_scene(scn)
        await broadcast({"type": "scene.full", "scene": scn, "transition": {"type": "fade", "duration": 200}})

    try:
        os.remove(full)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

    return {"ok": True, "removed": rel, "cascade": bool(cascade), "removedItems": used_ids}

# ---------- REST: presets (list) ----------
@app.get("/api/presets")
async def api_presets():
    names = []
    for fn in os.listdir(PRESETS_DIR):
        if fn.endswith(".json"):
            names.append(os.path.splitext(fn)[0])
    names.sort()
    return {"ok": True, "presets": names}

# ---------- WebSockets ----------
@app.websocket("/ws/overlay")
async def ws_overlay(ws: WebSocket):
    await ws.accept()
    overlay_clients.append(ws)
    await ws.send_text(json.dumps({"type": "scene.full", "scene": load_scene(), "cfg": load_config()}, ensure_ascii=False))
    try:
        while True:
            await ws.receive_text()  # overlay ничего не шлёт
    except WebSocketDisconnect:
        if ws in overlay_clients:
            overlay_clients.remove(ws)

@app.websocket("/ws/moderator")
async def ws_moderator(ws: WebSocket):
    if not moderator_token_ok(ws):
        await ws.close(code=4403)
        return

    await ws.accept()
    moderator_clients.append(ws)
    await ws.send_text(json.dumps({"type": "scene.full", "scene": load_scene(), "cfg": load_config()}, ensure_ascii=False))

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            t = msg.get("type")
            # ---- history ----
            if t == "history.undo":
                if _history:
                    current = load_scene()
                    _redo.append(deep_copy(current))
                    scn = _history.pop()
                    save_scene(scn)
                    await broadcast({"type": "scene.full", "scene": scn, "transition": {"type": "fade", "duration": 120}})
                continue
            if t == "history.redo":
                if _redo:
                    current = load_scene()
                    _history.append(deep_copy(current))
                    scn = _redo.pop()
                    save_scene(scn)
                    await broadcast({"type": "scene.full", "scene": scn, "transition": {"type": "fade", "duration": 120}})
                continue

            # ---- presets via WS ----
            if t == "preset.save":
                name = (msg.get("name") or "").strip()
                if not name:
                    continue
                safe = "".join(ch for ch in name if (ch.isalnum() or ch in ("-","_","."," ")))[:64].strip().replace(" ", "_")
                path = os.path.join(PRESETS_DIR, safe + ".json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(load_scene(), f, ensure_ascii=False, indent=2)
                await ws.send_text(json.dumps({"type": "preset.saved", "name": safe}))
                continue

            if t == "preset.load":
                name = (msg.get("name") or "").strip()
                transition = msg.get("transition") or {"type": "fade", "duration": 250}
                file = os.path.join(PRESETS_DIR, name + ".json")
                if os.path.isfile(file):
                    current = load_scene()
                    push_history(current)
                    with open(file, "r", encoding="utf-8") as f:
                        scn = json.load(f)
                    save_scene(scn)
                    await broadcast({"type": "scene.full", "scene": scn, "transition": transition})
                continue

            # ---- scene ops ----
            if t == "add":
                item = msg.get("item") or {}
                item.setdefault("id", str(uuid.uuid4().hex[:12]))
                item.setdefault("kind", "text")
                item.setdefault("content", "")
                item.setdefault("x", 100)
                item.setdefault("y", 100)
                item.setdefault("w", 600)
                item.setdefault("h", 0)
                item.setdefault("color", "#ffffff")
                item.setdefault("bg", "transparent")
                item.setdefault("fontSize", 40)
                item.setdefault("z", 1)

                scn = load_scene()
                push_history(scn)
                scn["items"].append(item)
                save_scene(scn)
                await broadcast({"type": "scene.add", "item": item})
                continue

            if t == "update":
                item = msg.get("item") or {}
                iid = item.get("id")
                if not iid:
                    continue
                scn = load_scene()
                found = None
                for it in scn["items"]:
                    if it["id"] == iid:
                        found = it
                        break
                if not found:
                    continue
                push_history(scn)
                for k, v in item.items():
                    if k == "id": continue
                    found[k] = v
                save_scene(scn)
                await broadcast({"type": "scene.update", "item": found})
                continue

            if t == "remove":
                iid = msg.get("id")
                if not iid:
                    continue
                scn = load_scene()
                new_items = [it for it in scn["items"] if it["id"] != iid]
                if len(new_items) != len(scn["items"]):
                    push_history(scn)
                    scn["items"] = new_items
                    save_scene(scn)
                    await broadcast({"type": "scene.remove", "id": iid})
                continue

            if t == "clear":
                push_history(load_scene())
                scn = {"items": []}
                save_scene(scn)
                await broadcast({"type": "scene.clear"})
                continue

            if t == "bringToFront":
                iid = msg.get("id")
                if not iid:
                    continue
                scn = load_scene()
                max_z = max([it.get("z", 1) for it in scn["items"]] or [1])
                for it in scn["items"]:
                    if it["id"] == iid:
                        push_history(scn)
                        it["z"] = max_z + 1
                        save_scene(scn)
                        await broadcast({"type": "scene.update", "item": it})
                        break
                continue

    except WebSocketDisconnect:
        if ws in moderator_clients:
            moderator_clients.remove(ws)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=load_config().get("port", 13337))
