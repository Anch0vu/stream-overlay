const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/overlay');
const root = document.getElementById('overlay-root');
let scene = { items: [] };
const timers = new Map(); // id -> intervalId

ws.onopen = () => console.log('[overlay] ws open');
ws.onclose = () => console.log('[overlay] ws close');

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'scene.full') {
    scene = msg.scene || { items: [] };
    transition(() => renderFull(scene), msg.transition);
  } else if (msg.type === 'scene.add') {
    addItem(msg.item);
  } else if (msg.type === 'scene.update') {
    updateItem(msg.item);
  } else if (msg.type === 'scene.remove') {
    removeItem(msg.id);
  } else if (msg.type === 'scene.clear') {
    timers.forEach(id => clearInterval(id)); timers.clear();
    scene = { items: [] };
    root.innerHTML = '';
  }
};

function transition(apply, t) {
  const type = t?.type || '';
  const dur = Math.max(0, t?.duration || 0);
  if (!type || dur<=0) { apply(); return; }

  root.style.transition = `opacity ${dur}ms`;
  root.style.opacity = '0';
  setTimeout(()=>{
    apply();
    root.style.opacity = '1';
    setTimeout(()=> root.style.transition = '', dur+10);
  }, dur);
}

function renderFull(scn) {
  timers.forEach(id => clearInterval(id)); timers.clear();
  root.innerHTML = '';
  for (const it of scn.items || []) mountItem(it);
}

function addItem(it) {
  scene.items.push(it);
  mountItem(it);
}

function updateItem(it) {
  const idx = scene.items.findIndex(x => x.id === it.id);
  if (idx >= 0) scene.items[idx] = it;
  const node = document.querySelector(`[data-id="${it.id}"]`);
  if (node) applyStyles(node, it);
  if (node && it.kind === 'text') node.innerHTML = renderTextHtml(it.content);
  if (node && it.kind === 'image') node.querySelector('img')?.setAttribute('src', it.content);
  if (node && it.kind === 'video') node.querySelector('video')?.setAttribute('src', it.content);
  setupTimer(it); // перезапустить таймер если нужен
}

function removeItem(id) {
  scene.items = scene.items.filter(x => x.id !== id);
  const node = document.querySelector(`[data-id="${id}"]`);
  if (node) node.remove();
  const t = timers.get(id);
  if (t) { clearInterval(t); timers.delete(id); }
}

function mountItem(it) {
  const node = document.createElement('div');
  node.className = `item ${it.kind}`;
  node.dataset.id = it.id;

  if (it.kind === 'text') {
    node.innerHTML = renderTextHtml(it.content || '');
  } else if (it.kind === 'image') {
    const img = document.createElement('img');
    img.src = it.content || '';
    node.appendChild(img);
  } else if (it.kind === 'video') {
    const vid = document.createElement('video');
    vid.src = it.content || '';
    vid.autoplay = true; vid.muted = true; vid.loop = true; vid.playsInline = true;
    node.appendChild(vid);
  } else if (it.kind === 'audio') {
    const aud = document.createElement('audio');
    aud.src = it.content || '';
    aud.autoplay = true; aud.controls = false;
    node.appendChild(aud);
  }

  applyStyles(node, it);
  root.appendChild(node);
  setupTimer(it);
}

function applyStyles(node, it) {
  node.style.left = (it.x || 0) + 'px';
  node.style.top = (it.y || 0) + 'px';
  if (it.w) node.style.width = it.w + 'px';
  if (it.h) node.style.height = it.h + 'px';
  node.style.zIndex = String(it.z || 1);

  if (it.kind === 'text') {
    node.style.fontSize = (it.fontSize || 40) + 'px';
    node.style.color = it.color || '#ffffff';
    node.style.background = it.bg || 'transparent';
    node.style.padding = '6px 10px';
    node.style.borderRadius = '8px';
  }
}

function renderTextHtml(src) {
  let s = (src || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ----- timers -----
function setupTimer(it) {
  const existing = timers.get(it.id);
  if (existing) { clearInterval(existing); timers.delete(it.id); }

  if (!it.timer) return;

  if (it.timer.type === 'countdown') {
    const node = document.querySelector(`[data-id="${it.id}"]`);
    if (!node) return;
    const fmt = it.timer.format || 'mm:ss';
    const update = ()=>{
      const left = Math.max(0, Math.floor((it.timer.deadline - Date.now())/1000));
      const m = Math.floor(left/60); const s = left%60;
      const txt = fmt.replace('mm', String(m).padStart(2,'0')).replace('ss', String(s).padStart(2,'0'));
      node.innerHTML = renderTextHtml(txt);
    };
    update();
    const id = setInterval(update, 200);
    timers.set(it.id, id);
  }
}
