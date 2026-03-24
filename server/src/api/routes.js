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

// Проверка здоровья сервера
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
