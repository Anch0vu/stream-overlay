import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Конфигурация Vite для док-панели
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // Проксирование API запросов к серверу
      '/api': {
        target: 'http://webrtc-node:3001',
        changeOrigin: true,
      },
      // Проксирование WebSocket (основной + /overlay namespace)
      '/socket.io': {
        target: 'http://webrtc-node:3001',
        ws: true,
      },
      // Проксирование медиафайлов
      '/media': {
        target: 'http://webrtc-node:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
