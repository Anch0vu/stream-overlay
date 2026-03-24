/**
 * Компонент статистики стрима
 * Отображает fps, bitrate, latency, packet loss
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Activity, Gauge, Timer, AlertTriangle } from 'lucide-react';

export default function StreamStats({ stats }) {
  const metrics = [
    {
      label: 'FPS',
      value: stats.fps || 0,
      unit: '',
      icon: Activity,
      color: stats.fps >= 25 ? 'text-success' : 'text-warning',
    },
    {
      label: 'Битрейт',
      value: stats.bitrate ? Math.round(stats.bitrate / 1000) : 0,
      unit: 'kbps',
      icon: Gauge,
      color: 'text-primary',
    },
    {
      label: 'Задержка',
      value: stats.latency || 0,
      unit: 'мс',
      icon: Timer,
      color: stats.latency < 100 ? 'text-success' : 'text-warning',
    },
    {
      label: 'Потеря пакетов',
      value: stats.packetLoss ? stats.packetLoss.toFixed(1) : '0.0',
      unit: '%',
      icon: AlertTriangle,
      color: stats.packetLoss < 1 ? 'text-success' : 'text-destructive',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Метрики стрима
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="flex flex-col items-center p-3 rounded-lg bg-secondary/50"
              >
                <Icon className={`h-5 w-5 mb-1 ${metric.color}`} />
                <span className="text-2xl font-bold">{metric.value}</span>
                <span className="text-xs text-muted-foreground">
                  {metric.label} {metric.unit}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
