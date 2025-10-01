from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os, json, uuid, shutil, mimetypes

BASE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, "data")
UPLOAD_DIR = os.path.join(BASE, "uploads")
TEMPLATES_DIR = os.path.join(BASE, "templates")
STATIC_DIR = os.path.join(BASE, "static")

CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
SCENE_PATH = os.path.join(DATA_DIR, "scene.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# defaults
if not os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"canvasWidth": 1920, "canvasHeight": 1080, "port": 13337, "grid": 20}, f, ensure_ascii=False, indent=2)

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

overlay_clients: list[WebSocket] = []
moderator_clients: list[WebSocket] = []

async def broadcast(msg: dict, to_overlays: bool = True, to_mods: bool = True):
    data = json.dumps(msg, ensure_ascii=False)
    dead_over = []
    dead_mod = []
    if to_overlays:
        for ws in overlay_clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead_over.append(ws)
    if to_mods:
        for ws in moderator_clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead_mod.append(ws)
    for ws in dead_over:
        if ws in overlay_clients:
            overlay_clients.remove(ws)
    for ws in dead_mod:
        if ws in moderator_clients:
            moderator_clients.remove(ws)

# --------------- Pages ---------------
@app.get("/", response_class=HTMLResponse)
async def overlay_page(request: Request):
    return templates.TemplateResponse("overlay.html", {"request": request, "cfg": config})

@app.get("/moderator", response_class=HTMLResponse)
async def mod_page(request: Request):
    return templates.TemplateResponse("mod_panel.html", {"request": request, "cfg": config})

# --------------- REST API ---------------
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp",
               ".mp4", ".webm", ".mov", ".m4v",
               ".mp3", ".wav", ".ogg"}

@app.get("/api/uploads")
async def list_uploads():
    items = []
    for name in sorted(os.listdir(UPLOAD_DIR)):
        path = os.path.join(UPLOAD_DIR, name)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in ALLOWED_EXT:
            mt = mimetypes.guess_type(name)[0] or "application/octet-stream"
            items.append({
                "name": name,
                "url": f"/uploads/{name}",
                "mime": mt,
                "ext": ext
            })
    return {"files": items}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    raw = file.filename or "upload.bin"
    base = os.path.basename(raw).replace("..", "")
    name, ext = os.path.splitext(base)
    if ext.lower() not in ALLOWED_EXT:
        return JSONResponse({"error": f"ext {ext} not allowed"}, status_code=400)
    # уникальное имя
    safe = f"{name}_{uuid.uuid4().hex[:8]}{ext}"
    dest = os.path.join(UPLOAD_DIR, safe)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    mt = mimetypes.guess_type(safe)[0] or "application/octet-stream"
    return {"ok": True, "name": safe, "url": f"/uploads/{safe}", "mime": mt}

# --------------- WebSockets ---------------
@app.websocket("/ws/overlay")
async def ws_overlay(ws: WebSocket):
    await ws.accept()
    overlay_clients.append(ws)
    try:
        # при подключении отдать всю сцену
        await ws.send_text(json.dumps({"type": "scene.load", "scene": scene}, ensure_ascii=False))
        while True:
            # overlay ничего не шлёт нам; держим соединение
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if ws in overlay_clients:
            overlay_clients.remove(ws)

@app.websocket("/ws/moderator")
async def ws_moderator(ws: WebSocket):
    await ws.accept()
    moderator_clients.append(ws)
    try:
        # отправить конфиг и текущую сцену
        await ws.send_text(json.dumps({"type": "config", "config": config}, ensure_ascii=False))
        await ws.send_text(json.dumps({"type": "scene.load", "scene": scene}, ensure_ascii=False))
        while True:
            txt = await ws.receive_text()
            try:
                msg = json.loads(txt)
            except Exception:
                continue

            # ---- команды модера ----
            if msg.get("type") == "add":
                item = msg.get("item") or {}
                # обязательные поля
                item["id"] = item.get("id") or uuid.uuid4().hex[:8]
                item["kind"] = item.get("kind") or "text"
                item["content"] = item.get("content") or ""
                # позиция/размер
                item["x"] = int(item.get("x", 100))
                item["y"] = int(item.get("y", 100))
                item["w"] = int(item.get("w", 400))
                item["h"] = int(item.get("h", 120))
                # стили
                item.setdefault("color", "#ffffff")
                item.setdefault("bg", "transparent")
                item.setdefault("fontSize", 40)
                item.setdefault("z", 1)
                item.setdefault("lockRatio", item["kind"] in ("image", "video"))
                scene["items"].append(item)
                save_scene(scene)
                await broadcast({"type": "scene.add", "item": item})

            elif msg.get("type") == "update":
                item = msg.get("item") or {}
                iid = item.get("id")
                if not iid:
                    continue
                found = None
                for it in scene["items"]:
                    if it["id"] == iid:
                        found = it
                        break
                if not found:
                    continue
                for k, v in item.items():
                    if k == "id":
                        continue
                    found[k] = v
                save_scene(scene)
                await broadcast({"type": "scene.update", "item": found})

            elif msg.get("type") == "remove":
                iid = msg.get("id")
                if not iid:
                    continue
                new_items = [it for it in scene["items"] if it["id"] != iid]
                if len(new_items) != len(scene["items"]):
                    scene["items"] = new_items
                    save_scene(scene)
                    await broadcast({"type": "scene.remove", "id": iid})

            elif msg.get("type") == "clear":
                scene["items"] = []
                save_scene(scene)
                await broadcast({"type": "scene.clear"})

            elif msg.get("type") == "bringToFront":
                iid = msg.get("id")
                if not iid:
                    continue
                max_z = max([it.get("z", 1) for it in scene["items"]] or [1])
                for it in scene["items"]:
                    if it["id"] == iid:
                        it["z"] = max_z + 1
                        save_scene(scene)
                        await broadcast({"type": "scene.update", "item": it})
                        break

            else:
                # не рвём соединение, просто игнор
                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if ws in moderator_clients:
            moderator_clients.remove(ws)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=config.get("port", 13337))


from fastapi import UploadFile, File
from fastapi.responses import JSONResponse

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "url": f"/uploads/{fname}", "name": file.filename}

@app.get("/api/uploads")
async def list_uploads():
    files = []
    for fn in os.listdir(UPLOAD_DIR):
        if fn.lower().endswith((".png",".jpg",".jpeg",".gif",".webm",".mp4",".mp3",".wav")):
            files.append({"name": fn, "url": f"/uploads/{fn}"})
    return JSONResponse(files)
