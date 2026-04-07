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
      setRemoteStreams((prev) => {
        prev.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        return [];
      });
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

  // Сбор реальных WebRTC-метрик каждые 2 секунды через RTCStatsReport
  useEffect(() => {
    if (!initialized) return;

    // Флаг для защиты от вызова setStats после размонтирования
    let active = true;
    // Сохраняем предыдущие байты для расчёта битрейта
    let prevBytes = 0;
    let prevTs = performance.now();

    const collectStats = async () => {
      const client = clientRef.current;
      if (!client) return;

      // Для стримера берём sendTransport, для модератора — recvTransport
      const transport = client.sendTransport || client.recvTransport;
      if (!transport) return;

      let report;
      try {
        report = await transport.getStats();
      } catch {
        return;
      }

      let fps = 0;
      let totalBytes = 0;
      let latencyMs = 0;
      let packetsLost = 0;
      let packetsTotal = 0;

      report.forEach((stat) => {
        // Видео-трек: fps и потеря пакетов
        if ((stat.type === 'outbound-rtp' || stat.type === 'inbound-rtp') && stat.kind === 'video') {
          fps = Math.round(stat.framesPerSecond || fps);
          packetsLost += stat.packetsLost || 0;
          packetsTotal += (stat.packetsSent || stat.packetsReceived || 0) + (stat.packetsLost || 0);
          totalBytes += stat.bytesSent || stat.bytesReceived || 0;
        }
        // ICE candidate-pair: RTT как latency
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          if (stat.currentRoundTripTime != null) {
            latencyMs = Math.round(stat.currentRoundTripTime * 1000);
          }
        }
      });

      // Битрейт = delta bytes * 8 / delta time
      const now = performance.now();
      const dt = (now - prevTs) / 1000;
      const bitrateBps = dt > 0 && totalBytes > prevBytes
        ? ((totalBytes - prevBytes) * 8) / dt
        : 0;
      prevBytes = totalBytes;
      prevTs = now;

      const packetLossPct = packetsTotal > 0
        ? Math.round((packetsLost / packetsTotal) * 1000) / 10
        : 0;

      if (!active) return;
      setStats({
        fps,
        bitrate: Math.max(0, bitrateBps),
        latency: latencyMs,
        packetLoss: packetLossPct,
      });
    };

    // Первый сбор сразу, потом каждые 2с
    collectStats();
    const interval = setInterval(collectStats, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [initialized]);

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
