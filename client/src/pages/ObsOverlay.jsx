/**
 * OBS Browser Source — прозрачный оверлей
 *
 * Эту страницу добавляют как Browser Source в OBS:
 *   URL: http://<server>:13777/obs
 *
 * Особенности:
 *   - Прозрачный фон (не закрывает сцену OBS)
 *   - Подключается к /overlay namespace без авторизации
 *   - Получает команды от модератора в реальном времени
 *   - Рендерит изображения, видео, GIF, WebM и аудио
 *   - Плавные переходы с CSS transitions
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// Типы медиа и их рендер-стратегии
const MEDIA_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

function getMediaType(url = '') {
  const lower = url.toLowerCase();
  if (/\.(mp3|ogg|wav|aac|flac)(\?|$)/i.test(lower)) return MEDIA_TYPES.AUDIO;
  if (/\.(mp4|webm|mov)(\?|$)/i.test(lower)) return MEDIA_TYPES.VIDEO;
  return MEDIA_TYPES.IMAGE;
}

export default function ObsOverlay() {
  const [overlay, setOverlay] = useState(null); // { type, url, options }
  const [visible, setVisible] = useState(false);
  const audioRef = useRef(null);
  const socketRef = useRef(null);

  // Подключение к /overlay namespace (без JWT)
  useEffect(() => {
    const socket = io('/overlay', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[OBS Overlay] Подключено к серверу');
    });

    socket.on('connect_error', (err) => {
      console.error('[OBS Overlay] Ошибка подключения:', err.message);
    });

    socket.on('overlayChanged', ({ type, url, options = {} }) => {
      // Fade out → swap content → fade in
      setVisible(false);
      setTimeout(() => {
        setOverlay({ type, url, options });
        setVisible(true);
      }, 200);
    });

    socket.on('overlayRemoved', () => {
      setVisible(false);
      setTimeout(() => setOverlay(null), 300);
    });

    socket.on('volumeChanged', ({ volume }) => {
      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, Math.min(1, (volume ?? 100) / 100));
      }
    });

    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  // Когда overlay появляется — запускаем аудио если нужно
  const handleMediaRef = useCallback((el) => {
    if (!el || !overlay) return;
    if (getMediaType(overlay.url) === MEDIA_TYPES.AUDIO) {
      audioRef.current = el;
    }
    el.play().catch(() => {
      // Autoplay blocked — overlay will remain silent until user interacts
    });
  }, [overlay]);

  if (!overlay) return null;

  const mediaType = getMediaType(overlay.url);
  const opacity = overlay.options?.opacity ?? 1;

  return (
    /*
     * Корневой div занимает весь экран, фон прозрачный.
     * pointer-events: none — не перехватывает клики в OBS.
     */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          opacity: visible ? opacity : 0,
          transition: 'opacity 0.25s ease',
          maxWidth: '100%',
          maxHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {mediaType === MEDIA_TYPES.VIDEO && (
          <video
            ref={handleMediaRef}
            src={overlay.url}
            autoPlay
            loop
            muted={false}
            playsInline
            style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain' }}
          />
        )}

        {mediaType === MEDIA_TYPES.IMAGE && (
          <img
            src={overlay.url}
            alt=""
            style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain' }}
          />
        )}

        {mediaType === MEDIA_TYPES.AUDIO && (
          // Аудио без визуального элемента — просто воспроизводим
          <audio
            ref={handleMediaRef}
            src={overlay.url}
            autoPlay
            loop={overlay.options?.loop ?? false}
          />
        )}
      </div>
    </div>
  );
}
