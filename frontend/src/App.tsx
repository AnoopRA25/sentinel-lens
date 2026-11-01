import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HudHeader } from './components/layout/HudHeader';
import { ModeDial } from './components/layout/ModeDial';
import { Photo } from './pages/Photo';
import { Live } from './pages/Live';
import { Video } from './pages/Video';
import { Overview } from './pages/Overview';
import { Workflow } from './pages/Workflow';
import { Reports } from './pages/Reports';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { useSession } from './hooks/useSession';
import { fetchSystemStatus } from './services/api';
import { PersonCategory, Language, AnalysisResult, SystemStatus, TraceEvent } from './types/api';
import { LanguageProvider, translateResult } from './i18n';

export const App: React.FC = () => {
  const [personCategory, setPersonCategory] = useState<PersonCategory>('child');
  const [language, setLanguage] = useState<Language>('en');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null);
  const [lastTrace, setLastTrace] = useState<TraceEvent[]>([]);
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'half' | 'full' | null>(null);

  const { segments, recordScan, finishSweep } = useSession();
  const location = useLocation();

  // Reset sheet snap state on route changes
  useEffect(() => {
    setSheetSnap(null);
  }, [location.pathname]);

  // Load system status booleans on startup
  useEffect(() => {
    fetchSystemStatus().then((status) => {
      setSystemStatus(status);
    });
  }, []);

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    if (lastResult) {
      setLastResult(translateResult(lastResult, newLang));
    }
  };

  const handleRecordScan = (result: AnalysisResult, thumbnail?: string) => {
    // Ensure recorded scan reflects the active UI language
    const localizedResult = translateResult(result, language);
    setLastResult(localizedResult);
    setLastTrace(result.trace || []);
    setLastRunTimestamp(result.timestamp);
    recordScan(localizedResult, thumbnail);
  };

  const isPhotoOrLiveRoute =
    location.pathname === '/photo' || location.pathname === '/live';

  return (
    <LanguageProvider language={language} onLanguageChange={handleLanguageChange}>
      <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-[#181818] text-[#FBFAF9] font-mono antialiased">
        {/* Top HUD Header: bounded floating bar sitting inset from viewport edges */}
        <div className="w-full pt-2.5 sm:pt-3 px-2 sm:px-6 flex justify-center z-30 shrink-0">
          <HudHeader
            personCategory={personCategory}
            onPersonChange={setPersonCategory}
            language={language}
            onLanguageChange={handleLanguageChange}
            systemStatus={systemStatus}
            transparent={isPhotoOrLiveRoute}
          />
        </div>

        {/* Mode Dial: Top bar on tablet and desktop (>= 640px) */}
        <div className="hidden sm:block z-20 shrink-0 px-3 sm:px-6 pt-1 pb-1">
          <ModeDial />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
          <Routes>
            <Route
              path="/"
              element={
                <Overview
                  segments={segments}
                  lastResult={lastResult}
                  systemStatus={systemStatus}
                  onFinishSweep={finishSweep}
                />
              }
            />
            <Route
              path="/photo"
              element={
                <Photo
                  personCategory={personCategory}
                  language={language}
                  segments={segments}
                  onRecordScan={handleRecordScan}
                  onFinishSweep={finishSweep}
                  onSheetSnapChange={setSheetSnap}
                />
              }
            />
            <Route
              path="/live"
              element={
                <Live
                  personCategory={personCategory}
                  language={language}
                />
              }
            />
            <Route
              path="/video"
              element={
                <Video
                  personCategory={personCategory}
                  language={language}
                />
              }
            />
            <Route
              path="/workflow"
              element={
                <Workflow
                  lastTrace={lastTrace}
                  lastRunTimestamp={lastRunTimestamp}
                />
              }
            />
            <Route
              path="/reports"
              element={
                <Reports
                  currentLanguage={language}
                  onLanguageChange={handleLanguageChange}
                />
              }
            />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings systemStatus={systemStatus} />} />
          </Routes>
        </main>

        {/* Mode Dial: Bottom bar on mobile (< 640px) per design.md §7.1 */}
        <div
          className={`block sm:hidden z-30 pb-safe shrink-0 px-2 py-1 transition-all duration-200 ${
            sheetSnap === 'half' || sheetSnap === 'full'
              ? 'opacity-0 pointer-events-none translate-y-4 h-0 py-0 overflow-hidden'
              : 'opacity-100 translate-y-0'
          }`}
        >
          <ModeDial />
        </div>
      </div>
    </LanguageProvider>
  );
};

export default App;
