const WS = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/moderator');

let scene = {items:[]};
let selectedId = null;
const grid = (window.APP_CFG && window.APP_CFG.grid) || 20;

const els = {
  items: document.getElementById('items'),
  uploads: document.getElementById('upload-list'),
  canvas: document.getElementById('canvas'),
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
  flock: document.getElementById('f-lock'),
};

function byId(id){ return scene.items.find(x=>x.id===id); }

function snap(v){ return Math.round(v / grid) * grid; }

function renderList(){
  els.items.innerHTML = '';
  const sorted = [...scene.items].sort((a,b)=>(a.z||1)-(b.z||1));
  for(const it of sorted){
    const li = document.createElement('li');
    li.textContent = `[${it.kind}] ${it.id}`;
    li.style.cursor='pointer';
    if (it.id===selectedId) li.style.outline='1px solid #6aa7ff';
    li.onclick = ()=> select(it.id);
    els.items.appendChild(li);
  }
}

function select(id){
  selectedId = id;
  const it = byId(id);
  if(!it) return;
  els.fid.value = it.id;
  els.fkind.value = it.kind;
  els.fcontent.value = it.content || '';
  els.fx.value = it.x|0; els.fy.value = it.y|0; els.fw.value = it.w|0; els.fh.value = it.h|0;
  els.ffont.value = it.fontSize||40; els.fcolor.value = it.color||'#ffffff'; els.fbg.value = it.bg||'transparent';
  els.fz.value = it.z||1;
  els.flock.checked = !!it.lockRatio;
  renderCanvas();
  renderList();
}

function renderCanvas(){
  els.canvas.innerHTML = '';
  for(const it of scene.items){
    const div = document.createElement('div');
    div.className = 'canvas-item' + (it.id===selectedId?' selected':'');
    div.dataset.id = it.id;
    div.style.left = it.x+'px';
    div.style.top = it.y+'px';
    div.style.width = it.w+'px';
    div.style.height = it.h+'px';
    div.style.background = it.bg||'transparent';
    div.style.zIndex = (it.z||1);

    div.onclick = (e)=>{ e.stopPropagation(); select(it.id); };

    // drag
    let dragging=false, sx=0, sy=0, ox=0, oy=0;
    div.addEventListener('mousedown', e=>{
      if(e.target.classList.contains('handle')) return;
      dragging=true; sx=e.clientX; sy=e.clientY; ox=it.x; oy=it.y;
      select(it.id);
    });
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      const nx = (ox + (e.clientX-sx));
      const ny = (oy + (e.clientY-sy));
      it.x = snap(nx);
      it.y = snap(ny);
      div.style.left = it.x+'px';
      div.style.top = it.y+'px';
      // live sync формы
      if (it.id===selectedId){ els.fx.value=it.x; els.fy.value=it.y; }
    });
    window.addEventListener('mouseup', ()=> dragging=false);

    // resize handles
    ['nw','ne','sw','se'].forEach(pos=>{
      const h = document.createElement('div'); h.className = 'handle '+pos; div.appendChild(h);
      let resizing=false, sx=0, sy=0, ow=0, oh=0, ox=0, oy=0, ratio = it.w/it.h || 1;
      h.addEventListener('mousedown', e=>{
        e.stopPropagation();
        resizing=true; sx=e.clientX; sy=e.clientY; ow=it.w; oh=it.h; ox=it.x; oy=it.y; ratio = it.w/it.h || 1;
        select(it.id);
      });
      window.addEventListener('mousemove', e=>{
        if(!resizing) return;
        let dx = e.clientX - sx;
        let dy = e.clientY - sy;
        if (pos==='nw'){ it.x = snap(ox + dx); it.y = snap(oy + dy); it.w = snap(ow - dx); it.h = snap(oh - dy); }
        if (pos==='ne'){ it.y = snap(oy + dy); it.w = snap(ow + dx); it.h = snap(oh - dy); }
        if (pos==='sw'){ it.x = snap(ox + dx); it.w = snap(ow - dx); it.h = snap(oh + dy); }
        if (pos==='se'){ it.w = snap(ow + dx); it.h = snap(oh + dy); }
        if (els.flock.checked && (it.kind==='image' || it.kind==='video')){
          // сохраняем пропорции
          if (it.w/it.h > ratio) it.w = snap(Math.round(it.h*ratio));
          else it.h = snap(Math.round(it.w/ratio));
          // для северных ручек корректируем x/y чтобы держать угол
          if (pos==='nw'){ it.x = snap(ox + (ow - it.w)); it.y = snap(oy + (oh - it.h)); }
          if (pos==='ne'){ it.y = snap(oy + (oh - it.h)); }
          if (pos==='sw'){ it.x = snap(ox + (ow - it.w)); }
        }
        // минималки
        it.w = Math.max(20, it.w); it.h = Math.max(20, it.h);
        div.style.left = it.x+'px'; div.style.top = it.y+'px';
        div.style.width = it.w+'px'; div.style.height = it.h+'px';
        if (it.id===selectedId){ els.fw.value=it.w; els.fh.value=it.h; els.fx.value=it.x; els.fy.value=it.y; }
      });
      window.addEventListener('mouseup', ()=> resizing=false);
    });

    els.canvas.appendChild(div);
  }
}

function push(cmd){
  WS.readyState===1 && WS.send(JSON.stringify(cmd));
}

function addText(){
  const content = prompt('Text (Markdown allowed):','**Новый текст**') || '';
  const item = {kind:'text', content, x:100, y:100, w:400, h:140, color:'#ffffff', bg:'transparent', fontSize:40, z:1};
  push({type:'add', item});
}
function addImageUrl(){
  const url = prompt('Image URL (/uploads/.. или внешний):','/uploads/');
  if(!url) return;
  const item = {kind:'image', content:url, x:200, y:150, w:400, h:300, z:1, lockRatio:true};
  push({type:'add', item});
}
function addVideoUrl(){
  const url = prompt('Video URL (.mp4/.webm):','/uploads/');
  if(!url) return;
  const item = {kind:'video', content:url, x:250, y:200, w:480, h:270, z:1, lockRatio:true};
  push({type:'add', item});
}
function clearAll(){ if(confirm('Clear all items?')) push({type:'clear'}); }
function bringToFront(){ if(!selectedId) return; push({type:'bringToFront', id:selectedId}); }
function removeSel(){ if(!selectedId) return; push({type:'remove', id:selectedId}); }

function updateSel(){
  if(!selectedId) return;
  const payload = {
    id: selectedId,
    kind: els.fkind.value,
    content: els.fcontent.value, // важно: берём из textarea, не хардкод
    x: parseInt(els.fx.value||0,10),
    y: parseInt(els.fy.value||0,10),
    w: parseInt(els.fw.value||0,10),
    h: parseInt(els.fh.value||0,10),
    fontSize: parseInt(els.ffont.value||40,10),
    color: els.fcolor.value || '#ffffff',
    bg: els.fbg.value || 'transparent',
    z: parseInt(els.fz.value||1,10),
    lockRatio: !!els.flock.checked
  };
  push({type:'update', item: payload});
}

document.getElementById('btn-add-text').onclick = addText;
document.getElementById('btn-add-image').onclick = addImageUrl;
document.getElementById('btn-add-video').onclick = addVideoUrl;
document.getElementById('btn-clear').onclick = clearAll;
document.getElementById('btn-front').onclick = bringToFront;
document.getElementById('btn-remove').onclick = removeSel;
document.getElementById('btn-update').onclick = updateSel;

document.getElementById('file-upload').addEventListener('change', async e=>{
  const f = e.target.files[0];
  if(!f) return;
  const fd = new FormData();
  fd.append('file', f);
  const r = await fetch('/api/upload', {method:'POST', body:fd});
  const j = await r.json();
  if(j.ok){
    await loadUploads();
    // сразу добавить на сцену как image/video/audio по mime
    if (j.mime.startsWith('image/')) push({type:'add', item:{kind:'image', content:j.url, x:100,y:100,w:400,h:300, z:1, lockRatio:true}});
    else if (j.mime.startsWith('video/')) push({type:'add', item:{kind:'video', content:j.url, x:120,y:120,w:480,h:270, z:1, lockRatio:true}});
    else if (j.mime.startsWith('audio/')) push({type:'add', item:{kind:'audio', content:j.url, x:140,y:140,w:200,h:60, z:1}});
  } else {
    alert('Upload failed: '+(j.error||'unknown'));
  }
  e.target.value = '';
});

async function loadUploads(){
  const r = await fetch('/api/uploads');
  const j = await r.json();
  els.uploads.innerHTML = '';
  for(const f of j.files){
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = f.url; a.textContent = f.name; a.target = '_blank';
    const btn = document.createElement('button');
    btn.textContent = 'Add to scene';
    btn.style.marginLeft='8px';
    btn.onclick = ()=>{
      if (f.mime.startsWith('image/')) push({type:'add', item:{kind:'image', content:f.url, x:100,y:100,w:400,h:300, z:1, lockRatio:true}});
      else if (f.mime.startsWith('video/')) push({type:'add', item:{kind:'video', content:f.url, x:120,y:120,w:480,h:270, z:1, lockRatio:true}});
      else if (f.mime.startsWith('audio/')) push({type:'add', item:{kind:'audio', content:f.url, x:140,y:140,w:200,h:60, z:1}});
    };
    li.appendChild(a);
    li.appendChild(btn);
    els.uploads.appendChild(li);
  }
}

els.canvas.addEventListener('click', ()=> { selectedId=null; renderCanvas(); renderList(); });

window.addEventListener('keydown', e=>{
  if(!selectedId) return;
  const it = byId(selectedId);
  if(!it) return;
  const step = e.shiftKey ? grid : Math.max(1, grid/4);
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete'].includes(e.key)) e.preventDefault();
  if (e.key==='ArrowLeft'){ it.x = snap(it.x - step); }
  if (e.key==='ArrowRight'){ it.x = snap(it.x + step); }
  if (e.key==='ArrowUp'){ it.y = snap(it.y - step); }
  if (e.key==='ArrowDown'){ it.y = snap(it.y + step); }
  if (e.key==='Delete'){ removeSel(); return; }
  renderCanvas();
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    els.fx.value=it.x; els.fy.value=it.y;
    updateSel(); // пушим сразу
  }
});

WS.onmessage = e=>{
  const msg = JSON.parse(e.data);
  if (msg.type==='scene.load'){
    scene = msg.scene || {items:[]};
    renderList(); renderCanvas();
  } else if (msg.type==='scene.add'){
    scene.items.push(msg.item);
    renderList(); renderCanvas();
  } else if (msg.type==='scene.update'){
    const i = scene.items.findIndex(x=>x.id===msg.item.id);
    if (i>=0) scene.items[i] = msg.item;
    if (selectedId===msg.item.id) select(selectedId);
    renderList(); renderCanvas();
  } else if (msg.type==='scene.remove'){
    scene.items = scene.items.filter(x=>x.id!==msg.id);
    if (selectedId===msg.id) selectedId=null;
    renderList(); renderCanvas();
  } else if (msg.type==='scene.clear'){
    scene.items = [];
    selectedId=null;
    renderList(); renderCanvas();
  }
};

window.addEventListener('load', loadUploads);
