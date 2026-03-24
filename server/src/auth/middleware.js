/**
 * Middleware аутентификации
 * Проверка JWT токенов и ролей
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Проверка JWT токена из заголовка Authorization
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен авторизации не предоставлен' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('Невалидный JWT токен', { error: err.message });
    return res.status(401).json({ error: 'Невалидный или просроченный токен' });
  }
}

/**
 * Проверка роли стримера
 */
function streamerOnly(req, res, next) {
  if (!req.user || req.user.role !== 'streamer') {
    return res.status(403).json({ error: 'Доступ только для стримера' });
  }
  next();
}

/**
 * Проверка роли модератора или стримера
 */
function moderatorOrStreamer(req, res, next) {
  if (!req.user || !['streamer', 'moderator'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

/**
 * Создание JWT токена
 * @param {object} payload — данные для токена
 * @returns {string} — подписанный JWT
 */
function createToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Проверка Origin запроса
 */
function originCheck(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  const allowed = config.corsOrigin;

  // В режиме разработки пропускаем проверку
  if (config.nodeEnv === 'development') {
    return next();
  }

  if (!origin || !origin.startsWith(allowed)) {
    logger.warn('Запрос с неразрешённого Origin', { origin });
    return res.status(403).json({ error: 'Недопустимый источник запроса' });
  }

  next();
}

module.exports = {
  authMiddleware,
  streamerOnly,
  moderatorOrStreamer,
  createToken,
  originCheck,
};
