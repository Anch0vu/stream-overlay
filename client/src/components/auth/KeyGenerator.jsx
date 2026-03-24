/**
 * Генератор ключей модераторов
 * Создание, просмотр и отзыв одноразовых ключей
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { authApi } from '../../lib/api';
import { Key, Plus, Copy, Trash2, Clock, CheckCircle } from 'lucide-react';

export default function KeyGenerator() {
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Загрузка активных ключей */
  const loadKeys = useCallback(async () => {
    try {
      const data = await authApi.getKeys();
      setKeys(data);
    } catch (err) {
      console.error('Ошибка загрузки ключей:', err);
    }
  }, []);

  useEffect(() => {
    loadKeys();
    // Обновляем каждые 30 секунд
    const interval = setInterval(loadKeys, 30000);
    return () => clearInterval(interval);
  }, [loadKeys]);

  /** Генерация нового ключа */
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authApi.generateKey();
      setNewKey(data);
      setShowDialog(true);
      await loadKeys();
    } catch (err) {
      console.error('Ошибка генерации ключа:', err);
    } finally {
      setLoading(false);
    }
  }, [loadKeys]);

  /** Отзыв ключа */
  const handleRevoke = useCallback(async (key) => {
    try {
      await authApi.revokeKey(key);
      await loadKeys();
    } catch (err) {
      console.error('Ошибка отзыва ключа:', err);
    }
  }, [loadKeys]);

  /** Копирование ключа в буфер обмена */
  const handleCopy = useCallback(async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  }, [newKey]);

  /** Форматирование оставшегося времени */
  const formatTTL = (seconds) => {
    if (seconds <= 0) return 'Истёк';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              Ключи модераторов
            </CardTitle>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={loading}
            >
              <Plus className="h-4 w-4 mr-1" />
              Новый ключ
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Нет активных ключей
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-mono">
                        {item.key.substring(0, 8)}...{item.key.substring(item.key.length - 4)}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Осталось: {formatTTL(item.ttl)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(item.key)}
                    title="Отозвать ключ"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Диалог с новым ключом */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Ключ модератора создан
            </DialogTitle>
            <DialogDescription>
              Скопируйте ключ и передайте модератору. Ключ одноразовый.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-4">
            <div className="flex gap-2">
              <Input
                value={newKey?.key || ''}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title="Копировать"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {newKey && (
              <p className="text-xs text-muted-foreground">
                Действителен до: {new Date(newKey.expiresAt).toLocaleTimeString('ru-RU')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowDialog(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
