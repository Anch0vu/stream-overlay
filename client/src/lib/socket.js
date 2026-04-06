/**
 * Модуль WebSocket клиента
 * Подключение к серверу через Socket.IO
 */
import { io } from 'socket.io-client';

let socket = null;
let activeToken = null;

/**
 * Инициализация WebSocket подключения
 * @param {string} token — JWT токен авторизации
 * @returns {object} — экземпляр сокета
 */
export function initSocket(token) {
  // Если токен изменился (смена пользователя) — сначала отключаемся
  if (socket && activeToken !== token) {
    socket.disconnect();
    socket = null;
    activeToken = null;
  }

  if (socket && socket.connected) {
    return socket;
  }

  activeToken = token;
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
    activeToken = null;
  }
}
