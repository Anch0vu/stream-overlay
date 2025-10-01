from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os, json, uuid, shutil

BASE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, "data")
UPLOAD_DIR = os.path.join(BASE, "uploads")
TEMPLATES_DIR = os.path.join(BASE, "templates")
STATIC_DIR = os.path.join(BASE, "static")

CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
SCENE_PATH = os.path.join(DATA_DIR, "scene.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)


# --- ДОБАВЬ где у тебя рядом с load_config или в начале main.py ---

def load_scene():
    if os.path.exists(SCENE_PATH):
        try:
            with open(SCENE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            # если json битый – создаём пустой
            return {"items": []}
    else:
        # если файланет – создаём
        with open(SCENE_PATH, "w", encoding="utf-8") as f:
            json.dump({"items": []}, f, ensure_ascii=False, indent=2)
        return {"items": []}


# --- ИСПРАВЬ эндпоинт панели модератора ---
@app.get("/mod")
async def mod_panel(request: Request):
    scene = load_scene()
    return templates.TemplateResponse(
        "mod_panel.html",
        {
            "request": request,
            "scene": scene   # ← вот этого не хватало
        }
    )


# дефолтные конфиги
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
scene = load_scene()

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# подключения
overlay_clients: list[WebSocket] = []
moderator_clients: list[WebSocket] = []

async def broadcast(msg: dict):
    """Рассылаем всем WS-клиентам (overlay + moderator)"""
    data = json.dumps(msg, ensure_ascii=False)
    dead = []
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

# ==== страницы ====
@app.get("/", response_class=HTMLResponse)
async def overlay_page(request: Request):
    return templates.TemplateResponse("overlay.html", {
        "request": request, "cfg": config
    })

@app.get("/moderator", response_class=HTMLResponse)
async def moderator_page(request: Request):
    # простая серверная форма: список items и форма добавления
    return templates.TemplateResponse("mod_panel.html", {
        "request": request,
        "cfg": config,
        "scene": scene
    })

# ==== WebSocket ====
@app.websocket("/ws/overlay")
async def ws_overlay(ws: WebSocket):
    await ws.accept()
    overlay_clients.append(ws)
    # при коннекте отдадим текущую сцену
    await ws.send_text(json.dumps({"type": "scene.full", "scene": scene}, ensure_ascii=False))
    try:
        while True:
            # overlay ничего не присылает — только слушает
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in overlay_clients:
            overlay_clients.remove(ws)

@app.websocket("/ws/mod")
async def ws_mod(ws: WebSocket):
    await ws.accept()
    moderator_clients.append(ws)
    try:
        while True:
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in moderator_clients:
            moderator_clients.remove(ws)

# ==== REST-эндпойнты для панели (минимум JS) ====

def _new_id() -> str:
    return uuid.uuid4().hex[:8]

@app.post("/api/add_text")
async def api_add_text(
    content: str = Form(...),
    x: int = Form(100),
    y: int = Form(100),
    w: int = Form(0),
    h: int = Form(0),
    fontSize: int = Form(40),
    color: str = Form("#ffffff"),
    bg: str = Form("transparent"),
    z: int = Form(1)
):
    item = {
        "id": _new_id(),
        "kind": "text",
        "content": content,
        "x": x, "y": y, "w": w, "h": h,
        "fontSize": fontSize, "color": color, "bg": bg, "z": z
    }
    scene["items"].append(item)
    save_scene(scene)
    await broadcast({"type": "scene.add", "item": item})
    return RedirectResponse(url="/moderator", status_code=303)

@app.post("/api/add_media")
async def api_add_media(
    kind: str = Form(...),  # image|video|audio
    url: str = Form(...),
    x: int = Form(100),
    y: int = Form(100),
    w: int = Form(0),
    h: int = Form(0),
    z: int = Form(1)
):
    if kind not in ("image", "video", "audio"):
        return JSONResponse({"ok": False, "error": "bad kind"}, status_code=400)
    item = {
        "id": _new_id(),
        "kind": kind,
        "content": url,
        "x": x, "y": y, "w": w, "h": h,
        "z": z
    }
    # для удобства дефолты
    if kind == "image":
        item.setdefault("keepRatio", True)
    if kind == "video":
        item.setdefault("autoplay", True)
        item.setdefault("loop", True)
        item.setdefault("muted", True)
        item.setdefault("keepRatio", True)
    scene["items"].append(item)
    save_scene(scene)
    await broadcast({"type": "scene.add", "item": item})
    return RedirectResponse(url="/moderator", status_code=303)

@app.post("/api/update")
async def api_update(
    id: str = Form(...),
    content: str = Form(None),
    x: int = Form(None),
    y: int = Form(None),
    w: int = Form(None),
    h: int = Form(None),
    fontSize: int = Form(None),
    color: str = Form(None),
    bg: str = Form(None),
    z: int = Form(None)
):
    target = next((it for it in scene["items"] if it["id"] == id), None)
    if not target:
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)

    # меняем только то, что прислали
    if content is not None: target["content"] = content
    if x is not None: target["x"] = x
    if y is not None: target["y"] = y
    if w is not None: target["w"] = w
    if h is not None: target["h"] = h
    if fontSize is not None: target["fontSize"] = fontSize
    if color is not None: target["color"] = color
    if bg is not None: target["bg"] = bg
    if z is not None: target["z"] = z

    save_scene(scene)
    await broadcast({"type": "scene.update", "item": target})
    return RedirectResponse(url="/moderator", status_code=303)

@app.post("/api/remove")
async def api_remove(id: str = Form(...)):
    before = len(scene["items"])
    scene["items"] = [it forit in scene["items"] if it["id"] != id]
    if len(scene["items"]) == before:
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
    save_scene(scene)
    await broadcast({"type": "scene.remove", "id": id})
    return RedirectResponse(url="/moderator", status_code=303)

@app.post("/api/clear")
async def api_clear():
    scene["items"] = []
    save_scene(scene)
    await broadcast({"type": "scene.clear"})
    return RedirectResponse(url="/moderator", status_code=303)

@app.post("/api/bring_front")
async def api_bring_front(id: str = Form(...)):
    target = next((it for it in scene["items"] if it["id"] == id), None)
    if not target:
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
    max_z = max([it.get("z", 1) for it in scene["items"]] or [1])
    target["z"] = max_z + 1
    save_scene(scene)
    await broadcast({"type": "scene.update", "item": target})
    return RedirectResponse(url="/moderator", status_code=303)

# ==== загрузки ====
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".mp3", ".wav", ".ogg"}

@app.get("/api/uploads")
async def api_uploads():
    out = []
    for name in sorted(os.listdir(UPLOAD_DIR)):
        p = os.path.join(UPLOAD_DIR, name)
        if not os.path.isfile(p):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in ALLOWED_EXT:
            out.append({
                "name": name,
                "url": f"/uploads/{name}",
                "ext": ext[1:]
            })
    return {"files": out}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # имя: base + _uuid + ext
    base, ext = os.path.splitext(file.filename)
    ext = ext.lower()
    if ext not in ALLOWED_EXT:
        return JSONResponse({"ok": False, "error": f"ext {ext} not allowed"}, status_code=400)

    safe_base = "".join(c for c in base if c.isalnum() or c in ("-", "_"))
    dst_name = f"{safe_base}_{uuid.uuid4().hex[:8]}{ext}"
    dst_path = os.path.join(UPLOAD_DIR, dst_name)

    # читаем чанками
    with open(dst_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    return RedirectResponse(url="/moderator", status_code=303)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=load_config().get("port", 13337))

