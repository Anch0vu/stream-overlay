/**
 * Модуль логирования
 * Структурированные логи с уровнями через Winston
 */

const winston = require('winston');
const config = require('../config');

// Формат для вывода логов
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // Формируем строку лога с метаданными
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
  })
);

const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    // Вывод в консоль
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    // Запись ошибок в файл
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Общий лог
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
