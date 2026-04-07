/**
 * Маршруты WebRTC
 * Информация о сервере ICE и статистика
 *
 * Экспортируется фабрика createWebRTCRoutes(room) — принимает экземпляр Room
 * и возвращает Express-роутер.  Это позволяет избежать двойного module.exports,
 * который был в предыдущей версии и вызывал путаницу.
 */

const express = require('express');
const config = require('../config');
const { authMiddleware, moderatorOrStreamer } = require('../auth/middleware');
const { getRedis } = require('../utils/redis');
const logger = require('../utils/logger');

// Memory baseline captured at module load — used to track growth over time
const _memBaseline = process.memoryUsage();

/**
 * Создание роутера WebRTC маршрутов
 * @param {Room} room — экземпляр комнаты WebRTC
 * @returns {express.Router}
 */
function createWebRTCRoutes(room) {
  const router = express.Router();

  /**
   * GET /api/webrtc/ice-servers
   * Получение конфигурации ICE серверов
   */
  router.get('/ice-servers', authMiddleware, (req, res) => {
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (config.turn.url) {
      iceServers.push({
        urls: config.turn.url,
        username: config.turn.username,
        credential: config.turn.password,
      });
    }

    res.json({ iceServers });
  });

  /**
   * GET /api/webrtc/stats
   * Базовая статистика процесса (детальная — через WebSocket getStats)
   */
  router.get('/stats', authMiddleware, moderatorOrStreamer, (req, res) => {
    res.json({
      status: 'active',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  /**
   * GET /api/webrtc/room-stats
   * Детальная статистика комнаты (пиры, продюсеры)
   */
  router.get('/room-stats', authMiddleware, moderatorOrStreamer, async (req, res) => {
    try {
      res.json({
        peers: room.getPeerCount(),
        producers: room.getProducerIds().length,
        producerIds: room.getProducerIds(),
      });
    } catch (err) {
      logger.error('Ошибка получения статистики комнаты', { error: err.message });
      res.status(500).json({ error: 'Ошибка получения статистики' });
    }
  });

  /**
   * GET /api/webrtc/metrics
   * Runtime-метрики для проверки стабильности:
   *   - рост памяти (rss/heapUsed vs baseline при старте)
   *   - количество воркеров и их состояние
   *   - активные транспорты / продюсеры / консьюмеры
   *   - доступность Redis
   *   - диапазон UDP-портов из конфига
   *
   * Используется для: мониторинга утечек, проверки orphan-транспортов,
   * сверки worker-count с MEDIASOUP_WORKERS.
   */
  router.get('/metrics', authMiddleware, moderatorOrStreamer, async (req, res) => {
    const mem = process.memoryUsage();

    // Redis ping — проверяем доступность pubsub/session-store
    let redisOk = false;
    try {
      await getRedis().ping();
      redisOk = true;
    } catch {
      redisOk = false;
    }

    const roomMetrics = room.getMetrics();

    res.json({
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      memory: {
        rss:       mem.rss,
        heapUsed:  mem.heapUsed,
        heapTotal: mem.heapTotal,
        // Delta vs baseline at startup — positive growth is expected initially,
        // sustained linear growth over 30 min indicates a leak.
        rssDelta:      mem.rss      - _memBaseline.rss,
        heapUsedDelta: mem.heapUsed - _memBaseline.heapUsed,
      },
      mediasoup: {
        configuredWorkers: config.mediasoup.numWorkers,
        workers:    roomMetrics.workers,      // [{index, pid, closed}]
        peers:      roomMetrics.peers,
        transports: roomMetrics.transports,   // orphan check: should drop to 0 after all peers disconnect
        producers:  roomMetrics.producers,
        consumers:  roomMetrics.consumers,
        ports: {
          min: config.mediasoup.minPort,
          max: config.mediasoup.maxPort,
        },
      },
      redis: { ok: redisOk },
    });
  });

  return router;
}

module.exports = { createWebRTCRoutes };
