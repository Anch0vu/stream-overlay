/**
 * Конфигурация mediasoup
 * Настройки воркеров, роутера и транспортов
 */

const config = require('../config');

// Настройки воркера mediasoup
const workerSettings = {
  logLevel: config.mediasoup.logLevel,
  logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  rtcMinPort: config.mediasoup.minPort,
  rtcMaxPort: config.mediasoup.maxPort,
};

// Поддерживаемые медиакодеки роутера
const routerMediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

// Настройки WebRTC транспорта
const webRtcTransportOptions = {
  listenIps: [
    {
      ip: config.mediasoup.listenIp,
      announcedIp: config.mediasoup.announcedIp,
    },
  ],
  initialAvailableOutgoingBitrate: 1000000,
  minimumAvailableOutgoingBitrate: 600000,
  maxSctpMessageSize: 262144,
  maxIncomingBitrate: 5000000,
  // Отключаем TCP fallback для минимальной задержки
  enableTcp: false,
  enableUdp: true,
  preferUdp: true,
};

module.exports = {
  workerSettings,
  routerMediaCodecs,
  webRtcTransportOptions,
};
