/**
 * Страница входа
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoginForm from '../components/auth/LoginForm';

export default function LoginPage() {
  const { token } = useAuth();

  // Если уже авторизован — отправляем на док-панель
  if (token) {
    return <Navigate to="/dock" replace />;
  }

  return <LoginForm />;
}
