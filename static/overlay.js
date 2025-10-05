const stage = document.getElementById('stage');
const API_SCENE = '/api/scene';

function applyScene(scene){
  if(!scene || !scene.items) return;
  stage.innerHTML = '';
  for(const it of scene.items){
    let el;
    if(it.kind==='text'){ el = document.createElement('div'); el.className='layer text'; el.textContent = it.content||''; el.style.fontSize=(it.font||40)+'px'; el.style.color=it.color||'#fff'; el.style.background=it.bg||'transparent'; }
    else if(it.kind==='image'){ el = document.createElement('img'); el.className='layer'; el.src = it.content||''; }
    else if(it.kind==='video'){ el = document.createElement('video'); el.className='layer'; el.src = it.content||''; el.autoplay=true; el.loop=true; el.muted=true; }
    else if(it.kind==='audio'){ el = document.createElement('audio'); el.className='layer'; el.src = it.content||''; el.autoplay=true; el.controls=false; }
    if(!el) continue;
    el.style.left=(it.x||0)+'px'; el.style.top=(it.y||0)+'px';
    if(it.w) el.style.width=it.w+'px'; if(it.h) el.style.height=it.h+'px';
    el.style.zIndex=it.z||1;
    stage.appendChild(el);
  }
}

async function loadOnce(){
  try{ const r = await fetch(API_SCENE); if(r.ok){ applyScene(await r.json()); } }catch{}
}
loadOnce(); setInterval(loadOnce, 1500);

/* WebSocket (best-effort) */
try{
  const ws = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws/overlay');
  ws.onmessage = (e)=>{ try{ const data = JSON.parse(e.data); if(data && data.items) applyScene(data); }catch{} };
}catch(e){}
