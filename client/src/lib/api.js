/**
 * Модуль API-клиента
 * Обёртка над fetch для взаимодействия с сервером
 */

const API_BASE = '/api';

/**
 * Выполнение запроса к API
 * @param {string} endpoint — путь API
 * @param {object} options — параметры fetch
 * @returns {Promise<object>} — JSON ответ
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Ошибка HTTP: ${response.status}`);
  }

  return response.json();
}

/** API авторизации */
export const authApi = {
  // Вход стримера
  loginStreamer: (password) =>
    request('/auth/streamer', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // Вход модератора
  loginModerator: (key) =>
    request('/auth/moderator', {
      method: 'POST',
      body: JSON.stringify({ key }),
    }),

  // Генерация ключа
  generateKey: () =>
    request('/auth/keys/generate', { method: 'POST' }),

  // Список активных ключей
  getKeys: () =>
    request('/auth/keys'),

  // Отзыв ключа
  revokeKey: (key) =>
    request(`/auth/keys/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  // Информация о текущем пользователе
  getMe: () =>
    request('/auth/me'),
};

/** API медиаконтента */
export const mediaApi = {
  // Загрузка файла
  upload: async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Ошибка загрузки файла');
    }

    return response.json();
  },

  // Добавление внешней ссылки
  addExternal: (url) =>
    request('/media/external', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  // Список файлов
  list: () =>
    request('/media/list'),

  // Удаление файла
  delete: (filename) =>
    request(`/media/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
};

/** API WebRTC */
export const webrtcApi = {
  // Получение ICE серверов
  getIceServers: () =>
    request('/webrtc/ice-servers'),

  // Статистика
  getStats: () =>
    request('/webrtc/stats'),

  // Статистика комнаты
  getRoomStats: () =>
    request('/webrtc/room-stats'),
};
