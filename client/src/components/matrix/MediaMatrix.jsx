/**
 * Виртуальная медиаматрица
 * Полный контроль стрима: пиры, статистика, управление
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import {
  LayoutGrid,
  RefreshCw,
  UserX,
  Gauge,
  Users,
  Radio,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';

export default function MediaMatrix({ socket }) {
  const [peers, setPeers] = useState([]);
  const [serverStats, setServerStats] = useState({});
  const [loading, setLoading] = useState(false);

  /** Обновление статистики */
  const refreshStats = useCallback(() => {
    if (!socket?.connected) return;

    setLoading(true);
    socket.emit('getStats', (response) => {
      if (response.success) {
        setServerStats(response.data);
      }
      setLoading(false);
    });
  }, [socket]);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  // Слушаем события подключения/отключения пиров
  useEffect(() => {
    if (!socket) return;

    const handlePeerDisconnected = ({ socketId }) => {
      setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
    };

    socket.on('peerDisconnected', handlePeerDisconnected);
    return () => socket.off('peerDisconnected', handlePeerDisconnected);
  }, [socket]);

  /** Отключение пира (только стример) */
  const handleKickPeer = useCallback(
    (socketId) => {
      if (socket?.connected) {
        socket.emit('kickPeer', { targetSocketId: socketId });
        setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
      }
    },
    [socket]
  );

  /** Перезапуск пира */
  const handleRestartPeer = useCallback(
    (socketId) => {
      if (socket?.connected) {
        socket.emit('restartPeer', { targetSocketId: socketId }, (response) => {
          if (response.success) {
            console.log('Пир перезапущен');
          }
        });
      }
    },
    [socket]
  );

  return (
    <div className="space-y-4">
      {/* Общая статистика сервера */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Медиаматрица
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStats}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/50">
              <Users className="h-5 w-5 text-primary mb-1" />
              <span className="text-xl font-bold">{serverStats.peers || 0}</span>
              <span className="text-xs text-muted-foreground">Подключений</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/50">
              <Radio className="h-5 w-5 text-success mb-1" />
              <span className="text-xl font-bold">{serverStats.producers || 0}</span>
              <span className="text-xs text-muted-foreground">Потоков</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/50">
              <Activity className="h-5 w-5 text-warning mb-1" />
              <Badge variant={socket?.connected ? 'success' : 'destructive'} className="mt-1">
                {socket?.connected ? (
                  <><Wifi className="h-3 w-3 mr-1" /> Онлайн</>
                ) : (
                  <><WifiOff className="h-3 w-3 mr-1" /> Офлайн</>
                )}
              </Badge>
              <span className="text-xs text-muted-foreground mt-1">Статус</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Список подключённых пиров */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Подключённые пиры
          </CardTitle>
        </CardHeader>
        <CardContent>
          {peers.length === 0 ? (
            <div className="text-center py-6">
              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Нет подключённых модераторов
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {peers.map((peer) => (
                <div
                  key={peer.socketId}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="status-dot online" />
                    <div>
                      <p className="text-sm font-medium">{peer.role || 'Модератор'}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {peer.socketId.substring(0, 12)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRestartPeer(peer.socketId)}
                      title="Перезапустить пира"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleKickPeer(peer.socketId)}
                      title="Отключить пира"
                    >
                      <UserX className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
