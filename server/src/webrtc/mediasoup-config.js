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
      'x-google-start-bitrate': 2000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 2000,
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
      'x-google-start-bitrate': 2000,
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
  // 2 Mbps initial — sufficient for 1080p overlay content
  initialAvailableOutgoingBitrate: 2000000,
  minimumAvailableOutgoingBitrate: 600000,
  maxSctpMessageSize: 262144,
  maxIncomingBitrate: 8000000,
  // TCP fallback enabled: helps users behind strict NAT/firewalls
  enableTcp: true,
  enableUdp: true,
  preferUdp: true,
};

module.exports = {
  workerSettings,
  routerMediaCodecs,
  webRtcTransportOptions,
};
