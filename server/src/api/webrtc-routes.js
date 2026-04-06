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
const logger = require('../utils/logger');

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

  return router;
}

module.exports = { createWebRTCRoutes };
