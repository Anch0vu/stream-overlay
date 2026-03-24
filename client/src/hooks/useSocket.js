/**
 * Хук WebSocket подключения
 * Управление сокет-подключением и событиями
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { initSocket, disconnectSocket, getSocket } from '../lib/socket';

/**
 * Хук для работы с WebSocket
 * @param {string} token — JWT токен
 */
export function useSocket(token) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const socket = initSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      setError(err.message);
      setConnected(false);
    });

    return () => {
      disconnectSocket();
      setConnected(false);
    };
  }, [token]);

  /** Подписка на событие */
  const on = useCallback((event, handler) => {
    const socket = socketRef.current;
    if (socket) {
      socket.on(event, handler);
      return () => socket.off(event, handler);
    }
    return () => {};
  }, []);

  /** Отправка события */
  const emit = useCallback((event, data, callback) => {
    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit(event, data, callback);
    }
  }, []);

  return {
    socket: socketRef.current,
    connected,
    error,
    on,
    emit,
  };
}
