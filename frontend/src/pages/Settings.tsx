import React, { useState } from 'react';
import { useHistory } from '../hooks/useHistory';
import { SystemStatus } from '../types/api';
import { saveGeminiApiKey } from '../services/api';
import {
  Shield,
  Phone,
  Send,
  Trash2,
  Wifi,
  CheckCircle2,
  Key,
  AlertTriangle,
  Terminal,
} from 'lucide-react';

interface SettingsPageProps {
  systemStatus: SystemStatus | null;
}

export const Settings: React.FC<SettingsPageProps> = ({ systemStatus }) => {
  const { clearAll } = useHistory();
  const [emergencyPhone, setEmergencyPhone] = useState<string>(() => {
    return localStorage.getItem('sentinel_emergency_number') || '';
  });
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiSavedNotice, setGeminiSavedNotice] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [clearedNotice, setClearedNotice] = useState<boolean>(false);

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey.trim()) return;
    try {
      setGeminiError(null);
      await saveGeminiApiKey(geminiKey.trim());
      setGeminiSavedNotice(true);
      setGeminiKey('');
      setTimeout(() => setGeminiSavedNotice(false), 3000);
      window.location.reload();
    } catch (err: any) {
      setGeminiError(err.message || 'Failed to save Gemini API key');
    }
  };

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('sentinel_emergency_number', emergencyPhone.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleClearAll = () => {
    if (confirm('Clear all local data including scan history and custom preferences?')) {
      clearAll();
      localStorage.removeItem('sentinel_emergency_number');
      setEmergencyPhone('');
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 2000);
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6 max-w-4xl mx-auto font-mono text-xs text-[#FBFAF9]">
      {/* CLI Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#151513] pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#898580] uppercase tracking-[0.2em] mb-1">
            <Terminal className="w-3.5 h-3.5 text-[#FF6542]" />
            <span>SYS // HARDWARE_AND_CREDENTIAL_CONFIG</span>
          </div>
          <h1 className="text-xl font-bold text-[#FBFAF9] font-display flex items-center gap-2">
            <span>Settings &amp; Edge Security</span>
          </h1>
          <p className="text-xs text-[#898580] mt-1">
            Privacy commitments, emergency dispatch configuration, and local network phone access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-[#252422] border border-[#151513] text-[11px] text-[#898580]">
            CLIENT_VERSION: 2.0.0
          </span>
        </div>
      </div>

      {/* Clean API Key Entry Card */}
      <section className="p-5 rounded-xl bg-[#252422] border border-[#151513] space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#151513] pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#FF6542]" />
            <span className="font-bold text-[#FBFAF9] text-sm">
              KEY_STORE // GEMINI_MULTIMODAL_v1
            </span>
          </div>
          <span
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold ${
              systemStatus?.gemini_configured
                ? 'bg-[#181818] text-[#FF6542] border border-[#FF6542]/40'
                : 'bg-[#181818] text-amber-400 border border-amber-500/40'
            }`}
          >
            {systemStatus?.gemini_configured ? '[ACTIVE: READY]' : '[UNSET: MISSING]'}
          </span>
        </div>

        <p className="text-[#898580] leading-relaxed">
          To recognize custom physical hazards from your phone camera (such as loose wiring, sharp blades, or spills), Sentinel Lens connects to Google Gemini Multimodal Vision. Key is stored securely on the local backend.
        </p>

        {!systemStatus?.gemini_configured && (
          <div className="p-3 rounded-lg bg-[#181818] border border-amber-500/30 flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">AI Perception Inactive</p>
              <p className="text-[#898580] text-[11px] mt-0.5">
                Real-time recognition requires a Gemini API key. Without a key, custom photo recognition is disabled. You can obtain a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#FF6542] underline">Google AI Studio</a>.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveGeminiKey} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <div className="flex-1 max-w-md">
            <label htmlFor="gemini-key-input" className="sr-only">Gemini API Key</label>
            <input
              id="gemini-key-input"
              type="password"
              placeholder={systemStatus?.gemini_configured ? '•••••••••••••••••••••••••••• (Key configured)' : 'Paste Gemini API key (AIza...)'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full bg-[#181818] border border-[#151513] rounded-lg px-3 py-2 text-[#FBFAF9] text-xs focus:outline-none focus:border-[#FF6542] font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={!geminiKey.trim()}
            className="btn-hero-primary bg-[#FBFAF9] hover:bg-[#FBF9F9] text-[#353431] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-mono font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-sm"
          >
            {systemStatus?.gemini_configured ? 'Update API Key' : 'Save & Activate AI'}
          </button>
          {geminiSavedNotice && (
            <span className="text-[#FF6542] flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> Key Saved! AI Active
            </span>
          )}
          {geminiError && (
            <span className="text-red-400 flex items-center gap-1 font-mono">
              <AlertTriangle className="w-3.5 h-3.5" /> {geminiError}
            </span>
          )}
        </form>
      </section>

      {/* Telegram Caregiver Alert Notification Switch with Monospace Toggles */}
      <section className="p-5 rounded-xl bg-[#252422] border border-[#151513] space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#151513] pb-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#FF6542]" />
            <span className="font-bold text-[#FBFAF9] text-sm">
              DISPATCH // TELEGRAM_ALERT_NOTIFICATION
            </span>
          </div>
          <span className="text-[11px] text-[#898580]">BACKEND_OWNED</span>
        </div>

        <p className="text-[#898580] leading-relaxed">
          Automated caregiver notification switch. When high-severity hazards (e.g. reachable electric cords, burning stove) are verified, alerts are dispatched to the caregiver Telegram channel.
        </p>

        {/* Monospace Toggle Controls */}
        <div className="p-3.5 rounded-lg bg-[#181818] border border-[#151513] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="font-semibold text-[#FBFAF9]">Caregiver Telegram Dispatch</p>
            <p className="text-[11px] text-[#898580]">
              {systemStatus?.telegram_configured
                ? 'Bot active: High-risk detections are dispatched with cooldown deduplication.'
                : 'Bot unconfigured: Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend .env to enable.'}
            </p>
          </div>

          {/* Monospace Toggle Buttons */}
          <div className="flex items-center bg-[#252422] border border-[#151513] rounded-lg p-1 shrink-0">
            <span
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                systemStatus?.telegram_configured
                  ? 'bg-[#181818] text-[#FF6542] border border-[#FF6542]/40 font-bold'
                  : 'text-[#898580]'
              }`}
            >
              [ ACTIVE / ON ]
            </span>
            <span
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                !systemStatus?.telegram_configured
                  ? 'bg-[#181818] text-[#898580] border border-[#151513] font-bold'
                  : 'text-[#898580]'
              }`}
            >
              [ DISABLED / OFF ]
            </span>
          </div>
        </div>
      </section>

      {/* Emergency Assistance Contact Number */}
      <section className="p-5 rounded-xl bg-[#252422] border border-[#151513] space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#151513] pb-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#FF6542]" />
            <span className="font-bold text-[#FBFAF9] text-sm">
              TELEPHONY // EMERGENCY_OVERRIDE_NUMBER
            </span>
          </div>
          <span className="text-[11px] text-[#898580]">LOCAL_STORE</span>
        </div>

        <p className="text-[#898580] leading-relaxed">
          Configurable local emergency or caregiver contact number displayed on critical hazard banners (e.g. active fire or exposed 240V lines).
        </p>

        <form onSubmit={handleSavePhone} className="flex items-center gap-3 pt-1">
          <div className="flex-1 max-w-sm">
            <label htmlFor="emergency-phone-input" className="sr-only">Emergency Phone Number</label>
            <input
              id="emergency-phone-input"
              type="tel"
              placeholder="e.g. 911 or +1-555-0199"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              className="w-full bg-[#181818] border border-[#151513] rounded-lg px-3 py-2 text-[#FBFAF9] text-xs focus:outline-none focus:border-[#FF6542] font-mono"
            />
          </div>
          <button
            type="submit"
            className="btn-dark-solid bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] border border-[#151513] rounded-lg px-4 py-2 font-mono text-xs cursor-pointer transition-colors"
          >
            Save Number
          </button>
          {savedNotice && (
            <span className="text-[#FF6542] flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </form>
      </section>

      {/* Edge Privacy & Zero Egress Ledger */}
      <section className="p-5 rounded-xl bg-[#252422] border border-[#151513] space-y-3.5 shadow-xl">
        <div className="flex items-center gap-2 border-b border-[#151513] pb-3">
          <Shield className="w-4 h-4 text-[#FF6542]" />
          <span className="font-bold text-[#FBFAF9] text-sm">
            SPEC // ZERO_EGRESS_PRIVACY_MODEL
          </span>
        </div>

        <div className="space-y-2 text-[#898580] leading-relaxed">
          <p>
            <strong className="text-[#FBFAF9]">1. What is transmitted: </strong>
            A downscaled frame buffer (re-encoded to JPEG &le; 1600px). All camera EXIF, device telemetry, and GPS coordinates are stripped client-side in the canvas prior to dispatch.
          </p>
          <p>
            <strong className="text-[#FBFAF9]">2. When it is transmitted: </strong>
            Only upon explicit invocation in Photo/Video mode, or at discrete intervals (default 5s) during active Live camera monitoring.
          </p>
          <p>
            <strong className="text-[#FBFAF9]">3. Destination: </strong>
            Directly to the local backend server, which queries Google Gemini. Check your API tier terms before pointing cameras at confidential documents or private spaces.
          </p>
          <p>
            <strong className="text-[#FBFAF9]">4. Retention policy: </strong>
            Scan reports persist solely in your browser <code>localStorage</code>. Raw image frames and video streams are never persisted to disk or cloud storage by default.
          </p>
        </div>
      </section>

      {/* Phone Access & LAN Setup Guide with Developer Code Chips */}
      <section className="p-5 rounded-xl bg-[#252422] border border-[#151513] space-y-3.5 shadow-xl">
        <div className="flex items-center gap-2 border-b border-[#151513] pb-3">
          <Wifi className="w-4 h-4 text-[#FF6542]" />
          <span className="font-bold text-[#FBFAF9] text-sm">
            DEV_NET // PHONE_LAN_SETUP_GUIDE
          </span>
        </div>

        <p className="text-[#898580] leading-relaxed">
          To run Sentinel Lens on a physical smartphone on the same local Wi-Fi:
        </p>

        <div className="space-y-2.5 pt-1">
          <div className="p-3 rounded-lg bg-[#181818] border border-[#151513] space-y-1">
            <span className="text-[11px] text-[#FF6542] uppercase tracking-wider block">
              // OPTION A: DIRECT LAN HTTP (PHOTO &amp; VIDEO)
            </span>
            <p className="text-[#FBFAF9] text-xs">
              Open <code className="bg-[#252422] px-1.5 py-0.5 rounded text-[#FBFAF9]">http://&lt;PC-LAN-IP&gt;:5173</code> in phone browser. Native camera capture works directly over HTTP.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#181818] border border-[#151513] space-y-1">
            <span className="text-[11px] text-[#FF6542] uppercase tracking-wider block">
              // OPTION B: ADB REVERSE (ANDROID USB)
            </span>
            <p className="text-[#FBFAF9] text-xs">
              Execute: <code className="bg-[#252422] px-1.5 py-0.5 rounded text-[#FBFAF9]">adb reverse tcp:5173 tcp:5173</code>, then navigate to <code className="bg-[#252422] px-1.5 py-0.5 rounded text-[#FBFAF9]">http://localhost:5173</code>. Recognized as a secure context for Live mode.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#181818] border border-[#151513] space-y-1">
            <span className="text-[11px] text-[#FF6542] uppercase tracking-wider block">
              // OPTION C: CLOUDFLARE QUICK TUNNEL
            </span>
            <p className="text-[#FBFAF9] text-xs">
              Execute: <code className="bg-[#252422] px-1.5 py-0.5 rounded text-[#FBFAF9]">cloudflared tunnel --url http://localhost:5173</code> to test Live camera monitoring on iPhone Safari with WebRTC / camera permissions.
            </p>
          </div>
        </div>
      </section>

      {/* Clear All Data */}
      <section className="p-5 rounded-xl bg-[#252422] border border-[#151513] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
        <div>
          <h3 className="text-sm font-bold text-[#FBFAF9]">DATA_PURGE // CLEAR_LOCAL_STORAGE</h3>
          <p className="text-[11px] text-[#898580] mt-0.5">
            Wipes all cached hazard history, custom preferences, and contact numbers.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-950/30 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-500/40 font-mono text-xs cursor-pointer transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{clearedNotice ? 'PURGED!' : 'PURGE ALL LOCAL DATA'}</span>
        </button>
      </section>
    </div>
  );
};
