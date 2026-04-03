/**
 * Модуль управления комнатой WebRTC
 * Управляет воркерами mediasoup, роутерами и пирами
 */

const mediasoup = require('mediasoup');
const {
  workerSettings,
  routerMediaCodecs,
  webRtcTransportOptions,
} = require('./mediasoup-config');
const logger = require('../utils/logger');

class Room {
  constructor() {
    // Массив воркеров mediasoup
    this.workers = [];
    // Индекс текущего воркера для балансировки
    this.nextWorkerIdx = 0;
    // Роутер комнаты
    this.router = null;
    // Карта пиров (socketId -> Peer)
    this.peers = new Map();
    // Продюсеры (один стример)
    this.producers = new Map();
    // Консьюмеры (модераторы/зрители)
    this.consumers = new Map();
  }

  /**
   * Инициализация воркеров mediasoup
   * @param {number} numWorkers — количество воркеров
   */
  async init(numWorkers) {
    logger.info(`Инициализация ${numWorkers} воркеров mediasoup`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker(workerSettings);

      worker.on('died', () => {
        logger.error(`Воркер mediasoup #${i} умер, перезапуск...`);
        setTimeout(() => this._replaceWorker(i, 1), 2000);
      });

      this.workers.push(worker);
      logger.info(`Воркер mediasoup #${i} запущен, PID: ${worker.pid}`);
    }

    // Создаём роутер на первом воркере
    this.router = await this.workers[0].createRouter({
      mediaCodecs: routerMediaCodecs,
    });

    logger.info('Роутер mediasoup создан');
  }

  /**
   * Замена упавшего воркера с экспоненциальным откатом
   * @param {number} index — индекс воркера для замены
   * @param {number} attempt — номер попытки (для backoff)
   */
  async _replaceWorker(index, attempt = 1) {
    const MAX_ATTEMPTS = 10;
    const BASE_DELAY_MS = 2000;
    const MAX_DELAY_MS = 30000;

    if (attempt > MAX_ATTEMPTS) {
      logger.error(`Воркер mediasoup #${index} не восстановлен после ${MAX_ATTEMPTS} попыток, сдаёмся`);
      return;
    }

    try {
      const worker = await mediasoup.createWorker(workerSettings);
      worker.on('died', () => {
        logger.error(`Воркер mediasoup #${index} повторно умер`);
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
        setTimeout(() => this._replaceWorker(index, attempt + 1), delay);
      });
      this.workers[index] = worker;
      logger.info(`Воркер mediasoup #${index} перезапущен, PID: ${worker.pid}`);

      // Если упавший воркер был тем, на котором работает роутер — пересоздаём роутер
      if (index === 0 && (!this.router || this.router.closed)) {
        this.router = await worker.createRouter({ mediaCodecs: routerMediaCodecs });
        logger.info('Роутер mediasoup пересоздан на новом воркере #0');
      }
    } catch (err) {
      logger.error('Ошибка перезапуска воркера', { error: err.message, attempt });
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      setTimeout(() => this._replaceWorker(index, attempt + 1), delay);
    }
  }

  /**
   * Получение возможностей роутера (RTP Capabilities)
   */
  getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  /**
   * Создание WebRTC транспорта
   * @param {string} socketId — идентификатор сокета пира
   * @param {string} direction — 'send' или 'recv'
   * @returns {object} — параметры транспорта для клиента
   */
  async createTransport(socketId, direction) {
    const transport = await this.router.createWebRtcTransport(webRtcTransportOptions);

    // Получаем или создаём объект пира
    if (!this.peers.has(socketId)) {
      this.peers.set(socketId, {
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
    }

    const peer = this.peers.get(socketId);
    peer.transports.set(transport.id, transport);

    logger.info('Транспорт создан', {
      socketId,
      direction,
      transportId: transport.id,
    });

    // Слушаем закрытие транспорта
    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        logger.info('Транспорт закрыт (DTLS)', { transportId: transport.id });
        transport.close();
      }
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  /**
   * Подключение транспорта (DTLS handshake)
   * @param {string} socketId — идентификатор сокета
   * @param {string} transportId — идентификатор транспорта
   * @param {object} dtlsParameters — DTLS параметры от клиента
   */
  async connectTransport(socketId, transportId, dtlsParameters) {
    const peer = this.peers.get(socketId);
    if (!peer) throw new Error('Пир не найден');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Транспорт не найден');

    await transport.connect({ dtlsParameters });
    logger.info('Транспорт подключён', { socketId, transportId });
  }

  /**
   * Создание продюсера (стример отправляет медиа)
   * @param {string} socketId — идентификатор сокета
   * @param {string} transportId — идентификатор транспорта
   * @param {object} params — параметры продюсера (kind, rtpParameters)
   * @returns {string} — идентификатор продюсера
   */
  async produce(socketId, transportId, { kind, rtpParameters, appData }) {
    const peer = this.peers.get(socketId);
    if (!peer) throw new Error('Пир не найден');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Транспорт не найден');

    const producer = await transport.produce({ kind, rtpParameters, appData });

    peer.producers.set(producer.id, producer);
    this.producers.set(producer.id, { producer, socketId });

    logger.info('Продюсер создан', {
      socketId,
      producerId: producer.id,
      kind,
    });

    producer.on('transportclose', () => {
      logger.info('Продюсер закрыт (транспорт)', { producerId: producer.id });
      producer.close();
      peer.producers.delete(producer.id);
      this.producers.delete(producer.id);
    });

    return producer.id;
  }

  /**
   * Создание консьюмера (модератор/зритель получает медиа)
   * @param {string} socketId — идентификатор сокета
   * @param {string} transportId — идентификатор транспорта
   * @param {string} producerId — идентификатор продюсера
   * @param {object} rtpCapabilities — RTP возможности клиента
   * @returns {object} — параметры консьюмера для клиента
   */
  async consume(socketId, transportId, producerId, rtpCapabilities) {
    // Проверяем, может ли роутер создать консьюмера
    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Невозможно создать консьюмера для данного продюсера');
    }

    const peer = this.peers.get(socketId);
    if (!peer) throw new Error('Пир не найден');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Транспорт не найден');

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Начинаем в паузе, клиент возобновит
    });

    peer.consumers.set(consumer.id, consumer);
    this.consumers.set(consumer.id, { consumer, socketId });

    logger.info('Консьюмер создан', {
      socketId,
      consumerId: consumer.id,
      producerId,
    });

    consumer.on('transportclose', () => {
      logger.info('Консьюмер закрыт (транспорт)', { consumerId: consumer.id });
      consumer.close();
      peer.consumers.delete(consumer.id);
      this.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      logger.info('Консьюмер закрыт (продюсер)', { consumerId: consumer.id });
      consumer.close();
      peer.consumers.delete(consumer.id);
      this.consumers.delete(consumer.id);
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      appData: consumer.appData,
    };
  }

  /**
   * Возобновление консьюмера после начального создания
   * @param {string} socketId — идентификатор сокета
   * @param {string} consumerId — идентификатор консьюмера
   */
  async resumeConsumer(socketId, consumerId) {
    const peer = this.peers.get(socketId);
    if (!peer) throw new Error('Пир не найден');

    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new Error('Консьюмер не найден');

    await consumer.resume();
    logger.info('Консьюмер возобновлён', { socketId, consumerId });
  }

  /**
   * Получение списка всех активных продюсеров
   */
  getProducerIds() {
    return Array.from(this.producers.keys());
  }

  /**
   * Получение статистики продюсера
   * @param {string} producerId — идентификатор продюсера
   */
  async getProducerStats(producerId) {
    const entry = this.producers.get(producerId);
    if (!entry) return null;
    return entry.producer.getStats();
  }

  /**
   * Получение статистики консьюмера
   * @param {string} consumerId — идентификатор консьюмера
   */
  async getConsumerStats(consumerId) {
    const entry = this.consumers.get(consumerId);
    if (!entry) return null;
    return entry.consumer.getStats();
  }

  /**
   * Установка максимального битрейта для консьюмера
   * @param {string} consumerId — идентификатор консьюмера
   * @param {number} bitrate — максимальный битрейт в bps
   */
  async setConsumerMaxBitrate(consumerId, bitrate) {
    const entry = this.consumers.get(consumerId);
    if (!entry) throw new Error('Консьюмер не найден');
    await entry.consumer.setPreferredLayers({ spatialLayer: 0, temporalLayer: 0 });
    logger.info('Битрейт консьюмера ограничен', { consumerId, bitrate });
  }

  /**
   * Удаление пира и освобождение ресурсов
   * @param {string} socketId — идентификатор сокета
   */
  removePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;

    // Закрываем все транспорты пира (автоматически закроет продюсеров и консьюмеров)
    for (const [, transport] of peer.transports) {
      transport.close();
    }

    // Очищаем ссылки из глобальных карт
    for (const [producerId] of peer.producers) {
      this.producers.delete(producerId);
    }
    for (const [consumerId] of peer.consumers) {
      this.consumers.delete(consumerId);
    }

    this.peers.delete(socketId);
    logger.info('Пир удалён', { socketId });
  }

  /**
   * Получение количества подключённых пиров
   */
  getPeerCount() {
    return this.peers.size;
  }

  /**
   * Закрытие комнаты и освобождение всех ресурсов
   */
  async close() {
    // Закрываем всех пиров
    for (const [socketId] of this.peers) {
      this.removePeer(socketId);
    }

    // Закрываем роутер
    if (this.router) {
      this.router.close();
    }

    // Закрываем воркеров
    for (const worker of this.workers) {
      worker.close();
    }

    logger.info('Комната закрыта');
  }
}

module.exports = Room;
