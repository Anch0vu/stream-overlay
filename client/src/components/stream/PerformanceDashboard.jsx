/**
 * Компонент панели производительности
 * Показывает метрики сервера и WebRTC соединения
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Activity, Cpu, HardDrive, Clock, Users, Radio, TrendingUp } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function MetricCard({ icon: Icon, label, value, subtext, color = 'text-primary' }) {
  return (
    <div className="flex flex-col items-center p-4 rounded-lg bg-secondary/30 border border-border/50 transition-colors hover:bg-secondary/50">
      <Icon className={`h-5 w-5 mb-2 ${color}`} />
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
      {subtext && <span className="text-[10px] text-muted-foreground/70">{subtext}</span>}
    </div>
  );
}

export default function PerformanceDashboard({ socket, connected }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [roomStats, setRoomStats] = useState(null);

  const fetchServerInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/system-info', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (res.ok) setServerInfo(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchRoomStats = useCallback(() => {
    if (socket && connected) {
      socket.emit('getStats', {}, (response) => {
        if (response.success) setRoomStats(response.data);
      });
    }
  }, [socket, connected]);

  useEffect(() => {
    fetchServerInfo();
    fetchRoomStats();
    const interval = setInterval(() => {
      fetchServerInfo();
      fetchRoomStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchServerInfo, fetchRoomStats]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Производительность
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">
            обновление каждые 5с
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={Clock}
            label="Аптайм"
            value={formatUptime(serverInfo?.uptime)}
            color="text-success"
          />
          <MetricCard
            icon={HardDrive}
            label="Память (heap)"
            value={formatBytes(serverInfo?.memory?.heapUsed)}
            subtext={`/ ${formatBytes(serverInfo?.memory?.heapTotal)}`}
            color="text-warning"
          />
          <MetricCard
            icon={Users}
            label="Пиры"
            value={roomStats?.peers ?? '—'}
            color="text-primary"
          />
          <MetricCard
            icon={Radio}
            label="Продюсеры"
            value={roomStats?.producers ?? '—'}
            color="text-primary"
          />
        </div>

        {serverInfo && (
          <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground/60">
            <span>Node {serverInfo.nodeVersion}</span>
            <span>PID {serverInfo.pid}</span>
            <span>RSS {formatBytes(serverInfo.memory?.rss)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
