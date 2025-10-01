const stage = document.getElementById('stage');
const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/overlay');

let items = []; // [{id,kind,content,x,y,w,h,fontSize,color,bg,z}]

function elFor(it) {
  let el = document.querySelector(`[data-id="${it.id}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'item';
    el.dataset.id = it.id;
    stage.appendChild(el);
  }
  el.style.left = it.x + 'px';
  el.style.top = it.y + 'px';
  el.style.width = it.w + 'px';
  el.style.height = it.h + 'px';
  el.style.zIndex = it.z || 1;
  el.style.background = it.bg || 'transparent';

  if (it.kind === 'text') {
    el.classList.add('text');
    el.style.color = it.color || '#fff';
    el.style.fontSize = (it.fontSize || 40) + 'px';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '8px';
    el.style.overflow = 'hidden';
    el.innerHTML = marked.parse(it.content || '');
  } else if (it.kind === 'image') {
    el.classList.remove('text');
    el.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'image';
    img.src = it.content;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    el.appendChild(img);
  } else if (it.kind === 'video') {
    el.classList.remove('text');
    el.innerHTML = '';
    const v = document.createElement('video');
    v.className = 'video';
    v.src = it.content;
    v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.objectFit = 'contain';
    el.appendChild(v);
  } else if (it.kind === 'audio') {
    el.classList.remove('text');
    el.innerHTML = '';
    const a = document.createElement('audio');
    a.src = it.content;
    a.autoplay = true; a.controls = false;
    el.appendChild(a);
  }
}

function renderScene(sc) {
  items = sc.items || [];
  stage.innerHTML = '';
  items.sort((a,b)=> (a.z||1)-(b.z||1));
  for (const it of items) elFor(it);
}

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'scene.load') {
    renderScene(msg.scene);
  } else if (msg.type === 'scene.add') {
    items.push(msg.item);
    elFor(msg.item);
  } else if (msg.type === 'scene.update') {
    const i = items.findIndex(x => x.id === msg.item.id);
    if (i >= 0) items[i] = msg.item;
    elFor(msg.item);
  } else if (msg.type === 'scene.remove') {
    items = items.filter(x => x.id !== msg.id);
    const el = document.querySelector(`[data-id="${msg.id}"]`);
    if (el) el.remove();
  } else if (msg.type === 'scene.clear') {
    items = [];
    stage.innerHTML = '';
  }
};
