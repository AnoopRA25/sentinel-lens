import React from 'react';
import { PersonCategory, Language, SystemStatus } from '../../types/api';
import { Shield, Settings, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';

interface HudHeaderProps {
  personCategory: PersonCategory;
  onPersonChange: (person: PersonCategory) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  systemStatus?: SystemStatus | null;
  transparent?: boolean;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  personCategory,
  onPersonChange,
  language,
  onLanguageChange,
  systemStatus,
  transparent = false,
}) => {
  const { t } = useTranslation();
  const isOnline = systemStatus ? systemStatus.backend_healthy : true;

  return (
    <header
      className={`w-full max-w-5xl mx-auto z-30 transition-all duration-200 px-3.5 sm:px-5 py-2 flex items-center justify-between rounded-full border border-[#151513] shadow-ember-panel ${
        transparent
          ? 'bg-[#252422]/90 backdrop-blur-md'
          : 'bg-[#252422]'
      } text-[#FBFAF9] font-mono`}
    >
      {/* Brand mark & System Status */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <Link
          to="/"
          className="flex items-center gap-2 group focus:outline-none focus:ring-1 focus:ring-[#FF6542] rounded-full"
          aria-label="Sentinel Lens Home"
        >
          <div className="w-7 h-7 rounded-full bg-[#181818] border border-[#151513] flex items-center justify-center text-[#FF6542] group-hover:border-[#FF6542] transition-colors shrink-0">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <span className="font-mono font-bold text-xs sm:text-sm tracking-tight text-[#FBFAF9] flex items-center gap-1.5 whitespace-nowrap">
            <span className="hidden xs:inline">Sentinel Lens</span>
            <span className="xs:hidden">Sentinel</span>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6542] shadow-[0_0_8px_#FF6542] animate-pulse shrink-0"
              aria-hidden="true"
            />
          </span>
        </Link>

        {/* Monospace system status indicator */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-[#181818] border border-[#151513] font-mono text-[#898580] shrink-0"
          title={`Backend: ${
            systemStatus ? (systemStatus.backend_healthy ? 'Ready' : 'Unavailable') : 'Online'
          } | Gemini: ${
            systemStatus ? (systemStatus.gemini_configured ? 'Configured' : 'Missing Key') : 'Configured'
          } | Telegram: ${
            systemStatus ? (systemStatus.telegram_configured ? 'Active' : 'Off') : 'Active'
          }`}
          aria-label={`System status: ${isOnline ? 'Online' : 'Offline'}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isOnline
                ? 'bg-[#FF6542] shadow-[0_0_6px_#FF6542] animate-pulse'
                : 'bg-[#898580]'
            }`}
            aria-hidden="true"
          />
          <span className="text-[10px] sm:text-[11px] font-mono hidden md:inline">
            {isOnline ? `[${t('ui_messages.online', 'ONLINE').toUpperCase()}]` : `[${t('ui_messages.offline', 'OFFLINE').toUpperCase()}]`}
          </span>
        </div>
      </div>

      {/* Selectors, CTA, and Settings */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Person Category Selector */}
        <div className="relative">
          <label htmlFor="person-select" className="sr-only">Target Person Category</label>
          <select
            id="person-select"
            value={personCategory}
            onChange={(e) => onPersonChange(e.target.value as PersonCategory)}
            className="bg-[#181818] border border-[#151513] text-[#FBFAF9] rounded-full px-2 sm:px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#FF6542] transition-colors cursor-pointer hover:border-[#353431]"
          >
            <option value="child">{t('person_categories.child', 'Child (0-12y)')}</option>
            <option value="baby">{t('person_categories.baby', 'Baby (0-2y)')}</option>
            <option value="elderly">{t('person_categories.elderly', 'Elderly (65+y)')}</option>
            <option value="adult">{t('person_categories.adult', 'Adult')}</option>
          </select>
        </div>

        {/* Language Selector */}
        <div className="relative">
          <label htmlFor="language-select" className="sr-only">Report Language</label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            className="bg-[#181818] border border-[#151513] text-[#FBFAF9] rounded-full px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#FF6542] transition-colors cursor-pointer hover:border-[#353431]"
          >
            <option value="en">EN</option>
            <option value="kn">ಕನ್ನಡ (KN)</option>
            <option value="hi">हिन्दी (HI)</option>
          </select>
        </div>

        {/* Rightmost Nav CTA Pill Button */}
        <Link
          to="/photo"
          className="btn-nav-cta bg-[#FF6542] text-white rounded-full px-3 sm:px-4 h-8 font-mono text-xs font-semibold inline-flex items-center gap-1.5 shadow-[0_0_14px_-2px_rgba(255,101,66,0.4)] hover:brightness-110 active:scale-95 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-[#FF6542]"
          title={t('ui_messages.new_scan', 'New Scan')}
          aria-label={t('ui_messages.new_scan', 'New Scan')}
        >
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{t('ui_messages.new_scan', 'New Scan')}</span>
        </Link>

        {/* Settings Button */}
        <Link
          to="/settings"
          className="p-1.5 rounded-full text-[#898580] hover:text-[#FBFAF9] hover:bg-[#353431]/60 border border-transparent hover:border-[#151513] transition-all focus:outline-none focus:ring-1 focus:ring-[#FF6542] shrink-0"
          title={t('modes.settings', 'Settings')}
          aria-label={t('modes.settings', 'Settings')}
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
};
