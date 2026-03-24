/**
 * Модуль подключения к Redis
 * Используется для хранения временных ключей модераторов
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('./logger');

let redisClient = null;

/**
 * Инициализация подключения к Redis
 */
function initRedis() {
  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy: (times) => {
      // Повторная попытка подключения с экспоненциальной задержкой
      const delay = Math.min(times * 200, 5000);
      logger.warn(`Redis: повторная попытка подключения #${times}, задержка: ${delay}мс`);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redisClient.on('connect', () => {
    logger.info('Redis: подключение установлено');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis: ошибка подключения', { error: err.message });
  });

  redisClient.on('close', () => {
    logger.warn('Redis: соединение закрыто');
  });

  return redisClient;
}

/**
 * Получение клиента Redis
 */
function getRedis() {
  if (!redisClient) {
    return initRedis();
  }
  return redisClient;
}

module.exports = { initRedis, getRedis };
