/**
 * Модуль WebRTC клиента
 * Работа с mediasoup-client для отправки/приёма потоков
 */
import * as mediasoupClient from 'mediasoup-client';

/**
 * Класс управления WebRTC соединением
 */
export class WebRTCClient {
  constructor(socket) {
    // Сокет для сигнализации
    this.socket = socket;
    // Устройство mediasoup
    this.device = null;
    // Транспорт для отправки
    this.sendTransport = null;
    // Транспорт для приёма
    this.recvTransport = null;
    // Продюсеры (наши потоки)
    this.producers = new Map();
    // Консьюмеры (входящие потоки)
    this.consumers = new Map();
  }

  /**
   * Инициализация устройства mediasoup
   */
  async init() {
    this.device = new mediasoupClient.Device();

    // Получаем RTP capabilities с сервера
    const { data: routerRtpCapabilities } = await this._request('getRouterRtpCapabilities');

    await this.device.load({ routerRtpCapabilities });
    console.log('[WebRTC] Устройство инициализировано');
  }

  /**
   * Создание транспорта для отправки медиа (стример)
   */
  async createSendTransport() {
    const { data: transportData } = await this._request('createTransport', {
      direction: 'send',
    });

    this.sendTransport = this.device.createSendTransport(transportData);

    // Обработка подключения транспорта
    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this._request('connectTransport', {
          transportId: this.sendTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (err) {
        errback(err);
      }
    });

    // Обработка создания продюсера
    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { data } = await this._request('produce', {
          transportId: this.sendTransport.id,
          kind,
          rtpParameters,
          appData,
        });
        callback({ id: data.producerId });
      } catch (err) {
        errback(err);
      }
    });

    console.log('[WebRTC] Транспорт отправки создан');
    return this.sendTransport;
  }

  /**
   * Создание транспорта для приёма медиа (модератор)
   */
  async createRecvTransport() {
    const { data: transportData } = await this._request('createTransport', {
      direction: 'recv',
    });

    this.recvTransport = this.device.createRecvTransport(transportData);

    // Обработка подключения транспорта
    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this._request('connectTransport', {
          transportId: this.recvTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (err) {
        errback(err);
      }
    });

    console.log('[WebRTC] Транспорт приёма создан');
    return this.recvTransport;
  }

  /**
   * Публикация медиапотока (стример)
   * @param {MediaStream} stream — медиапоток с камеры/экрана
   */
  async publishStream(stream) {
    if (!this.sendTransport) {
      await this.createSendTransport();
    }

    // Публикуем каждый трек отдельно
    for (const track of stream.getTracks()) {
      const producer = await this.sendTransport.produce({ track });
      this.producers.set(producer.id, producer);
      console.log(`[WebRTC] Продюсер создан: ${track.kind}`, producer.id);
    }
  }

  /**
   * Подписка на медиапоток продюсера (модератор)
   * @param {string} producerId — ID продюсера
   * @returns {MediaStreamTrack} — полученный трек
   */
  async consume(producerId) {
    if (!this.recvTransport) {
      await this.createRecvTransport();
    }

    const { data: consumerData } = await this._request('consume', {
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume(consumerData);
    this.consumers.set(consumer.id, consumer);

    // Возобновляем консьюмера
    await this._request('resumeConsumer', { consumerId: consumer.id });

    console.log(`[WebRTC] Консьюмер создан: ${consumer.kind}`, consumer.id);
    return consumer.track;
  }

  /**
   * Запрос к серверу через сокет с таймаутом
   * @param {string} event — имя события
   * @param {object} data — данные запроса
   * @param {number} timeoutMs — таймаут в мс (по умолчанию 15000)
   * @returns {Promise<object>} — ответ сервера
   */
  _request(event, data = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`WebRTC запрос '${event}' не получил ответа за ${timeoutMs}ms`));
      }, timeoutMs);

      this.socket.emit(event, data, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (!response) {
          return reject(new Error(`Нет ответа для события '${event}'`));
        }
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Неизвестная ошибка'));
        }
      });
    });
  }

  /**
   * Закрытие всех соединений
   */
  close() {
    for (const [, producer] of this.producers) {
      producer.close();
    }
    for (const [, consumer] of this.consumers) {
      consumer.close();
    }

    // Снимаем листенеры до close() — иначе объекты транспортов
    // остаются в памяти через замыкания до GC.
    if (this.sendTransport) {
      this.sendTransport.removeAllListeners();
      this.sendTransport.close();
      this.sendTransport = null;
    }
    if (this.recvTransport) {
      this.recvTransport.removeAllListeners();
      this.recvTransport.close();
      this.recvTransport = null;
    }

    this.producers.clear();
    this.consumers.clear();
    this.device = null;

    console.log('[WebRTC] Все соединения закрыты');
  }
}
