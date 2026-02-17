/* Overlay renderer: sync сцены, media, TTS и отчеты latency/QoL. */
(async function(){
  const API = location.origin;
  const STAGE = document.getElementById('stage');

  const localScene = { items: [] };
  const currentMedia = new Map();
  let lastMediaHash = '';
  let lastVisualHash = '';
  let wsAlive = false;
  let lastAppliedVersion = 0;

  function normalizeMediaUrl(url){
    const raw = (url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return API + (raw.startsWith('/') ? raw : '/' + raw);
  }

  function mediaItems(scene){
    const out = [];
    const items = Array.isArray(scene?.items) ? scene.items : [];
    for (const it of items) {
      if (!it) continue;
      const kind = String(it.kind || '').toLowerCase();
      if (kind !== 'audio' && kind !== 'video') continue;
      const url = normalizeMediaUrl(it.content || it.src || '');
      if (!url) continue;
      out.push({
        id: String(it.id || ('m_' + Math.random().toString(36).slice(2))),
        kind,
        url,
        loop: typeof it.loop === 'boolean' ? it.loop : true,
        volume: Number.isFinite(it.volume) ? Math.max(0, Math.min(1, it.volume)) : 1,
        muted: !!it.muted,
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  function visualItems(scene){
    const out = [];
    const items = Array.isArray(scene?.items) ? scene.items : [];
    for (const it of items) {
      if (!it) continue;
      const kind = String(it.kind || '').toLowerCase();
      if (kind === 'audio' || kind === 'video') continue;
      const base = {
        id: String(it.id || ('v_' + Math.random().toString(36).slice(2))),
        kind,
        x: Number.isFinite(it.x) ? it.x : 0,
        y: Number.isFinite(it.y) ? it.y : 0,
        z: Number.isFinite(it.z) ? it.z : 1,
        w: Number.isFinite(it.w) ? it.w : null,
        h: Number.isFinite(it.h) ? it.h : null,
      };

      if (kind === 'text') {
        out.push({
          ...base,
          content: String(it.content || it.text || ''),
          font: Number.isFinite(it.font) ? it.font : (Number.isFinite(it.fontSize) ? it.fontSize : 40),
          color: String(it.color || '#ffffff'),
          bg: String(it.bg || 'transparent'),
        });
      } else {
        out.push({
          ...base,
          content: normalizeMediaUrl(it.content || it.src || ''),
        });
      }
    }
    out.sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
    return out;
  }

  function renderVisuals(scene){
    const list = visualItems(scene);
    const hash = JSON.stringify(list);
    if (hash === lastVisualHash) return;
    lastVisualHash = hash;

    STAGE.innerHTML = '';
    for (const it of list) {
      let el;
      if (it.kind === 'text') {
        el = document.createElement('div');
        el.className = 'layer text';
        el.textContent = it.content;
        el.style.fontSize = `${it.font || 40}px`;
        el.style.color = it.color || '#ffffff';
        el.style.background = it.bg || 'transparent';
        el.style.padding = '4px 6px';
        el.style.borderRadius = '4px';
      } else {
        el = document.createElement('img');
        el.className = `layer ${it.kind || 'image'}`;
        el.src = it.content || '';
        el.alt = '';
      }

      el.style.left = `${it.x || 0}px`;
      el.style.top = `${it.y || 0}px`;
      el.style.zIndex = String(it.z || 1);
      if (it.w) el.style.width = `${it.w}px`;
      if (it.h) el.style.height = `${it.h}px`;
      STAGE.appendChild(el);
    }
  }

  function mediaHash(list){
    return JSON.stringify(list.map((x) => [x.id, x.url, x.loop, x.volume, x.muted]));
  }

  function syncMedia(scene){
    const desired = mediaItems(scene);
    const newHash = mediaHash(desired);
    if (newHash === lastMediaHash) return;
    lastMediaHash = newHash;

    const wanted = new Map(desired.map((d) => [d.id, d]));
    for (const [id] of Array.from(currentMedia.entries())) {
      if (!wanted.has(id)) {
        mediaLayer.stopMedia(id);
        currentMedia.delete(id);
      }
    }

    for (const d of desired) {
      const prev = currentMedia.get(d.id);
      mediaLayer.playMedia(d.id, d.url, {
        type: d.kind,
        loop: d.loop,
        volume: d.volume,
        muted: d.muted,
      });
      if (prev !== d.url) currentMedia.set(d.id, d.url);
    }
  }

  async function reportApplied(version, serverTs){
    // Отправляем телеметрию применения для QoL-метрик.
    if (!Number.isFinite(version) || version <= lastAppliedVersion) return;
    lastAppliedVersion = version;
    try {
      await fetch(API + '/api/overlay/applied', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          version,
          server_ts: serverTs,
          client_ts: Date.now(),
        }),
      });
    } catch (_) {}
  }

  function applySceneFull(msg){
    const scene = msg?.scene || {};
    localScene.items = Array.isArray(scene.items) ? scene.items.slice() : [];
    renderVisuals(localScene);
    syncMedia(localScene);
    reportApplied(Number(msg?.version || scene?._version || 0), msg?.server_ts);
  }

  function applySceneDelta(msg){
    const type = msg?.type;
    const items = localScene.items;

    if (type === 'scene.add' && msg.item) {
      items.push(msg.item);
      renderVisuals(localScene);
      syncMedia(localScene);
      return;
    }
    if (type === 'scene.update' && msg.item) {
      const idx = items.findIndex((x) => x.id === msg.item.id);
      if (idx >= 0) items[idx] = msg.item;
      else items.push(msg.item);
      renderVisuals(localScene);
      syncMedia(localScene);
      return;
    }
    if (type === 'scene.remove') {
      const idx = items.findIndex((x) => x.id === msg.id);
      if (idx >= 0) items.splice(idx, 1);
      renderVisuals(localScene);
      syncMedia(localScene);
      return;
    }
    if (type === 'scene.clear') {
      localScene.items = [];
      renderVisuals(localScene);
      syncMedia(localScene);
    }
  }

  function speakTts(payload){
    // Поддержка нескольких TTS-профилей и выбора голоса по имени.
    if (!('speechSynthesis' in window)) return;
    const text = String(payload?.text || '').trim();
    if (!text) return;

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = payload?.lang || 'ru-RU';
    utter.rate = Number.isFinite(payload?.rate) ? payload.rate : 1;
    utter.pitch = Number.isFinite(payload?.pitch) ? payload.pitch : 1;
    utter.volume = Number.isFinite(payload?.volume) ? Math.max(0, Math.min(1, payload.volume)) : 1;

    const targetVoice = String(payload?.voiceName || '').trim().toLowerCase();
    if (targetVoice) {
      const voices = window.speechSynthesis.getVoices() || [];
      const found = voices.find(v => String(v.name || '').toLowerCase().includes(targetVoice));
      if (found) utter.voice = found;
    }

    window.speechSynthesis.speak(utter);
  }


  async function connectWebrtcViewer(){
    // WebRTC consumer: подключаемся только если задан room через query-параметр.
    const params = new URLSearchParams(location.search);
    const room = (params.get('webrtc_room') || '').trim();
    if (!room) return;

    let iceServers = [{urls:['stun:stun.l.google.com:19302']}];
    try {
      const cfgResp = await fetch(API + '/api/webrtc/config', {cache:'no-cache'});
      if (cfgResp.ok) {
        const cfg = await cfgResp.json();
        if (Array.isArray(cfg.iceServers) && cfg.iceServers.length) iceServers = cfg.iceServers;
      }
    } catch(_) {}

    const pc = new RTCPeerConnection({iceServers});
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + `/ws/webrtc/${encodeURIComponent(room)}/viewer`);

    let remoteVideo = document.getElementById('webrtc-remote-video');
    if (!remoteVideo) {
      remoteVideo = document.createElement('video');
      remoteVideo.id = 'webrtc-remote-video';
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.muted = true;
      remoteVideo.style.position = 'absolute';
      remoteVideo.style.inset = '0';
      remoteVideo.style.width = '100%';
      remoteVideo.style.height = '100%';
      remoteVideo.style.objectFit = 'cover';
      remoteVideo.style.zIndex = '0';
      STAGE.prepend(remoteVideo);
    }

    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        remoteVideo.srcObject = ev.streams[0];
      }
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      ws.send(JSON.stringify({type:'ice-candidate', candidate: ev.candidate}));
    };

    ws.addEventListener('message', async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch(_) { return; }

      if (msg.type === 'offer' && msg.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription({type:'offer', sdp: msg.sdp}));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({type:'answer', sdp: answer.sdp}));
      }

      if (msg.type === 'ice-candidate' && msg.candidate) {
        try { await pc.addIceCandidate(msg.candidate); } catch(_) {}
      }
    });

    ws.addEventListener('close', () => {
      try { pc.close(); } catch(_) {}
      setTimeout(() => connectWebrtcViewer(), 1200);
    });

    ws.addEventListener('error', () => {
      try { ws.close(); } catch(_) {}
    });
  }

  async function fetchScene(){
    const r = await fetch(API + '/api/scene', { cache: 'no-cache' });
    if (!r.ok) return { items: [] };
    return r.json();
  }

  async function bootstrap(){
    try {
      const scene = await fetchScene();
      applySceneFull({ scene, version: Number(scene?._version || 0), server_ts: Date.now() });
    } catch (e) {
      console.error('bootstrap scene failed', e);
    }
  }

  function connectWS(){
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/overlay');

    ws.addEventListener('open', () => {
      wsAlive = true;
    });

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'scene.full') applySceneFull(msg);
        else if (msg?.type?.startsWith('scene.')) applySceneDelta(msg);
        else if (msg?.type === 'tts.speak') speakTts(msg);
      } catch (e) {
        console.error('ws message parse failed', e);
      }
    });

    ws.addEventListener('close', () => {
      wsAlive = false;
      setTimeout(connectWS, 1000);
    });

    ws.addEventListener('error', () => {
      try { ws.close(); } catch (_) {}
    });
  }

  // Fallback-опрос только когда WS недоступен.
  setInterval(async () => {
    if (wsAlive) return;
    try {
      const scene = await fetchScene();
      applySceneFull({ scene, version: Number(scene?._version || 0), server_ts: Date.now() });
    } catch (_) {}
  }, 10000);

  await bootstrap();
  connectWS();
  connectWebrtcViewer();
})();
