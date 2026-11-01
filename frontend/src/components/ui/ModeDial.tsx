import React, { useRef, useEffect } from 'react';
import { AppMode } from '../../types/ui';
import { useTranslation } from '../../i18n';

export interface ModeDialProps {
  currentMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  className?: string;
}

interface ModeItem {
  id: AppMode;
  label: string;
}

const MODES: ModeItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'photo', label: 'Photo' },
  { id: 'video', label: 'Video' },
  { id: 'live', label: 'Live' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'reports', label: 'Reports' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export const ModeDial: React.FC<ModeDialProps> = ({
  currentMode,
  onSelectMode,
  className = '',
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  // Scroll active mode into view smoothly
  useEffect(() => {
    if (activeBtnRef.current && containerRef.current) {
      const btn = activeBtnRef.current;
      const container = containerRef.current;
      const scrollLeft =
        btn.offsetLeft - container.offsetWidth / 2 + btn.offsetWidth / 2;
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }

    }
  }, [currentMode]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (index + 1) % MODES.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (index - 1 + MODES.length) % MODES.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = MODES.length - 1;
    }

    if (nextIndex !== index) {
      onSelectMode(MODES[nextIndex].id);
      // Find and focus the next button
      const nextBtn = containerRef.current?.children[nextIndex] as HTMLButtonElement | undefined;
      nextBtn?.focus();
    }
  };

  return (
    <nav
      aria-label="Application navigation modes"
      className={`relative select-none touch-manipulation ${className}`}
    >
      <div
        ref={containerRef}
        role="tablist"
        aria-orientation="horizontal"
        className="flex items-center space-x-1.5 sm:space-x-1 overflow-x-auto scrollbar-none py-2 px-4 sm:px-6 scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {MODES.map((item, index) => {
          const isActive = currentMode === item.id;
          const displayLabel = t(`modes.${item.id}`, item.label);
          return (
            <button
              key={item.id}
              ref={isActive ? activeBtnRef : null}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelectMode(item.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`snap-center shrink-0 px-3.5 py-2.5 sm:py-1.5 min-h-[48px] sm:min-h-0 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-signal-cyan touch-manipulation active:scale-95 cursor-pointer ${
                isActive
                  ? 'bg-signal-cyan text-ink-900 shadow-md scale-105'
                  : 'text-mist-400 hover:text-mist-100 hover:bg-ink-800'
              }`}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
