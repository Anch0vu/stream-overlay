/**
 * Компонент управления громкостью
 * Слайдеры для аудиодорожек + мастер-громкость
 */
import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Volume2, VolumeX, Volume1, Mic, MicOff } from 'lucide-react';

export default function VolumeControl({ socket }) {
  const [masterVolume, setMasterVolume] = useState(80);
  const [micVolume, setMicVolume] = useState(100);
  const [mediaVolume, setMediaVolume] = useState(70);
  const [masterMuted, setMasterMuted] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  /** Изменение громкости с отправкой через WebSocket */
  const handleVolumeChange = useCallback(
    (type, value) => {
      switch (type) {
        case 'master':
          setMasterVolume(value);
          break;
        case 'mic':
          setMicVolume(value);
          break;
        case 'media':
          setMediaVolume(value);
          break;
      }

      // Отправляем изменение через WebSocket
      if (socket?.connected) {
        socket.emit('setVolume', { type, volume: value });
      }
    },
    [socket]
  );

  /** Иконка громкости в зависимости от уровня */
  const VolumeIcon = masterMuted
    ? VolumeX
    : masterVolume > 50
    ? Volume2
    : Volume1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          Управление громкостью
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Мастер-громкость */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VolumeIcon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Мастер</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-8 text-right">
                {masterMuted ? '—' : `${masterVolume}%`}
              </span>
              <Switch
                checked={!masterMuted}
                onCheckedChange={(v) => setMasterMuted(!v)}
              />
            </div>
          </div>
          <Slider
            value={masterMuted ? 0 : masterVolume}
            onChange={(v) => handleVolumeChange('master', v)}
            disabled={masterMuted}
          />
        </div>

        {/* Микрофон */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {micMuted ? (
                <MicOff className="h-4 w-4 text-destructive" />
              ) : (
                <Mic className="h-4 w-4 text-success" />
              )}
              <span className="text-sm font-medium">Микрофон</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-8 text-right">
                {micMuted ? '—' : `${micVolume}%`}
              </span>
              <Switch
                checked={!micMuted}
                onCheckedChange={(v) => setMicMuted(!v)}
              />
            </div>
          </div>
          <Slider
            value={micMuted ? 0 : micVolume}
            onChange={(v) => handleVolumeChange('mic', v)}
            disabled={micMuted}
          />
        </div>

        {/* Медиа */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume1 className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Медиа</span>
            </div>
            <span className="text-sm text-muted-foreground">{mediaVolume}%</span>
          </div>
          <Slider
            value={mediaVolume}
            onChange={(v) => handleVolumeChange('media', v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
