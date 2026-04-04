/**
 * Главный роутер API
 * Объединяет все маршруты
 */

const express = require('express');
const router = express.Router();
const authRoutes = require('./auth-routes');
const mediaRoutes = require('./media-routes');

// Подключаем группы маршрутов
router.use('/auth', authRoutes);
router.use('/media', mediaRoutes);

// Проверка здоровья сервера (basic — для Docker healthcheck)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Детальная информация о системе (для UI dashboard)
router.get('/system-info', (req, res) => {
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
