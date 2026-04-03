/**
 * Менеджер оверлеев
 * Управление отображением медиа поверх стрима
 * Показывает синхронизированный превью того, что видит OBS source
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { Layers, X, Volume2, VolumeX, Music, MonitorPlay } from 'lucide-react';

function getMediaKind(url = '') {
  if (/\.(mp3|ogg|wav|aac|flac)(\?|$)/i.test(url)) return 'audio';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  return 'image';
}

export default function OverlayManager({ socket }) {
  const [activeOverlay, setActiveOverlay] = useState(null);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [audioLoop, setAudioLoop] = useState(false);
  const previewAudioRef = useRef(null);

  // Слушаем события оверлея
  useEffect(() => {
    if (!socket) return;

    const handleOverlayChanged = (data) => {
      setActiveOverlay(data);
      setOverlayOpacity(Math.round((data.options?.opacity ?? 1) * 100));
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

  /** Изменение прозрачности — отправляем обновлённый overlay с новой opacity */
  const handleOpacityChange = useCallback(
    (value) => {
      setOverlayOpacity(value);
      if (socket?.connected && activeOverlay) {
        socket.emit('setOverlay', {
          ...activeOverlay,
          options: { ...activeOverlay.options, opacity: value / 100 },
        });
      }
    },
    [socket, activeOverlay]
  );

  /** Переключение loop для аудио */
  const handleLoopChange = useCallback(
    (checked) => {
      setAudioLoop(checked);
      if (socket?.connected && activeOverlay) {
        socket.emit('setOverlay', {
          ...activeOverlay,
          options: { ...activeOverlay.options, loop: checked },
        });
      }
    },
    [socket, activeOverlay]
  );

  const mediaKind = activeOverlay ? getMediaKind(activeOverlay.url) : null;
  const isAudio = mediaKind === 'audio';
  const isVideo = mediaKind === 'video';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Оверлей
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeOverlay && (
              <Badge variant="success" className="text-xs">LIVE</Badge>
            )}
            {activeOverlay && (
              <Button variant="ghost" size="icon" onClick={handleRemoveOverlay} title="Убрать оверлей">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeOverlay ? (
          <div className="space-y-4">
            {/* Превью — синхронизирован с тем, что видит OBS source */}
            <div className="rounded-lg border border-border overflow-hidden bg-[#111] aspect-video flex items-center justify-center relative">
              <div className="absolute top-2 left-2 z-10">
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <MonitorPlay className="h-3 w-3" />
                  Превью OBS
                </Badge>
              </div>

              {isAudio ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Music className="h-10 w-10 opacity-50" />
                  <p className="text-xs">Аудио: {activeOverlay.url.split('/').pop()}</p>
                  <audio
                    ref={previewAudioRef}
                    src={activeOverlay.url}
                    controls
                    loop={audioLoop}
                    className="w-full max-w-xs mt-1"
                  />
                </div>
              ) : isVideo ? (
                <video
                  src={activeOverlay.url}
                  className="max-w-full max-h-full"
                  style={{ opacity: overlayOpacity / 100 }}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={activeOverlay.url}
                  alt="Overlay preview"
                  className="max-w-full max-h-full object-contain"
                  style={{ opacity: overlayOpacity / 100 }}
                />
              )}
            </div>

            {/* Управление прозрачностью (не для аудио) */}
            {!isAudio && (
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
            )}

            {/* Loop для аудио */}
            {isAudio && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Повтор</span>
                </div>
                <Switch
                  checked={audioLoop}
                  onCheckedChange={handleLoopChange}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Нет активного оверлея</p>
            <p className="text-xs text-muted-foreground mt-1">
              Выберите медиафайл и нажмите «Показать»
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
