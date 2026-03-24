/**
 * Панель управления медиа
 * Загрузка файлов и добавление внешних ссылок
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { mediaApi } from '../../lib/api';
import {
  Image,
  Upload,
  Link,
  Trash2,
  FileVideo,
  FileAudio,
  FileImage,
  ExternalLink,
  Play,
} from 'lucide-react';

export default function MediaPanel({ socket }) {
  const [files, setFiles] = useState([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** Загрузка списка файлов */
  const loadFiles = useCallback(async () => {
    try {
      const data = await mediaApi.list();
      setFiles(data);
    } catch (err) {
      console.error('Ошибка загрузки списка:', err);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  /** Загрузка файла */
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      await mediaApi.upload(file);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }, [loadFiles]);

  /** Добавление внешней ссылки */
  const handleAddExternal = useCallback(async () => {
    if (!externalUrl.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await mediaApi.addExternal(externalUrl);
      setExternalUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [externalUrl]);

  /** Удаление файла */
  const handleDelete = useCallback(async (filename) => {
    try {
      await mediaApi.delete(filename);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    }
  }, [loadFiles]);

  /** Показать медиа на стриме (overlay) */
  const handleShowOverlay = useCallback((file) => {
    if (socket?.connected) {
      socket.emit('setOverlay', {
        type: 'media',
        url: file.url,
        options: { filename: file.filename },
      });
    }
  }, [socket]);

  /** Иконка по типу файла */
  const getFileIcon = (filename) => {
    if (/\.(mp4|webm)$/i.test(filename)) return FileVideo;
    if (/\.(mp3|ogg|wav)$/i.test(filename)) return FileAudio;
    return FileImage;
  };

  /** Форматирование размера файла */
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / 1048576).toFixed(1)} МБ`;
  };

  return (
    <div className="space-y-4">
      {/* Загрузка файла */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Загрузка медиа
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Кнопка загрузки */}
          <div>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">
                {loading ? 'Загрузка...' : 'Нажмите для выбора файла'}
              </span>
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                accept="image/*,video/mp4,video/webm,audio/*"
                disabled={loading}
              />
            </label>
          </div>

          {/* Внешняя ссылка */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://... внешняя ссылка на медиа"
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleAddExternal}
              disabled={loading || !externalUrl.trim()}
              size="sm"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Список файлов */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Медиафайлы
            </CardTitle>
            <Badge variant="secondary">{files.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Нет загруженных файлов
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => {
                const Icon = getFileIcon(file.filename);
                return (
                  <div
                    key={file.filename}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleShowOverlay(file)}
                        title="Показать на стриме"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.filename)}
                        title="Удалить"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
