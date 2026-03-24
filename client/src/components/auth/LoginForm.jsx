/**
 * Форма входа (стример/модератор)
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { useAuth } from '../../hooks/useAuth';
import { Radio, Shield, User, LogIn, Key } from 'lucide-react';

export default function LoginForm() {
  const { loginStreamer, loginModerator, loading, error } = useAuth();
  const [streamerPassword, setStreamerPassword] = useState('');
  const [moderatorKey, setModeratorKey] = useState('');

  /** Вход стримера */
  const handleStreamerLogin = async (e) => {
    e.preventDefault();
    if (!streamerPassword.trim()) return;
    try {
      await loginStreamer(streamerPassword);
    } catch {
      // Ошибка обрабатывается в useAuth
    }
  };

  /** Вход модератора */
  const handleModeratorLogin = async (e) => {
    e.preventDefault();
    if (!moderatorKey.trim()) return;
    try {
      await loginModerator(moderatorKey);
    } catch {
      // Ошибка обрабатывается в useAuth
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Radio className="h-8 w-8 text-primary animate-pulse-glow rounded-full" />
          </div>
          <CardTitle className="text-2xl font-bold">TOON-док</CardTitle>
          <CardDescription>OnionRP Streaming Tool</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="streamer">
            <TabsList className="w-full">
              <TabsTrigger value="streamer" className="flex-1">
                <Shield className="h-4 w-4 mr-1" />
                Стример
              </TabsTrigger>
              <TabsTrigger value="moderator" className="flex-1">
                <User className="h-4 w-4 mr-1" />
                Модератор
              </TabsTrigger>
            </TabsList>

            {/* Вход стримера */}
            <TabsContent value="streamer">
              <form onSubmit={handleStreamerLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Пароль стримера</label>
                  <Input
                    type="password"
                    value={streamerPassword}
                    onChange={(e) => setStreamerPassword(e.target.value)}
                    placeholder="Введите пароль..."
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <LogIn className="h-4 w-4 mr-2" />
                  {loading ? 'Вход...' : 'Войти как стример'}
                </Button>
              </form>
            </TabsContent>

            {/* Вход модератора */}
            <TabsContent value="moderator">
              <form onSubmit={handleModeratorLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Одноразовый ключ</label>
                  <Input
                    type="text"
                    value={moderatorKey}
                    onChange={(e) => setModeratorKey(e.target.value)}
                    placeholder="Вставьте ключ от стримера..."
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <Key className="h-4 w-4 mr-2" />
                  {loading ? 'Проверка...' : 'Войти как модератор'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Ошибка */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
