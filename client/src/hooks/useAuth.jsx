/**
 * Хук аутентификации
 * Управление JWT токеном и ролями
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);

/** Провайдер аутентификации */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Сохранение токена в localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
    }
  }, [token, role]);

  /** Вход стримера */
  const loginStreamer = useCallback(async (password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.loginStreamer(password);
      setToken(data.token);
      setRole(data.role);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Вход модератора */
  const loginModerator = useCallback(async (key) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.loginModerator(key);
      setToken(data.token);
      setRole(data.role);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Выход */
  const logout = useCallback(() => {
    setToken(null);
    setRole(null);
    setError(null);
  }, []);

  const value = {
    token,
    role,
    loading,
    error,
    loginStreamer,
    loginModerator,
    logout,
    isStreamer: role === 'streamer',
    isModerator: role === 'moderator',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/** Хук для доступа к контексту аутентификации */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }
  return context;
}
