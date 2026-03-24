/**
 * Маршруты аутентификации
 * Вход стримера и модератора, генерация ключей
 */

const express = require('express');
const router = express.Router();
const config = require('../config');
const { createToken, authMiddleware, streamerOnly } = require('../auth/middleware');
const { generateKey, validateKey, getActiveKeys, revokeKey } = require('../auth/keys');
const { authLimiter } = require('../utils/rate-limit');
const logger = require('../utils/logger');

/**
 * POST /api/auth/streamer
 * Авторизация стримера по паролю
 */
router.post('/streamer', authLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Пароль не указан' });
  }

  // Проверяем пароль стримера
  if (password !== config.streamer.password) {
    logger.warn('Неудачная попытка входа стримера', { ip: req.ip });
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  // Создаём JWT токен
  const token = createToken({
    id: 'streamer-main',
    role: 'streamer',
  });

  logger.info('Стример авторизован', { ip: req.ip });
  res.json({ token, role: 'streamer' });
});

/**
 * POST /api/auth/moderator
 * Авторизация модератора по одноразовому ключу
 */
router.post('/moderator', authLimiter, async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Ключ не указан' });
  }

  try {
    // Валидируем одноразовый ключ
    const keyData = await validateKey(key);

    if (!keyData) {
      logger.warn('Неудачная попытка входа модератора', { ip: req.ip });
      return res.status(401).json({ error: 'Невалидный или просроченный ключ' });
    }

    // Создаём JWT токен для модератора
    const token = createToken({
      id: `moderator-${Date.now()}`,
      role: 'moderator',
      streamerId: keyData.streamerId,
    });

    logger.info('Модератор авторизован', { ip: req.ip });
    res.json({ token, role: 'moderator' });
  } catch (err) {
    logger.error('Ошибка авторизации модератора', { error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/auth/keys/generate
 * Генерация одноразового ключа (только стример)
 */
router.post('/keys/generate', authMiddleware, streamerOnly, async (req, res) => {
  try {
    const keyData = await generateKey(req.user.id);
    res.json(keyData);
  } catch (err) {
    logger.error('Ошибка генерации ключа', { error: err.message });
    res.status(500).json({ error: 'Ошибка генерации ключа' });
  }
});

/**
 * GET /api/auth/keys
 * Получение списка активных ключей (только стример)
 */
router.get('/keys', authMiddleware, streamerOnly, async (req, res) => {
  try {
    const keys = await getActiveKeys(req.user.id);
    res.json(keys);
  } catch (err) {
    logger.error('Ошибка получения ключей', { error: err.message });
    res.status(500).json({ error: 'Ошибка получения ключей' });
  }
});

/**
 * DELETE /api/auth/keys/:key
 * Отзыв (удаление) ключа (только стример)
 */
router.delete('/keys/:key', authMiddleware, streamerOnly, async (req, res) => {
  try {
    const revoked = await revokeKey(req.params.key);
    if (revoked) {
      res.json({ message: 'Ключ отозван' });
    } else {
      res.status(404).json({ error: 'Ключ не найден' });
    }
  } catch (err) {
    logger.error('Ошибка отзыва ключа', { error: err.message });
    res.status(500).json({ error: 'Ошибка отзыва ключа' });
  }
});

/**
 * GET /api/auth/me
 * Получение информации о текущем пользователе
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    id: req.user.id,
    role: req.user.role,
  });
});

module.exports = router;
