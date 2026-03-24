/**
 * Главный компонент приложения
 * Маршрутизация: логин / док-панель / стрим
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DockPanel from './pages/DockPanel';
import StreamPage from './pages/StreamPage';

/** Защищённый маршрут — редирект на логин без токена */
function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dock"
            element={
              <ProtectedRoute>
                <DockPanel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stream"
            element={
              <ProtectedRoute>
                <StreamPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
