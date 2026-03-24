/**
 * Модуль WebSocket соединений
 * Обработка сигнализации WebRTC и синхронизации док-панели
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Инициализация WebSocket сервера
 * @param {object} httpServer — HTTP сервер
 * @param {object} room — экземпляр комнаты WebRTC
 * @returns {object} — экземпляр Socket.IO
 */
function initSocketServer(httpServer, room) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Авторизация WebSocket через JWT
    allowRequest: (req, callback) => {
      // В режиме разработки разрешаем все подключения
      if (config.nodeEnv === 'development') {
        return callback(null, true);
      }
      // Проверяем Origin
      const origin = req.headers.origin;
      if (origin && origin.startsWith(config.corsOrigin)) {
        return callback(null, true);
      }
      callback('Недопустимый Origin', false);
    },
  });

  // Middleware аутентификации для сокетов
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Токен авторизации не предоставлен'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.user = decoded;
      next();
    } catch (err) {
      logger.warn('WebSocket: невалидный токен', { error: err.message });
      next(new Error('Невалидный токен'));
    }
  });

  // Обработка подключений
  io.on('connection', (socket) => {
    const { role, id: userId } = socket.user;
    logger.info('WebSocket: подключение', { socketId: socket.id, role, userId });

    // --- WebRTC сигнализация ---

    // Получение RTP capabilities роутера
    socket.on('getRouterRtpCapabilities', (callback) => {
      try {
        const capabilities = room.getRouterRtpCapabilities();
        callback({ success: true, data: capabilities });
      } catch (err) {
        logger.error('Ошибка получения RTP capabilities', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    // Создание транспорта
    socket.on('createTransport', async ({ direction }, callback) => {
      try {
        const transportData = await room.createTransport(socket.id, direction);
        callback({ success: true, data: transportData });
      } catch (err) {
        logger.error('Ошибка создания транспорта', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    // Подключение транспорта (DTLS)
    socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        await room.connectTransport(socket.id, transportId, dtlsParameters);
        callback({ success: true });
      } catch (err) {
        logger.error('Ошибка подключения транспорта', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    // Создание продюсера (стример отправляет поток)
    socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        // Только стример может создавать продюсеров
        if (role !== 'streamer') {
          return callback({ success: false, error: 'Только стример может публиковать поток' });
        }

        const producerId = await room.produce(socket.id, transportId, {
          kind,
          rtpParameters,
          appData,
        });

        // Уведомляем всех о новом продюсере
        socket.broadcast.emit('newProducer', { producerId, kind });

        callback({ success: true, data: { producerId } });
      } catch (err) {
        logger.error('Ошибка создания продюсера', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    // Создание консьюмера (модератор получает поток)
    socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
      try {
        const consumerData = await room.consume(
          socket.id,
          transportId,
          producerId,
          rtpCapabilities
        );
        callback({ success: true, data: consumerData });
      } catch (err) {
        logger.error('Ошибка создания консьюмера', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    // Возобновление консьюмера
    socket.on('resumeConsumer', async ({ consumerId }, callback) => {
      try {
        await room.resumeConsumer(socket.id, consumerId);
        callback({ success: true });
      } catch (err) {
        logger.error('Ошибка возобновления консьюмера', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    // Получение списка продюсеров
    socket.on('getProducers', (callback) => {
      const producerIds = room.getProducerIds();
      callback({ success: true, data: producerIds });
    });

    // --- Управление стримом (Dock Panel) ---

    // Изменение громкости
    socket.on('setVolume', ({ producerId, volume }) => {
      // Транслируем команду изменения громкости всем подключённым
      io.emit('volumeChanged', { producerId, volume });
      logger.debug('Громкость изменена', { producerId, volume });
    });

    // Управление overlay (медиаконтент поверх стрима)
    socket.on('setOverlay', ({ type, url, options }) => {
      io.emit('overlayChanged', { type, url, options });
      logger.debug('Overlay обновлён', { type, url });
    });

    // Удаление overlay
    socket.on('removeOverlay', () => {
      io.emit('overlayRemoved');
      logger.debug('Overlay удалён');
    });

    // Запрос статистики с сервера
    socket.on('getStats', async (callback) => {
      try {
        const stats = {
          peers: room.getPeerCount(),
          producers: room.getProducerIds().length,
        };
        callback({ success: true, data: stats });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    // --- Управление модераторами (только стример) ---

    // Отключение модератора
    socket.on('kickPeer', ({ targetSocketId }) => {
      if (role !== 'streamer') return;

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('kicked', { reason: 'Стример отключил вас' });
        targetSocket.disconnect(true);
        room.removePeer(targetSocketId);
        logger.info('Модератор отключён стримером', { targetSocketId });
      }
    });

    // Перезапуск пира
    socket.on('restartPeer', async ({ targetSocketId }, callback) => {
      if (role !== 'streamer') {
        return callback({ success: false, error: 'Только стример может перезапускать пиров' });
      }

      room.removePeer(targetSocketId);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('peerRestarted');
      }
      callback({ success: true });
    });

    // --- Отключение ---
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket: отключение', { socketId: socket.id, role, reason });
      room.removePeer(socket.id);

      // Уведомляем остальных
      socket.broadcast.emit('peerDisconnected', { socketId: socket.id });
    });
  });

  logger.info('WebSocket сервер инициализирован');
  return io;
}

module.exports = { initSocketServer };
