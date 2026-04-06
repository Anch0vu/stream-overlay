/**
 * Главный роутер API
 * Объединяет все маршруты
 */

const express = require('express');
const router = express.Router();
const authRoutes = require('./auth-routes');
const mediaRoutes = require('./media-routes');
const { authMiddleware } = require('../auth/middleware');

// Подключаем группы маршрутов
router.use('/auth', authRoutes);
router.use('/media', mediaRoutes);

// Проверка здоровья сервера (public — для Docker healthcheck и мониторинга)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Детальная информация о системе (для UI dashboard) — требует авторизации
// /health намеренно публичный (Docker healthcheck), /system-info содержит
// внутренние данные (heap, PID) — доступен только авторизованным пользователям
router.get('/system-info', authMiddleware, (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    nodeVersion: process.version,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    pid: process.pid,
    platform: process.platform,
    cpuUsage: process.cpuUsage(),
  });
});

module.exports = router;
