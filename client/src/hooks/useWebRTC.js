/**
 * Хук WebRTC подключения
 * Управление mediasoup-client для публикации и приёма потоков
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCClient } from '../lib/webrtc';

/**
 * Хук для работы с WebRTC
 * @param {object} socket — экземпляр Socket.IO
 * @param {boolean} connected — статус подключения сокета
 */
export function useWebRTC(socket, connected) {
  const clientRef = useRef(null);
  const [initialized, setInitialized] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [stats, setStats] = useState({ fps: 0, bitrate: 0, latency: 0, packetLoss: 0 });

  // Инициализация при подключении сокета
  useEffect(() => {
    if (!socket || !connected) return;

    const client = new WebRTCClient(socket);
    clientRef.current = client;

    client.init()
      .then(() => {
        setInitialized(true);
        console.log('[useWebRTC] Инициализировано');
      })
      .catch((err) => {
        console.error('[useWebRTC] Ошибка инициализации:', err);
      });

    return () => {
      client.close();
      setInitialized(false);
      setPublishing(false);
    };
  }, [socket, connected]);

  /** Публикация потока (стример) */
  const publishStream = useCallback(async (stream) => {
    const client = clientRef.current;
    if (!client || !initialized) return;

    try {
      await client.publishStream(stream);
      setPublishing(true);
    } catch (err) {
      console.error('[useWebRTC] Ошибка публикации:', err);
      throw err;
    }
  }, [initialized]);

  /** Подписка на все доступные потоки (модератор) */
  const consumeAll = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !initialized) return;

    try {
      // Запрашиваем список продюсеров
      const response = await client._request('getProducers');
      const producerIds = response.data;
      const tracks = [];

      for (const producerId of producerIds) {
        const track = await client.consume(producerId);
        tracks.push(track);
      }

      // Собираем MediaStream из треков
      if (tracks.length > 0) {
        const stream = new MediaStream(tracks);
        setRemoteStreams([stream]);
      }
    } catch (err) {
      console.error('[useWebRTC] Ошибка подписки:', err);
    }
  }, [initialized]);

  /** Обработка нового продюсера */
  useEffect(() => {
    if (!socket || !connected) return;

    const handleNewProducer = async ({ producerId, kind }) => {
      console.log(`[useWebRTC] Новый продюсер: ${kind}`, producerId);
      const client = clientRef.current;
      if (!client || !initialized) return;

      try {
        const track = await client.consume(producerId);
        setRemoteStreams((prev) => {
          // Добавляем трек к существующему стриму или создаём новый
          if (prev.length > 0) {
            const stream = prev[0];
            stream.addTrack(track);
            return [...prev];
          }
          return [new MediaStream([track])];
        });
      } catch (err) {
        console.error('[useWebRTC] Ошибка подписки на нового продюсера:', err);
      }
    };

    socket.on('newProducer', handleNewProducer);
    return () => socket.off('newProducer', handleNewProducer);
  }, [socket, connected, initialized]);

  return {
    initialized,
    publishing,
    remoteStreams,
    stats,
    publishStream,
    consumeAll,
    client: clientRef.current,
  };
}
