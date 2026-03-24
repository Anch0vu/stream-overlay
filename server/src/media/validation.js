/**
 * Модуль валидации медиафайлов
 * Проверка MIME, размера, защита от SSRF
 */

const mime = require('mime-types');
const { URL } = require('url');
const config = require('../config');
const logger = require('../utils/logger');

// Приватные IP-диапазоны для защиты от SSRF
const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^localhost$/i,
];

/**
 * Проверка допустимости MIME-типа файла
 * @param {string} mimeType — MIME-тип файла
 * @returns {boolean}
 */
function isAllowedMime(mimeType) {
  return config.media.allowedMimeTypes.includes(mimeType);
}

/**
 * Определение MIME-типа по расширению файла
 * @param {string} filename — имя файла
 * @returns {string|null}
 */
function getMimeFromFilename(filename) {
  return mime.lookup(filename) || null;
}

/**
 * Проверка размера файла
 * @param {number} sizeBytes — размер файла в байтах
 * @returns {boolean}
 */
function isAllowedSize(sizeBytes) {
  return sizeBytes <= config.media.maxFileSize;
}

/**
 * Проверка URL на SSRF (блокировка приватных адресов)
 * @param {string} urlStr — строка URL
 * @returns {object} — { safe: boolean, reason?: string }
 */
function validateExternalUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);

    // Разрешаем только http и https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'Разрешены только HTTP/HTTPS протоколы' };
    }

    const hostname = parsed.hostname;

    // Проверяем на приватные IP-адреса (защита от SSRF)
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        logger.warn('Попытка SSRF: заблокирован приватный адрес', { url: urlStr });
        return { safe: false, reason: 'Доступ к внутренним адресам заблокирован' };
      }
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: 'Невалидный URL' };
  }
}

/**
 * Валидация загружаемого файла
 * @param {object} file — файл из multer
 * @returns {object} — { valid: boolean, error?: string }
 */
function validateUploadedFile(file) {
  if (!file) {
    return { valid: false, error: 'Файл не предоставлен' };
  }

  // Проверка MIME-типа
  const detectedMime = file.mimetype;
  if (!isAllowedMime(detectedMime)) {
    return { valid: false, error: `Недопустимый тип файла: ${detectedMime}` };
  }

  // Проверка размера
  if (!isAllowedSize(file.size)) {
    const maxMb = Math.round(config.media.maxFileSize / 1048576);
    return { valid: false, error: `Файл слишком большой. Максимум: ${maxMb} МБ` };
  }

  return { valid: true };
}

module.exports = {
  isAllowedMime,
  getMimeFromFilename,
  isAllowedSize,
  validateExternalUrl,
  validateUploadedFile,
};
