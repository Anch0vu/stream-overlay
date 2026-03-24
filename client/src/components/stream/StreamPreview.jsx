/**
 * Компонент превью стрима
 * Отображает WebRTC поток с видеоплеером
 */
import React, { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MonitorPlay, Maximize2 } from 'lucide-react';
import { Button } from '../ui/button';

export default function StreamPreview({ stream, publishing }) {
  const videoRef = useRef(null);

  // Привязываем поток к видеоэлементу
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorPlay className="h-4 w-4" />
            Превью стрима
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={publishing ? 'success' : 'secondary'}>
              {publishing ? 'LIVE' : 'Офлайн'}
            </Badge>
            <Button variant="ghost" size="icon" title="Полноэкранный">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="video-preview">
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <MonitorPlay className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Ожидание потока...</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
