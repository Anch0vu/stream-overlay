/**
 * Маршруты WebRTC
 * Информация о сервере ICE и статистика
 *
 * Экспортируется фабрика createWebRTCRoutes(room) — принимает экземпляр Room
 * и возвращает Express-роутер.  Это позволяет избежать двойного module.exports,
 * который был в предыдущей версии и вызывал путаницу.
 */

const express = require('express');
const { monitorEventLoopDelay } = require('perf_hooks');
const config = require('../config');
const { authMiddleware, moderatorOrStreamer } = require('../auth/middleware');
const { getRedis } = require('../utils/redis');
const logger = require('../utils/logger');

// Memory baseline captured at module load — used to track growth over time
const _memBaseline = process.memoryUsage();

// Event loop lag histogram — samples every 20 ms, exposes .mean in nanoseconds
const _elMonitor = monitorEventLoopDelay({ resolution: 20 });
_elMonitor.enable();

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

    const rm = room.getMetrics();
    const rangeSize = config.mediasoup.maxPort - config.mediasoup.minPort + 1;

    // ── Invariant checks ──────────────────────────────────────────────────
    // Any entry here means the service is in an unexpected state.
    const violations = [];

    if (rm.workers.length !== config.mediasoup.numWorkers) {
      violations.push(`worker_count: expected ${config.mediasoup.numWorkers}, got ${rm.workers.length}`);
    }
    rm.workers.forEach((w) => {
      if (w.closed) violations.push(`worker_closed: index=${w.index} pid=${w.pid}`);
    });
    if (rm.transports < rm.producers) {
      violations.push(`transports_lt_producers: transports=${rm.transports} producers=${rm.producers}`);
    }
    const minExpectedConsumers = Math.max(0, rm.peers - 1);
    if (rm.peers > 1 && rm.consumers < minExpectedConsumers) {
      violations.push(`consumers_lt_peers_minus1: consumers=${rm.consumers} peers=${rm.peers}`);
    }
    if (!redisOk) {
      violations.push('redis_unreachable');
    }
    // Orphan transport check: active must equal opened - closed
    const { transportLifetime: tl } = rm;
    if (tl.active !== tl.opened - tl.closed) {
      violations.push(`orphan_transports: active=${tl.active} opened=${tl.opened} closed=${tl.closed}`);
    }
    // Port range constraint: 50–200
    if (rangeSize < 50) {
      violations.push(`port_range_too_small: ${rangeSize} (min 50)`);
    } else if (rangeSize > 200) {
      violations.push(`port_range_oversized: ${rangeSize} (max 200)`);
    }
    // ─────────────────────────────────────────────────────────────────────

    res.json({
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      // Event loop lag — p99 > 100 ms indicates blocking work on the main thread
      eventLoopLagMs: Math.round(_elMonitor.mean / 1e6),
      memory: {
        rss:           mem.rss,
        heapUsed:      mem.heapUsed,
        heapTotal:     mem.heapTotal,
        rssDelta:      mem.rss      - _memBaseline.rss,
        heapUsedDelta: mem.heapUsed - _memBaseline.heapUsed,
      },
      mediasoup: {
        configuredWorkers: config.mediasoup.numWorkers,
        workers:    rm.workers,
        peers:      rm.peers,
        transports: rm.transports,
        producers:  rm.producers,
        consumers:  rm.consumers,
        transportLifetime: tl,
        ports: {
          min:       config.mediasoup.minPort,
          max:       config.mediasoup.maxPort,
          rangeSize,
        },
      },
      redis: { ok: redisOk },
      // Empty array = healthy. Non-empty = something needs attention.
      violations,
    });
  });

  return router;
}

module.exports = { createWebRTCRoutes };
