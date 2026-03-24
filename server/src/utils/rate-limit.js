/**
 * Модуль ограничения частоты запросов (Rate Limiting)
 * Защита от DDoS и брутфорса
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');

// Общий лимитер для API
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Слишком много запросов. Попробуйте позже.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
});

// Строгий лимитер для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // максимум 10 попыток
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Слишком много попыток авторизации. Подождите 15 минут.',
  },
});

// Лимитер для загрузки файлов
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 5, // максимум 5 загрузок в минуту
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Слишком частая загрузка файлов. Подождите.',
  },
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
