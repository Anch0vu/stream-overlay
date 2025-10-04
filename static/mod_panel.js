const cfg = window.__CFG__ || { canvasWidth: 1920, canvasHeight: 1080, grid: 10 };
let scene = window.__SCENE__ || { items: [] };

const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/moderator' + (location.search || '');
const ws = new WebSocket(wsUrl);

const els = {
  items: document.getElementById('items'),
  uploadList: document.getElementById('upload-list'),
  canvas: document.getElementById('canvas'),
  folderSel: document.getElementById('sel-folder'),
  // form
  fid: document.getElementById('f-id'),
  fkind: document.getElementById('f-kind'),
  fcontent: document.getElementById('f-content'),
  fx: document.getElementById('f-x'),
  fy: document.getElementById('f-y'),
  fw: document.getElementById('f-w'),
  fh: document.getElementById('f-h'),
  ffont: document.getElementById('f-font'),
  fcolor: document.getElementById('f-color'),
  fbg: document.getElementById('f-bg'),
  fz: document.getElementById('f-z'),
  // controls
  snap: document.getElementById('cb-snap'),
  lockRatio: document.getElementById('cb-lockratio'),
  presetName: document.getElementById('preset-name'),
  presetList: document.getElementById('preset-list')
};

let selectedId = null;
let ghosts = new Map(); // id -> DOM
let currentFolder = ""; // относительный путь в uploads
let resizing = { active:false, id:null, startW:0, startH:0, baseX:0, baseY:0, startMX:0, startMY:0, ratio:1 };

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'scene.full') {
    scene = msg.scene || { items: [] };
    renderAll();
    refreshPresetList(); // на всякий случай
  } else if (msg.type === 'scene.add') {
    scene.items.push(msg.item);
    renderItems();
    renderGhost(msg.item);
  } else if (msg.type === 'scene.update') {
    const idx = scene.items.findIndex(x => x.id === msg.item.id);
    if (idx >= 0) scene.items[idx] = msg.item;
    renderItems();
    renderGhost(msg.item, true);
    if (selectedId === msg.item.id) fillForm(msg.item);
  } else if (msg.type === 'scene.remove') {
    scene.items = scene.items.filter(x => x.id !== msg.id);
    renderItems();
    const g = ghosts.get(msg.id); if (g) g.remove(); ghosts.delete(msg.id);
    if (selectedId === msg.id) clearForm();
  } else if (msg.type === 'scene.clear') {
    scene = { items: [] };
    renderItems();
    els.canvas.innerHTML = '';
    ghosts.clear();
    clearForm();
  }
};

// ---------- buttons ----------
document.getElementById('btn-add-text').onclick = () => {
  const item = {
    kind: 'text',
    content: 'Новый текст',
    x: 100, y: 100, w: 600, h: 0,
    color: '#ffffff', bg: 'transparent', fontSize: 40, z: 1,
  };
  ws.send(JSON.stringify({ type: 'add', item }));
};

document.getElementById('btn-add-image').onclick = () => {
  const url = prompt('Image URL');
  if (!url) return;
  ws.send(JSON.stringify({ type: 'add', item: { kind: 'image', content: url, x: 100, y: 100, w: 600, h: 400, z: 1 } }));
};

document.getElementById('btn-add-video').onclick = () => {
  const url = prompt('Video URL');
  if (!url) return;
  ws.send(JSON.stringify({ type: 'add', item: { kind: 'video', content: url, x: 100, y: 100, w: 640, h: 360, z: 1 } }));
};

document.getElementById('btn-add-timer').onclick = () => {
  const s = prompt('Countdown seconds (e.g., 300)');
  const seconds = parseInt(s || '0', 10);
  if (!seconds) return;
  const now = Date.now();
  const item = {
    kind: 'text',
    content: '', x: 100, y: 100, w: 0, h: 0, z: 1,
    color: '#ffffff', bg: 'transparent', fontSize: 48,
    timer: { type: 'countdown', deadline: now + seconds*1000, format: 'mm:ss' }
  };
  ws.send(JSON.stringify({ type: 'add', item }));
};

document.getElementById('file-upload').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('file', f);
  fd.append('dir', currentFolder);
  const resp = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await resp.json();
  if (data.ok) {
    await loadUploads();
    const up = data.file;
    const kind = up.kind || 'image';
    ws.send(JSON.stringify({ type: 'add', item: { kind, content: up.url, x: 120, y: 120, w: 640, h: 360, z: 1 } }));
  } else {
    alert(data.error || 'Upload error');
  }
  e.target.value = '';
};

document.getElementById('btn-refresh-uploads').onclick = () => loadUploads();
document.getElementById('btn-mkdir').onclick = async () => {
  const name = prompt('New folder name');
  if (!name) return;
  const fd = new FormData();
  fd.append('name', name); fd.append('dir', currentFolder);
  await fetch('/api/upload/mkdir', { method:'POST', body: fd });
  await loadUploads();
};

document.getElementById('btn-clear').onclick = () => ws.send(JSON.stringify({ type: 'clear' }));
document.getElementById('btn-remove').onclick = () => { if (selectedId) ws.send(JSON.stringify({ type: 'remove', id: selectedId })); };
document.getElementById('btn-front').onclick = () => { if (selectedId) ws.send(JSON.stringify({ type: 'bringToFront', id: selectedId })); };
document.getElementById('btn-update').onclick = () => { if (selectedId) ws.send(JSON.stringify({ type:'update', item: collectForm() })); };

document.getElementById('btn-undo').onclick = () => ws.send(JSON.stringify({ type: 'history.undo' }));
document.getElementById('btn-redo').onclick = () => ws.send(JSON.stringify({ type: 'history.redo' }));

document.getElementById('preset-list').onchange = ()=>{};
document.getElementById('btn-save-preset').onclick = async ()=>{
  const name = (els.presetName.value || '').trim();
  if (!name) return alert('Name required');
  ws.send(JSON.stringify({ type:'preset.save', name }));
  setTimeout(refreshPresetList, 300);
};
document.getElementById('btn-load-preset').onclick = async ()=>{
  const name = els.presetList.value;
  if (!name) return;
  ws.send(JSON.stringify({ type:'preset.load', name, transition:{type:'fade', duration:250} }));
};

// ---------- uploads list ----------
async function loadUploads() {
  const q = currentFolder ? '?dir=' + encodeURIComponent(currentFolder) : '';
  const resp = await fetch('/api/uploads' + q);
  const data = await resp.json();
  els.uploadList.innerHTML = '';
  els.folderSel.innerHTML = '';

  const cwd = data.cwd || '';
  currentFolder = cwd;

  // selector с путём: parent/dirs
  const optRoot = document.createElement('option'); optRoot.value = ''; optRoot.textContent = '/';
  els.folderSel.appendChild(optRoot);

  if (data.parent !== undefined && data.parent !== null) {
    // не строим полный хлеб, просто показываем cwd и dirs
  }
  // текущие подпапки
  for (const d of (data.dirs || [])) {
    const o = document.createElement('option');
    o.value = (cwd ? cwd + '/' : '') + d;
    o.textContent = (cwd ? cwd + '/' : '') + d;
    els.folderSel.appendChild(o);
  }
  els.folderSel.value = cwd;
  els.folderSel.onchange = async ()=>{
    currentFolder = els.folderSel.value || '';
    await loadUploads();
  };

  // файлы
  for (const f of (data.files || [])) {
    const li = document.createElement('li');
    const kb = Math.round((f.size || 0)/1024);
    li.innerHTML = `
      <div><b>${f.name}</b> <span class="meta">${f.kind} • ${kb} KB</span></div>
      <div class="row small">
        <button data-act="add">Add</button>
        <button data-act="del" class="danger">Delete</button>
      </div>
    `;
    li.querySelector('[data-act="add"]').onclick = ()=>{
      const kind = f.kind || 'image';
      ws.send(JSON.stringify({ type:'add', item:{ kind, content:f.url, x:140, y:140, w:640, h:360, z:1 } }));
    };
    li.querySelector('[data-act="del"]').onclick = async ()=>{
      const cascade = confirm('Удалить и НАКАЗАТЬ сцену (каскадно убрать элементы, которые используют файл)? ОК — да, Cancel — просто попытаться удалить файл.');
      const fd = new FormData();
      fd.append('path', f.path);
      fd.append('cascade', cascade ? '1' : '0');
      const r = await fetch('/api/upload/delete', { method:'POST', body: fd });
      if (r.status === 409) {
        const j = await r.json();
        alert('Файл используется элементами: ' + (j.items || []).join(', ') + '\nПовторите с каскадом или удалите элементы вручную.');
      } else {
        await r.json();
        await loadUploads();
      }
    };
    els.uploadList.appendChild(li);
  }
}

async function refreshPresetList() {
  const r = await fetch('/api/presets');
  const j = await r.json();
  els.presetList.innerHTML = '';
  for (const name of (j.presets || [])) {
    const o = document.createElement('option'); o.value = name; o.textContent = name;
    els.presetList.appendChild(o);
  }
}

// ---------- rendering ----------
function renderAll() {
  renderItems();
  els.canvas.innerHTML = '';
  ghosts.clear();
  for (const it of scene.items) renderGhost(it);
  loadUploads();
  refreshPresetList();
}

function renderItems() {
  els.items.innerHTML = '';
  for (const it of scene.items) {
    const li = document.createElement('li');
    li.innerHTML = `<div><b>${it.kind}</b> <span class="meta">(${it.x},${it.y}, z:${it.z || 1})</span></div>
                    <div><button data-act="sel">Select</button></div>`;
    li.querySelector('[data-act="sel"]').onclick = ()=> selectItem(it.id);
    els.items.appendChild(li);
  }
}

function selectItem(id) {
  selectedId = id;
  const it = scene.items.find(x=>x.id===id);
  ghosts.forEach((g, gid) => g.classList.toggle('selected', gid === id));
  if (it) fillForm(it);
}

function fillForm(it) {
  els.fid.value = it.id || '';
  els.fkind.value = it.kind || 'text';
  els.fcontent.value = it.content || '';
  els.fx.value = it.x || 0;
  els.fy.value = it.y || 0;
  els.fw.value = it.w || 0;
  els.fh.value = it.h || 0;
  els.ffont.value = it.fontSize || 40;
  els.fcolor.value = it.color || '#ffffff';
  els.fbg.value = it.bg || 'transparent';
  els.fz.value = it.z || 1;
}

function clearForm() {
  selectedId = null;
  [els.fid, els.fcontent, els.fx, els.fy, els.fw, els.fh, els.ffont, els.fcolor, els.fbg, els.fz].forEach(el=>el.value='');
}

function collectForm() {
  return {
    id: els.fid.value,
    kind: els.fkind.value,
    content: els.fcontent.value,
    x: parseInt(els.fx.value || '0', 10),
    y: parseInt(els.fy.value || '0', 10),
    w: parseInt(els.fw.value || '0', 10) || undefined,
    h: parseInt(els.fh.value || '0', 10) || undefined,
    fontSize: parseInt(els.ffont.value || '40', 10),
    color: els.fcolor.value || '#ffffff',
    bg: els.fbg.value || 'transparent',
    z: parseInt(els.fz.value || '1', 10),
  };
}

// ----- canvas ghosts, drag & resize -----
function scaleX(){ return els.canvas.clientWidth / cfg.canvasWidth; }
function scaleY(){ return els.canvas.clientHeight / cfg.canvasHeight; }

function placeGhost(g, it) {
  const sx = scaleX(), sy = scaleY();
  g.style.left = Math.round((it.x || 0) * sx) + 'px';
  g.style.top = Math.round((it.y || 0) * sy) + 'px';
  if (it.w) g.style.width = Math.round(it.w * sx) + 'px';
  if (it.h) g.style.height = Math.round(it.h * sy) + 'px';
  g.style.zIndex = String(it.z || 1);
}

function renderGhost(it, updateOnly=false) {
  let g = ghosts.get(it.id);
  if (!g) {
    g = document.createElement('div');
    g.className = `ghost ${it.kind}`;
    g.dataset.id = it.id;
    g.onclick = () => selectItem(it.id);
    enableDrag(g, it.id);
    // ручка для ресайза
    const h = document.createElement('div');
    h.className = 'handle';
    h.onmousedown = (e)=>startResize(e, it.id);
    g.appendChild(h);
    ghosts.set(it.id, g);
    els.canvas.appendChild(g);
  } else if (!updateOnly) {
    // перерисовать содержимое
    for (const n of [...g.childNodes]) if (!n.classList || !n.classList.contains('handle')) n.remove();
  }

  // содержимое
  if (it.kind === 'text') {
    const span = document.createElement('div');
    span.textContent = (it.content || '').replace(/\n/g, '\n');
    span.style.fontSize = (it.fontSize || 40)+'px';
    span.style.color = it.color || '#fff';
    span.style.background = it.bg || 'transparent';
    span.style.borderRadius = '8px';
    g.insertBefore(span, g.querySelector('.handle'));
  } else if (it.kind === 'image') {
    const img = document.createElement('img'); img.src = it.content || '';
    g.insertBefore(img, g.querySelector('.handle'));
  } else if (it.kind === 'video') {
    const vid = document.createElement('video'); vid.src = it.content || ''; vid.muted=true; vid.loop=true;
    g.insertBefore(vid, g.querySelector('.handle'));
  } else {
    const span = document.createElement('div'); span.textContent = `[${it.kind}]`;
    g.insertBefore(span, g.querySelector('.handle'));
  }

  placeGhost(g, it);
}

function enableDrag(node, id) {
  let dragging=false, startX=0, startY=0, baseX=0, baseY=0;

  node.addEventListener('mousedown', (e)=>{
    // не захватывать, если хватаем за ручку
    if (e.target && e.target.classList && e.target.classList.contains('handle')) return;
    dragging = true; selectItem(id);
    const r = node.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    baseX = r.left - els.canvas.getBoundingClientRect().left;
    baseY = r.top - els.canvas.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e)=>{
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let nx = baseX + dx, ny = baseY + dy;
    if (els.snap.checked) {
      const g = cfg.grid || 10;
      nx = Math.round(nx/g)*g; ny = Math.round(ny/g)*g;
    }
    node.style.left = nx + 'px';
    node.style.top = ny + 'px';
  });

  document.addEventListener('mouseup', ()=>{
    if (!dragging) return;
    dragging = false;
    const it = scene.items.find(x=>x.id===id); if (!it) return;
    const x = parseInt(node.style.left,10) / scaleX();
    const y = parseInt(node.style.top,10) / scaleY();
    ws.send(JSON.stringify({ type:'update', item:{ id, x: Math.round(x), y: Math.round(y) } }));
  });
}

function startResize(e, id) {
  e.stopPropagation(); e.preventDefault();
  const g = ghosts.get(id); if (!g) return;
  const it = scene.items.find(x=>x.id===id); if (!it) return;

  const r = g.getBoundingClientRect();
  resizing.active = true; resizing.id = id;
  resizing.startW = r.width; resizing.startH = r.height;
  resizing.baseX = r.left; resizing.baseY = r.top;
  resizing.startMX = e.clientX; resizing.startMY = e.clientY;
  const w = parseInt(it.w || Math.round(r.width/scaleX()), 10) || 1;
  const h = parseInt(it.h || Math.round(r.height/scaleY()), 10) || 1;
  resizing.ratio = (w && h) ? (w/h) : 1;
}

document.addEventListener('mousemove', (e)=>{
  if (!resizing.active) return;
  const id = resizing.id;
  const g = ghosts.get(id); if (!g) return;

  let dx = e.clientX - resizing.startMX;
  let dy = e.clientY - resizing.startMY;

  let newW = Math.max(20, resizing.startW + dx);
  let newH = Math.max(20, resizing.startH + dy);

  if (els.lockRatio.checked || e.shiftKey) {
    // фиксируем пропорции
    const targetH = newW / resizing.ratio;
    newH = targetH;
  }

  if (els.snap.checked) {
    const gx = cfg.grid || 10, gy = cfg.grid || 10;
    newW = Math.round(newW/gx)*gx;
    newH = Math.round(newH/gy)*gy;
  }

  g.style.width = newW + 'px';
  g.style.height = newH + 'px';
});

document.addEventListener('mouseup', ()=>{
  if (!resizing.active) return;
  const id = resizing.id; resizing.active=false;
  const g = ghosts.get(id); if (!g) return;

  const w = Math.round(parseInt(g.style.width,10) / scaleX());
  const h = Math.round(parseInt(g.style.height,10) / scaleY());
  ws.send(JSON.stringify({ type:'update', item:{ id, w, h } }));
});

// hotkeys
document.addEventListener('keydown', (e)=>{
  if (!selectedId) return;
  const it = scene.items.find(x=>x.id===selectedId); if (!it) return;
  const step = e.shiftKey ? 10 : 1;
  let changed = false;

  if (e.key === 'Delete') {
    ws.send(JSON.stringify({ type:'remove', id: selectedId }));
    e.preventDefault(); return;
  }
  if (e.ctrlKey && (e.key.toLowerCase()==='z')) { ws.send(JSON.stringify({type:'history.undo'})); e.preventDefault(); return; }
  if (e.ctrlKey && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))) { ws.send(JSON.stringify({type:'history.redo'})); e.preventDefault(); return; }

  if (e.key === 'ArrowLeft')  { it.x = (it.x||0) - step; changed = true; }
  if (e.key === 'ArrowRight') { it.x = (it.x||0) + step; changed = true; }
  if (e.key === 'ArrowUp')    { it.y = (it.y||0) - step; changed = true; }
  if (e.key === 'ArrowDown')  { it.y = (it.y||0) + step; changed = true; }

  if (changed) {
    if (els.snap.checked) {
      const g = cfg.grid || 10;
      it.x = Math.round(it.x/g)*g;
      it.y = Math.round(it.y/g)*g;
    }
    ws.send(JSON.stringify({ type:'update', item:{ id:it.id, x:it.x, y:it.y } }));
    e.preventDefault();
  }
});

window.addEventListener('resize', ()=>{
  for (const it of scene.items) {
    const g = ghosts.get(it.id);
    if (g) placeGhost(g, it);
  }
});
