/**
 * Модуль WebSocket соединений
 * Обработка сигнализации WebRTC и синхронизации dok-панели
 *
 * Namespaces:
 *   /          — защищённый канал для стримера и модераторов (требует JWT)
 *   /overlay   — публичный канал только-чтение для OBS browser source
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
    // Origin check for the main namespace
    allowRequest: (req, callback) => {
      if (config.nodeEnv === 'development') {
        return callback(null, true);
      }
      const origin = req.headers.origin;
      // Strict equality — no startsWith to prevent prefix-matching attacks
      if (origin === config.corsOrigin) {
        return callback(null, true);
      }
      // Allow headless clients without Origin header (OBS browser source, native apps).
      // In Socket.IO v4 the namespace is established via protocol packets AFTER the HTTP
      // upgrade — it is NOT present in the initial request URL, so we cannot filter by
      // namespace here.  The /overlay namespace has no JWT middleware (public by design),
      // and the main namespace rejects unauthenticated connections via JWT middleware, so
      // allowing headless clients at the HTTP level is safe.
      if (!origin) {
        return callback(null, true);
      }
      callback('Недопустимый Origin', false);
    },
  });

  // ─────────────────────────────────────────────
  // MAIN NAMESPACE — требует JWT
  // ─────────────────────────────────────────────

  // Middleware аутентификации для основного namespace
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

  // Объявляем overlayNsp до io.on('connection') чтобы он был доступен внутри обработчиков
  const overlayNsp = io.of('/overlay');

  io.on('connection', (socket) => {
    const { role, id: userId } = socket.user;
    logger.info('WebSocket: подключение', { socketId: socket.id, role, userId });

    // --- WebRTC сигнализация ---

    socket.on('getRouterRtpCapabilities', (callback) => {
      try {
        const capabilities = room.getRouterRtpCapabilities();
        callback({ success: true, data: capabilities });
      } catch (err) {
        logger.error('Ошибка получения RTP capabilities', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    socket.on('createTransport', async ({ direction }, callback) => {
      try {
        const transportData = await room.createTransport(socket.id, direction);
        callback({ success: true, data: transportData });
      } catch (err) {
        logger.error('Ошибка создания транспорта', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        await room.connectTransport(socket.id, transportId, dtlsParameters);
        callback({ success: true });
      } catch (err) {
        logger.error('Ошибка подключения транспорта', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        if (role !== 'streamer') {
          return callback({ success: false, error: 'Только стример может публиковать поток' });
        }

        const producerId = await room.produce(socket.id, transportId, {
          kind,
          rtpParameters,
          appData,
        });

        socket.broadcast.emit('newProducer', { producerId, kind });
        callback({ success: true, data: { producerId } });
      } catch (err) {
        logger.error('Ошибка создания продюсера', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

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

    socket.on('resumeConsumer', async ({ consumerId }, callback) => {
      try {
        await room.resumeConsumer(socket.id, consumerId);
        callback({ success: true });
      } catch (err) {
        logger.error('Ошибка возобновления консьюмера', { error: err.message });
        callback({ success: false, error: err.message });
      }
    });

    socket.on('getProducers', (callback) => {
      const producerIds = room.getProducerIds();
      callback({ success: true, data: producerIds });
    });

    // --- Управление стримом (только модератор или стример) ---

    socket.on('setVolume', ({ producerId, volume }) => {
      if (role !== 'moderator' && role !== 'streamer') return;
      // Клamp volume в диапазон [0, 1] — защита от невалидных значений (NaN, Infinity, -99)
      const safeVolume = Math.max(0, Math.min(1, parseFloat(volume) || 0));
      io.emit('volumeChanged', { producerId, volume: safeVolume });
      // Relay to OBS overlay namespace as well
      overlayNsp.emit('volumeChanged', { producerId, volume: safeVolume });
      logger.debug('Громкость изменена', { producerId, volume: safeVolume, by: role });
    });

    socket.on('setOverlay', ({ type, url, options }) => {
      if (role !== 'moderator' && role !== 'streamer') return;
      io.emit('overlayChanged', { type, url, options });
      // Relay to OBS overlay namespace
      overlayNsp.emit('overlayChanged', { type, url, options });
      logger.debug('Overlay обновлён', { type, url, by: role });
    });

    socket.on('removeOverlay', () => {
      if (role !== 'moderator' && role !== 'streamer') return;
      io.emit('overlayRemoved');
      overlayNsp.emit('overlayRemoved');
      logger.debug('Overlay удалён', { by: role });
    });

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

    socket.on('kickPeer', ({ targetSocketId }) => {
      if (role !== 'streamer') return;
      // Prevent kicking yourself
      if (targetSocketId === socket.id) return;

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('kicked', { reason: 'Стример отключил вас' });
        targetSocket.disconnect(true);
        room.removePeer(targetSocketId);
        logger.info('Модератор отключён стримером', { targetSocketId });
      }
    });

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

    socket.on('disconnect', (reason) => {
      logger.info('WebSocket: отключение', { socketId: socket.id, role, reason });
      room.removePeer(socket.id);
      socket.broadcast.emit('peerDisconnected', { socketId: socket.id });
    });
  });

  // ─────────────────────────────────────────────
  // /overlay NAMESPACE — публичный, только-чтение
  // OBS browser source подключается сюда без JWT
  // (overlayNsp объявлен выше, перед io.on('connection'))
  // ─────────────────────────────────────────────
  overlayNsp.on('connection', (socket) => {
    logger.info('OBS overlay подключён', { socketId: socket.id });

    socket.on('disconnect', (reason) => {
      logger.info('OBS overlay отключён', { socketId: socket.id, reason });
    });
  });

  logger.info('WebSocket сервер инициализирован');
  return io;
}

module.exports = { initSocketServer };
