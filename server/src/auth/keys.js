/**
 * Модуль управления одноразовыми ключами модераторов
 * Ключи хранятся в Redis с TTL
 */

const { v4: uuidv4 } = require('uuid');
const { getRedis } = require('../utils/redis');
const config = require('../config');
const logger = require('../utils/logger');

// Префикс для ключей в Redis
const KEY_PREFIX = 'mod_key:';

/**
 * Генерация нового одноразового ключа модератора
 * @param {string} streamerId — идентификатор стримера
 * @returns {object} — объект с ключом и временем жизни
 */
async function generateKey(streamerId) {
  const redis = getRedis();
  const key = uuidv4();
  const ttl = config.moderatorKeyTTL;

  // Сохраняем ключ в Redis с привязкой к стримеру
  const keyData = JSON.stringify({
    streamerId,
    createdAt: Date.now(),
    used: false,
  });

  await redis.setex(`${KEY_PREFIX}${key}`, ttl, keyData);

  logger.info('Ключ модератора создан', { streamerId, ttl });

  return {
    key,
    ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

/**
 * Валидация одноразового ключа модератора
 * @param {string} key — ключ для проверки
 * @returns {object|null} — данные ключа или null если невалиден
 */
async function validateKey(key) {
  const redis = getRedis();
  const data = await redis.get(`${KEY_PREFIX}${key}`);

  if (!data) {
    logger.warn('Попытка использования невалидного ключа', { key: key.substring(0, 8) + '...' });
    return null;
  }

  const keyData = JSON.parse(data);

  // Проверяем, не использован ли ключ ранее
  if (keyData.used) {
    logger.warn('Попытка повторного использования ключа', { key: key.substring(0, 8) + '...' });
    return null;
  }

  // Помечаем ключ как использованный и удаляем
  await redis.del(`${KEY_PREFIX}${key}`);

  logger.info('Ключ модератора использован', { streamerId: keyData.streamerId });

  return keyData;
}

/**
 * Получение списка активных ключей для стримера
 * @param {string} streamerId — идентификатор стримера
 * @returns {Array} — список активных ключей
 */
async function getActiveKeys(streamerId) {
  const redis = getRedis();
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  const activeKeys = [];

  for (const redisKey of keys) {
    const data = await redis.get(redisKey);
    if (data) {
      const keyData = JSON.parse(data);
      if (keyData.streamerId === streamerId && !keyData.used) {
        const ttl = await redis.ttl(redisKey);
        activeKeys.push({
          key: redisKey.replace(KEY_PREFIX, ''),
          ttl,
          createdAt: keyData.createdAt,
        });
      }
    }
  }

  return activeKeys;
}

/**
 * Отзыв (удаление) ключа модератора
 * @param {string} key — ключ для удаления
 */
async function revokeKey(key) {
  const redis = getRedis();
  const deleted = await redis.del(`${KEY_PREFIX}${key}`);

  if (deleted) {
    logger.info('Ключ модератора отозван', { key: key.substring(0, 8) + '...' });
  }

  return deleted > 0;
}

module.exports = { generateKey, validateKey, getActiveKeys, revokeKey };
