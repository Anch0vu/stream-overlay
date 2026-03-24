/**
 * Менеджер оверлеев
 * Управление отображением медиа поверх стрима
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Layers, X, Move, RotateCcw } from 'lucide-react';

export default function OverlayManager({ socket }) {
  const [activeOverlay, setActiveOverlay] = useState(null);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlayVisible, setOverlayVisible] = useState(true);

  // Слушаем события оверлея
  useEffect(() => {
    if (!socket) return;

    const handleOverlayChanged = (data) => {
      setActiveOverlay(data);
      setOverlayVisible(true);
    };

    const handleOverlayRemoved = () => {
      setActiveOverlay(null);
    };

    socket.on('overlayChanged', handleOverlayChanged);
    socket.on('overlayRemoved', handleOverlayRemoved);

    return () => {
      socket.off('overlayChanged', handleOverlayChanged);
      socket.off('overlayRemoved', handleOverlayRemoved);
    };
  }, [socket]);

  /** Удаление оверлея */
  const handleRemoveOverlay = useCallback(() => {
    if (socket?.connected) {
      socket.emit('removeOverlay');
    }
    setActiveOverlay(null);
  }, [socket]);

  /** Изменение прозрачности */
  const handleOpacityChange = useCallback(
    (value) => {
      setOverlayOpacity(value);
      if (socket?.connected) {
        socket.emit('setOverlay', {
          ...activeOverlay,
          options: { ...activeOverlay?.options, opacity: value / 100 },
        });
      }
    },
    [socket, activeOverlay]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Оверлей
          </CardTitle>
          {activeOverlay && (
            <Button variant="ghost" size="icon" onClick={handleRemoveOverlay} title="Убрать">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activeOverlay ? (
          <div className="space-y-4">
            {/* Превью оверлея */}
            <div className="rounded-lg border border-border overflow-hidden bg-black/50 aspect-video flex items-center justify-center">
              {activeOverlay.url && (
                /\.(mp4|webm)$/i.test(activeOverlay.url) ? (
                  <video
                    src={activeOverlay.url}
                    className="max-w-full max-h-full"
                    style={{ opacity: overlayOpacity / 100 }}
                    autoPlay
                    loop
                    muted
                  />
                ) : (
                  <img
                    src={activeOverlay.url}
                    alt="Overlay"
                    className="max-w-full max-h-full object-contain"
                    style={{ opacity: overlayOpacity / 100 }}
                  />
                )
              )}
            </div>

            {/* Управление прозрачностью */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Прозрачность</span>
                <span className="text-sm text-muted-foreground">{overlayOpacity}%</span>
              </div>
              <Slider
                value={overlayOpacity}
                onChange={handleOpacityChange}
              />
            </div>

            {/* Переключатель видимости */}
            <div className="flex items-center justify-between">
              <span className="text-sm">Отображение</span>
              <Switch
                checked={overlayVisible}
                onCheckedChange={setOverlayVisible}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Нет активного оверлея
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Выберите медиа для отображения на стриме
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
