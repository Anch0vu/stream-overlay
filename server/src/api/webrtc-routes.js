/**
 * Маршруты WebRTC
 * Информация о сервере ICE и статистика
 */

const express = require('express');
const router = express.Router();
const config = require('../config');
const { authMiddleware, moderatorOrStreamer } = require('../auth/middleware');
const logger = require('../utils/logger');

/**
 * GET /api/webrtc/ice-servers
 * Получение конфигурации ICE серверов
 */
router.get('/ice-servers', authMiddleware, (req, res) => {
  const iceServers = [
    // Публичные STUN серверы
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Добавляем TURN сервер если сконфигурирован
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
 * Получение статистики WebRTC сервера
 */
router.get('/stats', authMiddleware, moderatorOrStreamer, (req, res) => {
  // Статистика доступна через WebSocket, здесь базовая информация
  res.json({
    status: 'active',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

module.exports = router;

// Экспортируем функцию для привязки комнаты
module.exports.createWebRTCRoutes = (room) => {
  /**
   * GET /api/webrtc/room-stats
   * Детальная статистика комнаты
   */
  router.get('/room-stats', authMiddleware, moderatorOrStreamer, async (req, res) => {
    try {
      const stats = {
        peers: room.getPeerCount(),
        producers: room.getProducerIds().length,
        producerIds: room.getProducerIds(),
      };
      res.json(stats);
    } catch (err) {
      logger.error('Ошибка получения статистики комнаты', { error: err.message });
      res.status(500).json({ error: 'Ошибка получения статистики' });
    }
  });

  return router;
};
