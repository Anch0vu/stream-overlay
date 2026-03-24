/**
 * Компонент слайдера (shadcn/ui стиль)
 * Используется для управления громкостью
 */
import React, { useCallback } from 'react';
import { cn } from '../../lib/utils';

const Slider = React.forwardRef(
  ({ className, value = 0, min = 0, max = 100, step = 1, onChange, ...props }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100;

    const handleChange = useCallback(
      (e) => {
        onChange?.(Number(e.target.value));
      },
      [onChange]
    );

    return (
      <div className={cn('relative flex w-full touch-none select-none items-center', className)}>
        <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute h-full bg-primary transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        {/* Ползунок */}
        <div
          className="absolute h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };
