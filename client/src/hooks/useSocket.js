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

    // Именованные обработчики — чтобы можно было снять через socket.off
    const handleConnect = () => {
      setConnected(true);
      setError(null);
    };
    const handleDisconnect = () => {
      setConnected(false);
    };
    const handleConnectError = (err) => {
      setError(err.message);
      setConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Если сокет уже был подключён до монтирования — синхронизируем стейт
    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      // Снимаем конкретные обработчики — не затрагиваем чужие листенеры
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
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
