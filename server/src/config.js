/**
 * Конфигурация приложения
 * Все настройки загружаются из переменных окружения
 */

require('dotenv').config();

const config = {
  // --- Общие ---
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.SERVER_PORT, 10) || 3001,

  // --- Redis ---
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },

  // --- JWT ---
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // --- Стример ---
  streamer: {
    password: process.env.STREAMER_PASSWORD || '',
  },

  // --- Ключи модератора ---
  moderatorKeyTTL: parseInt(process.env.MODERATOR_KEY_TTL, 10) || 600,

  // --- mediasoup ---
  mediasoup: {
    // Количество воркеров — по числу ядер процессора
    numWorkers: require('os').cpus().length,
    listenIp: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
    minPort: parseInt(process.env.MEDIASOUP_MIN_PORT, 10) || 40000,
    maxPort: parseInt(process.env.MEDIASOUP_MAX_PORT, 10) || 49999,
    logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
  },

  // --- TURN сервер ---
  turn: {
    url: process.env.TURN_SERVER_URL || '',
    username: process.env.TURN_SERVER_USERNAME || '',
    password: process.env.TURN_SERVER_PASSWORD || '',
  },

  // --- Медиахранилище ---
  media: {
    uploadDir: process.env.MEDIA_UPLOAD_DIR || './media/uploads',
    maxFileSize: parseInt(process.env.MEDIA_MAX_FILE_SIZE, 10) || 52428800, // 50MB
    maxVideoDuration: parseInt(process.env.MEDIA_MAX_VIDEO_DURATION, 10) || 300, // 5 минут
    // Разрешённые MIME-типы
    allowedMimeTypes: [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/ogg', 'audio/wav',
    ],
  },

  // --- Rate Limiting ---
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // --- CORS ---
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

module.exports = config;
