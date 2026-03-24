/**
 * Компонент диалогового окна (shadcn/ui стиль)
 */
import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';

/** Оверлей диалога */
function DialogOverlay({ onClick }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 animate-fade-in"
      onClick={onClick}
    />
  );
}

/** Контейнер диалога */
function Dialog({ open, onOpenChange, children }) {
  // Закрытие по Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      <DialogOverlay onClick={() => onOpenChange?.(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="animate-slide-in">
          {children}
        </div>
      </div>
    </>
  );
}

function DialogContent({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'relative w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg',
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left mb-4', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }) {
  return (
    <h2
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }) {
  return (
    <p
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
