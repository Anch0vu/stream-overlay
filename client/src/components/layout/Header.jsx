/**
 * Компонент шапки приложения
 */
import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Radio, LogOut, Shield, User } from 'lucide-react';

export default function Header({ connected }) {
  const { role, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Логотип и название */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg tracking-tight">TOON-док</span>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">OnionRP Streaming</span>
        </div>

        {/* Статус и управление */}
        <div className="flex items-center gap-3">
          {/* Индикатор подключения */}
          <div className="flex items-center gap-2">
            <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
            <span className="text-xs text-muted-foreground">
              {connected ? 'Подключено' : 'Отключено'}
            </span>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Роль пользователя */}
          <Badge variant={role === 'streamer' ? 'default' : 'secondary'}>
            {role === 'streamer' ? (
              <><Shield className="h-3 w-3 mr-1" /> Стример</>
            ) : (
              <><User className="h-3 w-3 mr-1" /> Модератор</>
            )}
          </Badge>

          {/* Кнопка выхода */}
          <Button variant="ghost" size="icon" onClick={logout} title="Выход">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
