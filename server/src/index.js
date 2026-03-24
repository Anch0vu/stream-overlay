/**
 * Точка входа серверного приложения
 * OnionRP Streaming Tool — WebRTC Node
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const { initRedis } = require('./utils/redis');
const { apiLimiter } = require('./utils/rate-limit');
const apiRoutes = require('./api/routes');
const { createWebRTCRoutes } = require('./api/webrtc-routes');
const { initSocketServer } = require('./ws/socket');
const Room = require('./webrtc/room');

async function startServer() {
  logger.info('=== OnionRP Streaming Tool — запуск ===');

  // --- Инициализация Redis ---
  initRedis();

  // --- Инициализация Express ---
  const app = express();
  const httpServer = http.createServer(app);

  // --- Безопасность ---
  app.use(helmet({
    // Разрешаем WebSocket и медиа
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // --- CORS ---
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // --- Парсеры ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // --- Rate Limiting ---
  app.use('/api', apiLimiter);

  // --- Статические файлы медиахранилища ---
  app.use('/media', express.static(config.media.uploadDir, {
    // Запрещаем листинг директории
    dotfiles: 'deny',
    index: false,
  }));

  // --- Инициализация WebRTC комнаты ---
  const room = new Room();
  await room.init(config.mediasoup.numWorkers);
  logger.info('WebRTC комната инициализирована');

  // --- API маршруты ---
  app.use('/api', apiRoutes);
  app.use('/api/webrtc', createWebRTCRoutes(room));

  // --- Инициализация WebSocket ---
  const io = initSocketServer(httpServer, room);

  // --- Обработка ошибок ---
  app.use((err, req, res, _next) => {
    logger.error('Необработанная ошибка', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  // --- Запуск HTTP сервера ---
  httpServer.listen(config.port, config.host, () => {
    logger.info(`Сервер запущен на ${config.host}:${config.port}`);
    logger.info(`Окружение: ${config.nodeEnv}`);
    logger.info(`CORS: ${config.corsOrigin}`);
  });

  // --- Корректное завершение ---
  const shutdown = async (signal) => {
    logger.info(`Получен сигнал ${signal}, завершение...`);
    await room.close();
    httpServer.close(() => {
      logger.info('Сервер остановлен');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Ловим необработанные ошибки
  process.on('uncaughtException', (err) => {
    logger.error('Необработанное исключение', { error: err.message, stack: err.stack });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Необработанный промис', { reason: String(reason) });
  });
}

// Запускаем сервер
startServer().catch((err) => {
  logger.error('Критическая ошибка запуска', { error: err.message });
  process.exit(1);
});
