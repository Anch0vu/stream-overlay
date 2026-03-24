/**
 * Компонент уведомлений (toast) в стиле shadcn/ui
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

const ToastContext = createContext(null);

/** Провайдер уведомлений */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  /** Добавление уведомления */
  const addToast = useCallback(({ title, description, variant = 'default', duration = 4000 }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, description, variant }]);

    // Автоматическое скрытие
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  /** Удаление уведомления */
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Контейнер уведомлений */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'animate-slide-in rounded-lg border p-4 shadow-lg',
              toast.variant === 'destructive'
                ? 'border-destructive bg-destructive text-destructive-foreground'
                : 'border-border bg-background text-foreground'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                {toast.title && (
                  <div className="text-sm font-semibold">{toast.title}</div>
                )}
                {toast.description && (
                  <div className="text-sm opacity-90 mt-1">{toast.description}</div>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-foreground/50 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Хук для показа уведомлений */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast должен использоваться внутри ToastProvider');
  }
  return context;
}
