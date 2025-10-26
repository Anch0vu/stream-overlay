/**
 * Stable media layer: keeps <audio>/<video> elements outside canvas render.
 * - Caches players by id
 * - Does not restart if same URL
 * - Unlocks autoplay on first user gesture
 */
const mediaLayer = (() => {
  const container = document.createElement('div');
  container.id = 'media-layer';
  Object.assign(container.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '9999'
  });
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));

  const players = new Map();  // id -> {el,url,type}
  let autoplayUnlocked = false;
  const pending = new Set();  // ids waiting for unlock

  function tryPlay(el){
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.catch(()=>{/* ignored, will unlock later */});
    }
  }

  function unlockAutoplay(){
    if (autoplayUnlocked) return;
    autoplayUnlocked = true;
    for (const id of Array.from(pending)) {
      const ent = players.get(id);
      if (ent && ent.el && ent.el.paused) tryPlay(ent.el);
      pending.delete(id);
    }
  }

  // try to auto-unlock on any user gesture
  ['pointerdown','click','keydown','touchstart'].forEach(evt=>{
    window.addEventListener(evt, unlockAutoplay, {once:false, passive:true});
  });

  function ensureContainer(){
    if (!container.isConnected) document.body.appendChild(container);
  }

  function playMedia(id, url, {loop=true, volume=1.0, muted=false, type} = {}){
    ensureContainer();
    // если уже есть и тот же URL — ничего не делаем
    const existing = players.get(id);
    if (existing && existing.url === url) {
      // актуализируем громкость/луп
      existing.el.loop = !!loop;
      if (existing.el.tagName === 'AUDIO' || existing.el.tagName === 'VIDEO') {
        existing.el.volume = Math.max(0, Math.min(1, volume ?? 1));
        existing.el.muted  = !!muted;
      }
      return;
    }
    // иначе сначала стоп
    stopMedia(id);

    let el;
    const lower = (url||'').toLowerCase();
    const isVideo = type === 'video' || /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/.test(lower);
    const isAudio = type === 'audio' || /\.(mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/.test(lower);

    if (isVideo) {
      el = document.createElement('video');
      Object.assign(el, {src:url, loop:!!loop, autoplay:true, muted:!!muted, playsInline:true});
      Object.assign(el.style, {width:'100%', height:'100%', objectFit:'contain'});
      el.preload = 'auto';
      el.controls = false;
    } else if (isAudio) {
      el = document.createElement('audio');
      Object.assign(el, {src:url, loop:!!loop, autoplay:true});
      el.preload = 'auto';
      el.volume = Math.max(0, Math.min(1, volume ?? 1));
      el.muted  = !!muted;
      el.controls = false;
    } else {
      return; // неизвестный тип
    }

    // pointer-events выключены у контейнера — плеер не кликабелен поверх сцены
    container.appendChild(el);
    players.set(id, {el, url, type: isVideo?'video':'audio'});

    // пробуем стартануть
    tryPlay(el);
    if (el.paused) pending.add(id);
  }

  function stopMedia(id){
    const ent = players.get(id);
    if (!ent) return;
    try { ent.el.pause(); } catch(_) {}
    try { ent.el.remove(); } catch(_) {}
    players.delete(id);
    pending.delete(id);
  }

  function clearAll(){
    for (const [id,ent] of players) {
      try { ent.el.pause(); } catch(_) {}
      try { ent.el.remove(); } catch(_) {}
    }
    players.clear();
    pending.clear();
  }

  // полезно для отладки в DevTools
  window.mediaLayer = { playMedia, stopMedia, clearAll };

  return { playMedia, stopMedia, clearAll, _players: players };
})();
