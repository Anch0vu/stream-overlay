/* Панель модератора: дебаунс сохранения сцены и батч-обновления QoL. */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const API = {
  scene: "/api/scene",
  uploads: "/api/uploads",
  upload: "/upload",
  delUpload: name => `/api/uploads/${encodeURIComponent(name)}`,
  ttsSpeak: "/api/tts/speak",
  metrics: "/api/metrics/realtime",
  webrtcToken: "/api/webrtc/token",
  webrtcRoomStats: room => `/api/webrtc/rooms/${encodeURIComponent(room)}/stats`,
};

const state = {
  scene: { items: [] },
  selected: null,
  sceneVersion: 0,
  saveTimer: null,
  saveInFlight: false,
  saveQueued: false,
  lastSaveClientTs: 0,
  gridStep(e) { return e && e.shiftKey ? 10 : 1; },
  getItem(id){ return state.scene.items.find(i => i.id === id); },
};

function uid(p){ return (p || 'id') + Math.random().toString(36).slice(2, 10); }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

const THEMES = ['dark', 'turquoise', 'midnight'];

function applyTheme(theme){
  // Переключаем тему интерфейса и сохраняем выбор локально.
  const t = THEMES.includes(theme) ? theme : 'dark';
  document.body.setAttribute('data-theme', t);
  try { localStorage.setItem('dock_theme', t); } catch(_) {}
  const sel = document.getElementById('themeSelect');
  if (sel && sel.value !== t) sel.value = t;
}

function initTheme(){
  // Инициализируем тему при загрузке панели.
  let saved = 'dark';
  try { saved = localStorage.getItem('dock_theme') || 'dark'; } catch(_) {}
  applyTheme(saved);
}

async function GET(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(url);
  return r.json();
}

async function PUT(url, body){
  const r = await fetch(url, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body),
  });
  if(!r.ok) throw new Error('PUT ' + url);
  return r.json();
}

function renderScene(){
  const surf = $("#surface");
  surf.innerHTML = "";

  for(const it of state.scene.items){
    const el = document.createElement(
      it.kind === 'text' ? 'div' : (it.kind === 'audio' ? 'audio' : it.kind === 'video' ? 'video' : 'img')
    );
    el.className = `node ${it.kind}`;
    el.dataset.id = it.id;
    el.style.left = (it.x || 0) + 'px';
    el.style.top = (it.y || 0) + 'px';
    if(it.w) el.style.width = it.w + 'px';
    if(it.h) el.style.height = it.h + 'px';
    el.style.zIndex = it.z ?? 1;

    if(it.kind === 'text'){
      el.textContent = it.content || 'text';
      el.style.fontSize = (it.font || 40) + 'px';
      el.style.color = it.color || '#fff';
      el.style.background = it.bg || 'transparent';
    } else {
      if(it.kind === 'image') el.src = it.content || '';
      if(it.kind === 'video'){ el.src = it.content || ''; el.controls = true; }
      if(it.kind === 'audio'){ el.src = it.content || ''; el.controls = true; el.style.width = '320px'; el.style.height = '40px'; }
    }

    el.addEventListener('mousedown', startDrag);
    el.addEventListener('click', () => select(it.id));
    surf.appendChild(el);
  }

  renderItemsList();
}

function renderItemsList(){
  const ul = $("#itemsList");
  ul.innerHTML = "";
  for(const it of state.scene.items){
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${it.kind}:${it.id}</span>
      <span class="btns">
        <button data-act="pick">Select</button>
        <button data-act="del" class="danger">Del</button>
      </span>`;
    li.querySelector('[data-act="pick"]').onclick = () => select(it.id);
    li.querySelector('[data-act="del"]').onclick = () => removeItem(it.id);
    ul.appendChild(li);
  }
}

function select(id){
  state.selected = id;
  for(const n of $$(".node")) n.classList.toggle('selected', n.dataset.id === id);
  const it = state.getItem(id);
  if(!it) return;

  $("#f_id").value = it.id;
  $("#f_kind").value = it.kind;
  $("#f_content").value = it.content || "";
  $("#f_x").value = it.x || 0;
  $("#f_y").value = it.y || 0;
  $("#f_w").value = it.w || 0;
  $("#f_h").value = it.h || 0;
  $("#f_font").value = it.font || 40;
  $("#f_color").value = it.color || "#ffffff";
  $("#f_bg").value = it.bg || "transparent";
  $("#f_z").value = it.z || 1;
}

function scheduleSaveScene(delay = 120){
  // Дебаунс записи: объединяем серию быстрых изменений в один запрос.
  if(state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    flushSaveScene();
  }, delay);
}

async function flushSaveScene(){
  if(state.saveInFlight){
    state.saveQueued = true;
    return;
  }

  state.saveInFlight = true;
  state.lastSaveClientTs = Date.now();
  const payload = {
    ...state.scene,
    _meta: {
      source: 'moderator-panel',
      client_ts: state.lastSaveClientTs,
      known_version: state.sceneVersion,
    },
  };

  try{
    const resp = await PUT(API.scene, payload);
    if(Number.isFinite(resp?.version)) state.sceneVersion = resp.version;
  }catch(e){
    console.error(e);
  } finally {
    state.saveInFlight = false;
    if(state.saveQueued){
      state.saveQueued = false;
      flushSaveScene();
    }
  }
}

function removeItem(id){
  state.scene.items = state.scene.items.filter(i => i.id !== id);
  renderScene();
  scheduleSaveScene();
}

function bringToFront(){
  if(!state.selected) return;
  const maxZ = state.scene.items.reduce((m, i) => Math.max(m, i.z || 1), 1);
  const it = state.getItem(state.selected);
  it.z = maxZ + 1;
  renderScene();
  select(it.id);
  scheduleSaveScene();
}

function updateFromForm(){
  if(!state.selected) return;
  const it = state.getItem(state.selected);
  if(!it) return;

  it.kind = $("#f_kind").value;
  it.content = $("#f_content").value.trim();
  it.x = +$("#f_x").value || 0;
  it.y = +$("#f_y").value || 0;
  it.w = +$("#f_w").value || 0;
  it.h = +$("#f_h").value || 0;
  it.font = +$("#f_font").value || 40;
  it.color = $("#f_color").value || "#ffffff";
  it.bg = $("#f_bg").value || "transparent";
  it.z = +$("#f_z").value || 1;

  renderScene();
  select(it.id);
  scheduleSaveScene(0);
}

function addItem(kind, content = ''){
  const it = {
    id: uid(kind),
    kind,
    content,
    x:100,
    y:100,
    z:1,
    w: (kind === 'text' ? 0 : 300),
    h:0,
    font:40,
    color:'#ffffff',
    bg:'transparent',
  };
  state.scene.items.push(it);
  renderScene();
  select(it.id);
  scheduleSaveScene(0);
}



function updateMetricCell(id, value){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = String(value);
}

async function refreshDiagnostics(){
  // Обновляем realtime-метрики QoL и статус WebRTC комнаты.
  try{
    const m = await GET(API.metrics);
    updateMetricCell('m_scene_version', m.scene_version ?? '-');
    updateMetricCell('m_latency_avg', m.overlay_apply_latency_avg_ms ?? '-');
    updateMetricCell('m_latency_p95', m.overlay_apply_latency_p95_ms ?? '-');
    updateMetricCell('m_ws_broadcasts', m.ws_broadcasts ?? '-');
    updateMetricCell('m_webrtc_rooms', m.webrtc_rooms_active ?? '-');
    updateMetricCell('m_signaling', m.webrtc_signaling_messages ?? '-');
  }catch(e){
    console.warn(e);
  }

  const room = (document.getElementById('webrtc_room')?.value || '').trim();
  if(!room) return;
  try{
    const rs = await GET(API.webrtcRoomStats(room));
    updateMetricCell('m_pub_online', rs.publisher_online ? 'yes' : 'no');
    updateMetricCell('m_viewers', rs.viewers ?? 0);
  }catch(e){
    console.warn(e);
  }
}

async function generateWebrtcToken(role){
  // Генерация signed-токена для signaling websocket.
  const room = (document.getElementById('webrtc_room')?.value || '').trim() || 'main-room';
  try{
    const r = await fetch(API.webrtcToken, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-streamer-token': window.prompt('Введите STREAMER токен для выдачи WebRTC ключа:') || '',
      },
      body: JSON.stringify({room, role, ttl: 300}),
    });
    if(!r.ok) throw new Error('token api failed');
    const data = await r.json();
    const out = document.getElementById('webrtc_ws_url');
    if(out) out.value = data.ws_url || '';
  }catch(e){
    console.error(e);
    alert('Не удалось сгенерировать WebRTC токен');
  }
}

async function speakTts(override = null){
  const text = ($("#tts_text")?.value || "").trim();
  if(!text){
    alert('Введите текст для TTS');
    return;
  }

  const payload = {
    text,
    lang: ($("#tts_lang")?.value || 'ru-RU').trim() || 'ru-RU',
    rate: +($("#tts_rate")?.value || 1),
    pitch: +($("#tts_pitch")?.value || 1),
    volume: +($("#tts_volume")?.value || 1),
    voiceName: ($("#tts_voice")?.value || '').trim(),
    ...(override || {}),
  };

  try{
    const r = await fetch(API.ttsSpeak, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    if(!r.ok) throw new Error('TTS API failed');
  }catch(e){
    console.error(e);
    alert('Не удалось отправить TTS');
  }
}

function speakTtsPreset(kind){
  // Быстрые профили TTS для разных ситуаций эфира.
  if(kind === 'normal') return speakTts({rate:1.0, pitch:1.0, volume:1.0});
  if(kind === 'announcer') return speakTts({rate:0.9, pitch:1.2, volume:1.0});
  if(kind === 'robot') return speakTts({rate:1.15, pitch:0.7, volume:1.0});
  return speakTts();
}

function startDrag(ev){
  const id = ev.currentTarget.dataset.id;
  select(id);
  const it = state.getItem(id);
  if(!it) return;

  const start = { x: ev.clientX, y: ev.clientY, ix: it.x || 0, iy: it.y || 0 };

  function move(e){
    const step = state.gridStep(e);
    const dx = Math.round((e.clientX - start.x) / step) * step;
    const dy = Math.round((e.clientY - start.y) / step) * step;
    it.x = clamp(start.ix + dx, 0, 1920);
    it.y = clamp(start.iy + dy, 0, 2160);
    renderScene();
    select(id);
    scheduleSaveScene(120);
  }

  function up(){
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    flushSaveScene();
  }

  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

async function loadScene(){
  try{ state.scene = await GET(API.scene); }
  catch{ state.scene = { items: [] }; }

  if(!state.scene.items) state.scene.items = [];
  state.sceneVersion = Number.isFinite(state.scene._version) ? state.scene._version : 0;
  renderScene();
}

async function refreshUploads(){
  const ul = $("#uploadsList");
  ul.innerHTML = "";
  let list = [];

  try{ list = (await GET(API.uploads)).files || []; }
  catch(e){ console.warn(e); }

  for(const file of list){
    const name = file.name;
    const mime = file.mime;
    let kind = 'image';
    if(mime.startsWith('video/')) kind = 'video';
    else if(mime.startsWith('audio/')) kind = 'audio';
    else if(mime.startsWith('image/')) kind = 'image';

    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${name} (${kind})</span>
      <span class="btns">
        <button data-act="add">Add</button>
        <button data-act="del" class="danger">Del</button>
      </span>`;

    li.querySelector('[data-act="add"]').onclick = () => addItem(kind, `/uploads/${file.rel}`);
    li.querySelector('[data-act="del"]').onclick = async () => {
      await fetch(API.delUpload(name), { method:'DELETE' });
      refreshUploads();
    };

    ul.appendChild(li);
  }
}

/* keyboard */
window.addEventListener('keydown', e => {
  if(!state.selected) return;
  const it = state.getItem(state.selected);
  if(!it) return;

  const step = state.gridStep(e);
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    if(e.key === 'ArrowLeft') it.x = clamp((it.x || 0) - step, 0, 1920);
    if(e.key === 'ArrowRight') it.x = clamp((it.x || 0) + step, 0, 1920);
    if(e.key === 'ArrowUp') it.y = clamp((it.y || 0) - step, 0, 2160);
    if(e.key === 'ArrowDown') it.y = clamp((it.y || 0) + step, 0, 2160);
    renderScene();
    select(it.id);
    scheduleSaveScene(120);
  }

  if(e.key === 'Delete'){
    removeItem(it.id);
  }
});

/* ui hooks */
$("#btnAddText").onclick = () => addItem('text', 'Sample text');
$("#btnAddImageUrl").onclick = () => { const u = prompt('Image URL:'); if(u) addItem('image', u); };
$("#btnAddVideoUrl").onclick = () => { const u = prompt('Video URL:'); if(u) addItem('video', u); };
$("#btnFront").onclick = bringToFront;
$("#btnRemove").onclick = () => state.selected && removeItem(state.selected);
$("#btnUpdate").onclick = updateFromForm;
$("#btnClearAll").onclick = () => {
  if(confirm('Clear all items?')) {
    state.scene.items = [];
    renderScene();
    scheduleSaveScene(0);
  }
};
$("#btnTtsSpeak") && ($("#btnTtsSpeak").onclick = () => speakTts());
$("#btnTtsNormal") && ($("#btnTtsNormal").onclick = () => speakTtsPreset("normal"));
$("#btnTtsAnnouncer") && ($("#btnTtsAnnouncer").onclick = () => speakTtsPreset("announcer"));
$("#btnTtsRobot") && ($("#btnTtsRobot").onclick = () => speakTtsPreset("robot"));
$("#btnGenViewerToken") && ($("#btnGenViewerToken").onclick = () => generateWebrtcToken("viewer"));
$("#btnGenPublisherToken") && ($("#btnGenPublisherToken").onclick = () => generateWebrtcToken("publisher"));

$("#btnRefreshUploads").onclick = refreshUploads;
$("#fileInput").addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if(!f) return;
  const fd = new FormData();
  fd.append('file', f);
  await fetch(API.upload, { method:'POST', body: fd });
  e.target.value = "";
  refreshUploads();
});

initTheme();
loadScene();
refreshUploads();


// Периодический опрос диагностических метрик для панели.
setInterval(refreshDiagnostics, 2000);
refreshDiagnostics();

const themeSelect = document.getElementById("themeSelect");
if(themeSelect){
  themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
}
