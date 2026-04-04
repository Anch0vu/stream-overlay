/**
 * Компонент статуса подключения
 * Показывает WebSocket, WebRTC и ICE состояние в реальном времени
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Wifi, WifiOff, Radio, Server, Shield } from 'lucide-react';

const statusColors = {
  connected: 'bg-success text-success-foreground',
  connecting: 'bg-warning text-warning-foreground',
  disconnected: 'bg-destructive text-destructive-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

function StatusItem({ icon: Icon, label, status, detail }) {
  const color = statusColors[status] || statusColors.unknown;
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        <Badge className={color}>
          {status === 'connected' ? 'OK' : status === 'connecting' ? '...' : 'OFF'}
        </Badge>
      </div>
    </div>
  );
}

export default function ConnectionStatus({ connected, initialized, publishing, role }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {connected ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-destructive" />}
          Статус подключения
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <StatusItem
          icon={Server}
          label="WebSocket"
          status={connected ? 'connected' : 'disconnected'}
          detail={connected ? 'socket.io' : null}
        />
        <StatusItem
          icon={Radio}
          label="WebRTC"
          status={initialized ? 'connected' : connected ? 'connecting' : 'disconnected'}
          detail={initialized ? 'mediasoup' : null}
        />
        <StatusItem
          icon={Shield}
          label="Роль"
          status="connected"
          detail={role === 'streamer' ? 'Стример' : 'Модератор'}
        />
        {publishing && (
          <div className="mt-2 p-2 rounded-lg bg-success/10 border border-success/20 text-center">
            <span className="text-xs font-medium text-success">
              LIVE — Поток активен
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
