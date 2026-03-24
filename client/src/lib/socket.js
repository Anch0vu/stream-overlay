/**
 * Модуль WebSocket клиента
 * Подключение к серверу через Socket.IO
 */
import { io } from 'socket.io-client';

let socket = null;

/**
 * Инициализация WebSocket подключения
 * @param {string} token — JWT токен авторизации
 * @returns {object} — экземпляр сокета
 */
export function initSocket(token) {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io({
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[WS] Подключено к серверу');
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] Ошибка подключения:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[WS] Отключено:', reason);
  });

  return socket;
}

/**
 * Получение текущего экземпляра сокета
 */
export function getSocket() {
  return socket;
}

/**
 * Отключение от сервера
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
