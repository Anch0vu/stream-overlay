/* Overlay renderer (минимальный): тянет сцену и синхронизирует mediaLayer */
(async function(){
  const STAGE = document.getElementById('stage'); // твой прозрачный контейнер
  const API = location.origin;

  // локальный кэш того, что сейчас играет
  const current = new Map(); // id -> url

  function desiredMediaFromScene(scene){
    const out = [];
    if (!scene || !Array.isArray(scene.items)) return out;
    for (const it of scene.items) {
      if (!it || !it.kind) continue;
      const k = String(it.kind).toLowerCase();
      if (k === 'audio' || k === 'video') {
        const url = (it.content || '').trim();
        if (!url) continue;
        // если ввели относительный путь в модере, нормализуем
        const abs = url.startsWith('http') ? url : (API + (url.startsWith('/')?url:'/'+url));
        out.push({
          id: String(it.id || it._id || ('m_'+Math.random().toString(36).slice(2))),
          url: abs,
          type: k,
          loop: !!it.loop,               // если нет в сцене — по умолчанию true ниже
          volume: isFinite(it.volume) ? Math.max(0, Math.min(1, it.volume)) : 1.0,
          muted: !!it.muted
        });
      }
    }
    return out;
  }

  function syncMedia(desired){
    const want = new Map(desired.map(d => [d.id, d]));

    // удалить лишние
    for (const [id, url] of Array.from(current.entries())) {
      if (!want.has(id)) {
        mediaLayer.stopMedia(id);
        current.delete(id);
      }
    }

    // добавить/обновить нужные
    for (const d of desired) {
      const prevUrl = current.get(d.id);
      const loop = (typeof d.loop === 'boolean') ? d.loop : true;
      if (prevUrl === d.url) {
        // уже играет — обновим только громкость/луп/мьют
        mediaLayer.playMedia(d.id, d.url, {type:d.type, loop, volume:d.volume, muted:d.muted});
        continue;
      }
      // новый или изменился URL — запускаем
      mediaLayer.playMedia(d.id, d.url, {type:d.type, loop, volume:d.volume, muted:d.muted});
      current.set(d.id, d.url);
    }
  }

  async function fetchScene(){
    const r = await fetch(API + '/api/scene', {cache:'no-cache'});
    return r.ok ? r.json() : {items:[]};
  }

  // первичная загрузка
  try { syncMedia(desiredMediaFromScene(await fetchScene())); } catch(e){ console.error(e); }

  // WebSocket обновления
  function connectWS(){
    const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://') + location.host + '/ws/overlay');
    ws.addEventListener('open', ()=>{
      // попытка «раскачать» автоплей в OBS/браузере
      try { mediaLayer._players && Array.from(mediaLayer._players.values()).forEach(p => p.el && p.el.play && p.el.play()); } catch(_){}
    });
    ws.addEventListener('message', (ev)=>{
      try{
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'scene.full' || msg?.type === 'scene.update') {
          syncMedia(desiredMediaFromScene(msg.scene || msg.data || {}));
        }
      }catch(e){ console.error(e); }
    });
    ws.addEventListener('close', ()=> setTimeout(connectWS, 1000));
    ws.addEventListener('error', ()=> { try{ ws.close(); }catch(_){ } });
  }
  connectWS();

  // на всякий — периодический поллинг, если WS где-то режется
  setInterval(async ()=>{
    try { syncMedia(desiredMediaFromScene(await fetchScene())); } catch(_){}
  }, 5000);
})();
