import React, { useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Camera, Video, Radio, Activity, FileText, History, Settings, LayoutGrid } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface ModeItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODES: ModeItem[] = [
  { id: 'overview', label: 'Overview', path: '/', icon: LayoutGrid },
  { id: 'photo', label: 'Photo', path: '/photo', icon: Camera },
  { id: 'video', label: 'Video', path: '/video', icon: Video },
  { id: 'live', label: 'Live', path: '/live', icon: Radio },
  { id: 'workflow', label: 'Workflow', path: '/workflow', icon: Activity },
  { id: 'reports', label: 'Reports', path: '/reports', icon: FileText },
  { id: 'history', label: 'History', path: '/history', icon: History },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

export const ModeDial: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Normalize path
  const currentPath = location.pathname;

  // Auto-scroll active item into center view
  useEffect(() => {
    if (activeBtnRef.current && containerRef.current) {
      const container = containerRef.current;
      const btn = activeBtnRef.current;
      const scrollLeft = btn.offsetLeft - container.offsetWidth / 2 + btn.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [currentPath]);

  // Keyboard navigation for mode dial
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
      navigate(MODES[nextIndex].path);
    }
  };

  return (
    <nav
      aria-label="Mode Navigation"
      className="w-full flex justify-center select-none touch-manipulation"
    >
      <div
        ref={containerRef}
        role="tablist"
        aria-orientation="horizontal"
        className="flex items-center gap-1.5 sm:gap-1 overflow-x-auto no-scrollbar scroll-smooth px-3 sm:px-2 py-1.5 sm:py-1 bg-[#252422]/95 backdrop-blur-md border border-[#151513] rounded-full shadow-ember-panel font-mono text-xs max-w-full snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {MODES.map((mode, idx) => {
          const isActive =
            mode.path === '/'
              ? currentPath === '/'
              : currentPath.startsWith(mode.path);
          const Icon = mode.icon;
          const displayLabel = t(`modes.${mode.id}`, mode.label);

          return (
            <button
              key={mode.id}
              ref={isActive ? activeBtnRef : null}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => navigate(mode.path)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`flex items-center justify-center gap-1.5 px-3.5 sm:px-3 py-2.5 sm:py-1.5 min-h-[48px] sm:min-h-0 rounded-full text-xs font-mono whitespace-nowrap transition-all duration-150 shrink-0 snap-center focus:outline-none focus:ring-1 focus:ring-[#FF6542] touch-manipulation active:scale-95 cursor-pointer ${
                isActive
                  ? 'bg-[#181818] text-[#FBFAF9] border border-[#FF6543] shadow-[0_0_12px_-3px_rgba(255,101,66,0.35)] font-semibold'
                  : 'text-[#898580] hover:text-[#FBFAF9] hover:bg-[#353431]/50 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 transition-colors ${isActive ? 'text-[#FF6542]' : 'text-[#898580]'}`} />
              <span className="text-xs">{displayLabel}</span>
              {isActive && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#FF6542] shadow-[0_0_6px_#FF6542] ml-0.5 shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
