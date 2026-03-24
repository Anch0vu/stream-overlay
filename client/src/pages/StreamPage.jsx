/**
 * Страница стрима — источник WebRTC потока
 * Стример открывает эту страницу для публикации потока
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import Header from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  MonitorPlay,
  Camera,
  Monitor,
  StopCircle,
  Radio,
} from 'lucide-react';

export default function StreamPage() {
  const { token } = useAuth();
  const { socket, connected } = useSocket(token);
  const { initialized, publishing, publishStream } = useWebRTC(socket, connected);
  const [localStream, setLocalStream] = useState(null);
  const videoRef = useRef(null);

  // Привязываем локальный поток к видеоэлементу
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  /** Захват камеры */
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      setLocalStream(stream);

      if (initialized) {
        await publishStream(stream);
      }
    } catch (err) {
      console.error('Ошибка захвата камеры:', err);
    }
  }, [initialized, publishStream]);

  /** Захват экрана */
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      setLocalStream(stream);

      if (initialized) {
        await publishStream(stream);
      }
    } catch (err) {
      console.error('Ошибка захвата экрана:', err);
    }
  }, [initialized, publishStream]);

  /** Остановка потока */
  const stopStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
  }, [localStream]);

  return (
    <div className="flex flex-col h-screen">
      <Header connected={connected} />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Управление публикацией */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Radio className="h-4 w-4" />
                  Публикация потока
                </CardTitle>
                <Badge variant={publishing ? 'success' : 'secondary'}>
                  {publishing ? 'LIVE' : 'Офлайн'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Button
                  onClick={startCamera}
                  disabled={!initialized || publishing}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Камера
                </Button>
                <Button
                  variant="secondary"
                  onClick={startScreenShare}
                  disabled={!initialized || publishing}
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  Экран
                </Button>
                {localStream && (
                  <Button variant="destructive" onClick={stopStream}>
                    <StopCircle className="h-4 w-4 mr-2" />
                    Остановить
                  </Button>
                )}
              </div>
              {!initialized && (
                <p className="text-sm text-muted-foreground mt-2">
                  Ожидание инициализации WebRTC...
                </p>
              )}
            </CardContent>
          </Card>

          {/* Превью потока */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MonitorPlay className="h-4 w-4" />
                Локальный превью
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="video-preview">
                {localStream ? (
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
                      <Camera className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Выберите источник для публикации</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
