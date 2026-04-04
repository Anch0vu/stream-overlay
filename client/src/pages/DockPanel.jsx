/**
 * Главная страница — Dock Panel
 * Панель управления стримом
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import StreamPreview from '../components/stream/StreamPreview';
import StreamStats from '../components/stream/StreamStats';
import ConnectionStatus from '../components/stream/ConnectionStatus';
import PerformanceDashboard from '../components/stream/PerformanceDashboard';
import VolumeControl from '../components/stream/VolumeControl';
import MediaPanel from '../components/media/MediaPanel';
import OverlayManager from '../components/media/OverlayManager';
import KeyGenerator from '../components/auth/KeyGenerator';
import MediaMatrix from '../components/matrix/MediaMatrix';
import { ToastProvider } from '../components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Settings, Globe, Server, Copy, Check } from 'lucide-react';

export default function DockPanel() {
  const { token, role, isStreamer } = useAuth();
  const { socket, connected } = useSocket(token);
  const { initialized, publishing, remoteStreams, stats, consumeAll } = useWebRTC(
    socket,
    connected
  );
  const [activeTab, setActiveTab] = useState('stream');
  const [urlCopied, setUrlCopied] = useState(false);

  const obsUrl = `${window.location.protocol}//${window.location.host}/obs`;

  const copyObsUrl = () => {
    navigator.clipboard.writeText(obsUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  // При подключении модератора — подписываемся на потоки
  useEffect(() => {
    if (connected && initialized && !isStreamer) {
      consumeAll();
    }
  }, [connected, initialized, isStreamer, consumeAll]);

  /** Контент активной вкладки */
  const renderContent = () => {
    switch (activeTab) {
      case 'stream':
        return (
          <div className="space-y-4">
            <StreamPreview
              stream={remoteStreams[0] || null}
              publishing={publishing}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StreamStats stats={stats} />
              <ConnectionStatus
                connected={connected}
                initialized={initialized}
                publishing={publishing}
                role={role}
              />
            </div>
          </div>
        );

      case 'volume':
        return <VolumeControl socket={socket} />;

      case 'media':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MediaPanel socket={socket} />
            <OverlayManager socket={socket} />
          </div>
        );

      case 'keys':
        return isStreamer ? <KeyGenerator /> : null;

      case 'matrix':
        return isStreamer ? <MediaMatrix socket={socket} /> : null;

      case 'monitoring':
        return (
          <div className="space-y-4">
            <PerformanceDashboard socket={socket} connected={connected} />
            <ConnectionStatus
              connected={connected}
              initialized={initialized}
              publishing={publishing}
              role={role}
            />
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-4">
            {/* OBS Browser Source URL */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  OBS Browser Source
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Вставьте этот URL как Browser Source в OBS. Включите «Прозрачный фон» в настройках источника.
                </p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 font-mono text-sm break-all">
                  <span className="flex-1">{obsUrl}</span>
                  <Button variant="ghost" size="icon" onClick={copyObsUrl} title="Копировать">
                    {urlCopied
                      ? <Check className="h-4 w-4 text-green-500" />
                      : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Рекомендуемые размеры: 1920×1080. Размер совпадает с разрешением сцены OBS.
                </p>
              </CardContent>
            </Card>

            {/* Статус подключения */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Статус
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">WebRTC</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Статус: {initialized ? 'Инициализировано' : 'Ожидание'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Роль: {role}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Сервер</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      WebSocket: {connected ? 'Подключено' : 'Отключено'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Публикация: {publishing ? 'Активна' : 'Нет'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen">
        <Header connected={connected} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isStreamer={isStreamer}
          />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="max-w-6xl mx-auto animate-fade-in">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
