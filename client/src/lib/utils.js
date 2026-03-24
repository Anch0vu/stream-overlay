/**
 * Утилита объединения CSS-классов (shadcn-стиль)
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Объединение классов с поддержкой Tailwind */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
