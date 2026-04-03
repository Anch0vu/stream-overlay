/**
 * Панель управления медиа
 * Загрузка файлов и добавление внешних ссылок
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { mediaApi } from '../../lib/api';
import {
  Upload,
  Link,
  Trash2,
  FileVideo,
  FileAudio,
  FileImage,
  ExternalLink,
  Play,
  Image,
} from 'lucide-react';

function getFileIcon(filename = '') {
  if (/\.(mp4|webm|mov)$/i.test(filename)) return FileVideo;
  if (/\.(mp3|ogg|wav|aac|flac)$/i.test(filename)) return FileAudio;
  return FileImage;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1048576).toFixed(1)} МБ`;
}

export default function MediaPanel({ socket }) {
  const [files, setFiles] = useState([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef(null);

  const loadFiles = useCallback(async () => {
    try {
      const data = await mediaApi.list();
      setFiles(data);
    } catch (err) {
      console.error('Ошибка загрузки списка:', err);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const uploadFile = useCallback(async (file) => {
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
    }
  }, [loadFiles]);

  const handleUpload = useCallback((e) => {
    uploadFile(e.target.files?.[0]);
    e.target.value = '';
  }, [uploadFile]);

  // Drag-and-drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    uploadFile(e.dataTransfer.files?.[0]);
  }, [uploadFile]);

  const handleAddExternal = useCallback(async () => {
    if (!externalUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await mediaApi.addExternal(externalUrl);
      setExternalUrl('');
      // If it's a direct URL show it on overlay immediately
      if (socket?.connected) {
        socket.emit('setOverlay', { type: 'media', url: externalUrl, options: {} });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [externalUrl, socket]);

  const handleDelete = useCallback(async (filename) => {
    try {
      await mediaApi.delete(filename);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    }
  }, [loadFiles]);

  const handleShowOverlay = useCallback((file) => {
    if (socket?.connected) {
      socket.emit('setOverlay', {
        type: 'media',
        url: file.url,
        options: { filename: file.filename },
      });
    }
  }, [socket]);

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
          {/* Drag-and-drop зона */}
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50'}`}
          >
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors">
              <Upload className={`h-6 w-6 mb-1 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm text-muted-foreground">
                {loading
                  ? 'Загрузка...'
                  : dragging
                  ? 'Отпустите файл'
                  : 'Нажмите или перетащите файл'}
              </span>
              <span className="text-xs text-muted-foreground/60 mt-0.5">
                Изображения, GIF, WebM, MP4, MP3, WAV, OGG
              </span>
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                accept="image/*,video/mp4,video/webm,audio/*,.gif"
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
                onKeyDown={(e) => e.key === 'Enter' && handleAddExternal()}
                placeholder="https://... прямая ссылка на медиа"
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleAddExternal}
              disabled={loading || !externalUrl.trim()}
              size="sm"
              title="Показать на OBS"
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
              Медиатека
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
            <div className="space-y-1.5">
              {files.map((file) => {
                const Icon = getFileIcon(file.filename);
                return (
                  <div
                    key={file.filename}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleShowOverlay(file)}
                        title="Показать на OBS"
                      >
                        <Play className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.filename)}
                        title="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
