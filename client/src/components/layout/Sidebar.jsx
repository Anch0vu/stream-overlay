/**
 * Компонент боковой панели навигации
 */
import React from 'react';
import { cn } from '../../lib/utils';
import {
  MonitorPlay,
  Volume2,
  Image,
  Key,
  LayoutGrid,
  Settings,
} from 'lucide-react';

const menuItems = [
  { id: 'stream', label: 'Стрим', icon: MonitorPlay },
  { id: 'volume', label: 'Громкость', icon: Volume2 },
  { id: 'media', label: 'Медиа', icon: Image },
  { id: 'keys', label: 'Ключи', icon: Key },
  { id: 'matrix', label: 'Матрица', icon: LayoutGrid },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange, isStreamer }) {
  // Фильтруем пункты меню для модератора (нет доступа к ключам и матрице)
  const visibleItems = isStreamer
    ? menuItems
    : menuItems.filter((item) => !['keys', 'matrix', 'settings'].includes(item.id));

  return (
    <aside className="w-16 lg:w-56 border-r border-border bg-background flex-shrink-0">
      <nav className="flex flex-col gap-1 p-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary glow-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
