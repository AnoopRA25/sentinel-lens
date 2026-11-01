import React, { useState } from 'react';
import { CoverageArc } from '../components/capture/CoverageArc';
import { RiskIndicator } from '../components/hazards/RiskIndicator';
import { HazardRow } from '../components/hazards/HazardRow';
import { CoverageSegment } from '../types/ui';
import { AnalysisResult, SystemStatus } from '../types/api';
import { useHistory } from '../hooks/useHistory';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Server,
  Key,
  Send,
  ArrowRight,
  Terminal,
  Play,
  Cpu,
  BarChart2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

interface OverviewPageProps {
  segments: CoverageSegment[];
  lastResult: AnalysisResult | null;
  systemStatus: SystemStatus | null;
  onFinishSweep?: () => void;
}

type TabType = 'scan.ts' | 'taxonomy.json' | 'rules.rs';

export const Overview: React.FC<OverviewPageProps> = ({
  segments,
  lastResult,
  systemStatus,
  onFinishSweep,
}) => {
  const navigate = useNavigate();
  const { history } = useHistory();

  // Tabbed Console State
  const [activeTab, setActiveTab] = useState<TabType>('scan.ts');
  const [demoPrompt, setDemoPrompt] = useState<string>(
    'audit --scene countertop --target infant --evidence strict'
  );
  const [consoleOutput, setConsoleOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Category breakdown from real saved history
  const categoryCounts: Record<string, number> = {};
  history.forEach((scan) => {
    (scan.hazards || []).forEach((h) => {
      const cat = h.category_id || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
  });

  const chartData = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const completedSweepCount = segments.filter(
    (s) => s.state === 'done' || s.state === 'inconclusive'
  ).length;

  const handleRunDemo = (query?: string) => {
    const q = query || demoPrompt;
    setIsExecuting(true);
    setConsoleOutput('Perceiving frame: 1600px RGB stream...');
    setTimeout(() => {
      if (q.includes('Countertop')) {
        setConsoleOutput(
          '>> [PERCEIVE] Detected: Electric Kettle (1200W) adjacent to sink (dist: 12cm)\n>> [RULE EVAL] R-COMBO-WATER-ELEC triggered (severity: HIGH)\n>> [GUIDELINE] G-H03-002: Relocate electrical appliance >= 60cm from water source\n>> [DISPATCH] Caregiver alert queued [Telegram: Active]'
        );
      } else if (q.includes('Cables')) {
        setConsoleOutput(
          '>> [PERCEIVE] Detected: Exposed trailing 240V extension cord across step 4\n>> [RULE EVAL] R-BASE-FALL-01 + R-BASE-H03 triggered (severity: HIGH)\n>> [GUIDELINE] G-FALL-014: Secure cables flush to wall baseboard\n>> [DISPATCH] Audible warning emitted'
        );
      } else {
        setConsoleOutput(
          '>> [PERCEIVE] Detected: Small plastic parts (< 3.2cm) on carpet\n>> [RULE EVAL] R-CHOKE-HAZARD-02 triggered (demographic: infant/child)\n>> [GUIDELINE] G-TOY-001: Store small-parts toys in latched bin\n>> [STATUS] Verification complete · Latency: 214ms'
        );
      }
      setIsExecuting(false);
    }, 450);
  };

  const handleChipClick = (chipText: string) => {
    const newPrompt = `audit --preset "${chipText}" --target child --stream`;
    setDemoPrompt(newPrompt);
    handleRunDemo(chipText);
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[#181818] text-[#FBFAF9] font-mono selection:bg-[#FF6542]/30 selection:text-[#FBFAF9]">
      {/* Hero Section with Radial Ember Bloom */}
      <section className="relative w-full pt-12 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden hero-ember-glow border-b border-[#151513]">
        {/* Subtle Conic Rim Light Glow Ring in Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] sm:w-[500px] sm:h-[500px] rounded-full conic-rim-light opacity-30 blur-2xl pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto flex flex-col items-center text-center space-y-6">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#252422] border border-[#151513] text-[#898580] text-xs font-mono uppercase tracking-[0.2em]">
            <span className="w-2 h-2 rounded-full bg-[#FF6542] animate-pulse" />
            <span>SENTINEL LENS // AUTONOMOUS AUDITOR</span>
          </div>

          {/* Large Display Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-[54px] font-medium leading-[1.05] tracking-[-1.2px] font-display text-[#FBFAF9] max-w-3xl">
            Deterministic physical hazard intelligence.
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-[#898580] max-w-xl leading-relaxed">
            Real-time camera perception paired with auditable, zero-hallucination safety rule engines. Tailored for infant, child, and elder vulnerability thresholds.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/photo')}
              className="btn-hero-primary bg-[#FBFAF9] text-[#353431] rounded-full px-5 py-2 font-mono font-medium shadow-sm hover:bg-[#FBF9F9] flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
            >
              <Camera className="w-4 h-4 text-[#FF6542]" />
              <span>Launch Camera Scanner</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/workflow')}
              className="btn-dark-solid bg-[#353431] text-[#FBFAF9] rounded-full px-4 py-2 font-mono flex items-center gap-2 hover:bg-[#151513] border border-[#151513] cursor-pointer"
            >
              <Cpu className="w-4 h-4 text-[#898580]" />
              <span>Inspect Agent Graph</span>
            </button>
          </div>
        </div>

        {/* Tabbed Console Demo Panel */}
        <div className="max-w-4xl mx-auto mt-12 relative">
          {/* Floating Kalam Handwritten Script Annotation Callout */}
          <div className="hidden md:flex absolute -top-8 -right-4 z-20 items-center gap-1.5 font-script italic text-[#FF6542] text-sm transform rotate-[-4deg] select-none pointer-events-none">
            <span>zero cloud egress for local rules</span>
            <span className="text-base">↗</span>
          </div>

          <div className="card-tab-panel bg-[#252422] rounded-xl border border-[#151513] p-4 shadow-2xl relative overflow-hidden">
            {/* Top Chrome: Faux Window Dots + Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#151513] pb-3">
              {/* Window Dots */}
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#FF5F56]/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-[#FFBD2E]/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-[#27C93F]/80 inline-block" />
                <span className="text-xs text-[#898580] ml-2 font-mono hidden sm:inline">
                  terminal://sentinel-engine
                </span>
              </div>

              {/* Text Tabs */}
              <div className="flex items-center gap-1 bg-[#181818] p-1 rounded-lg border border-[#151513]">
                {(['scan.ts', 'taxonomy.json', 'rules.rs'] as TabType[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
                      activeTab === tab
                        ? 'bg-[#252422] text-[#FBFAF9] font-medium border border-[#151513]'
                        : 'text-[#898580] hover:text-[#FBFAF9]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Code Preview */}
            <div className="py-3 px-2 text-xs font-mono bg-[#181818]/80 rounded-lg my-3 border border-[#151513] overflow-x-auto text-[#898580]">
              {activeTab === 'scan.ts' && (
                <pre className="text-left text-[#FBFAF9]">
                  <span className="text-[#898580]">// Scan execution pipeline</span>{'\n'}
                  <span className="text-[#FF6542]">const</span> auditor = <span className="text-[#FF6542]">new</span> SentinelAuditor({'{'} latencyBudgetMs: <span className="text-[#F5A524]">250</span> {'}'});{'\n'}
                  <span className="text-[#FF6542]">const</span> result = <span className="text-[#FF6542]">await</span> auditor.evaluateView(frameBuffer, {'{'} demographic: <span className="text-[#7FA7D6]">'infant'</span> {'}'});{'\n'}
                  console.log(result.identifiedHazards, result.provenance);
                </pre>
              )}
              {activeTab === 'taxonomy.json' && (
                <pre className="text-left text-[#FBFAF9]">
                  <span className="text-[#898580]">// Hazard Taxonomy definition</span>{'\n'}
                  {'{'}{'\n'}
                  {'  '}<span className="text-[#7FA7D6]">"category_id"</span>: <span className="text-[#FF6542]">"H03"</span>,{'\n'}
                  {'  '}<span className="text-[#7FA7D6]">"title"</span>: <span className="text-[#FBFAF9]">"Electrical & Cord Proximity"</span>,{'\n'}
                  {'  '}<span className="text-[#7FA7D6]">"strict_rules"</span>: [<span className="text-[#F5A524]">"R-BASE-H03"</span>, <span className="text-[#F5A524]">"R-COMBO-WATER-ELEC"</span>]{'\n'}
                  {'}'}
                </pre>
              )}
              {activeTab === 'rules.rs' && (
                <pre className="text-left text-[#FBFAF9]">
                  <span className="text-[#898580]">// Deterministic rule evaluation kernel</span>{'\n'}
                  <span className="text-[#FF6542]">pub fn</span> <span className="text-[#7FA7D6]">assert_water_electrical_clearance</span>(dist_cm: <span className="text-[#F5A524]">f32</span>) -&gt; RiskLevel {'{'}{'\n'}
                  {'    '}<span className="text-[#FF6542]">if</span> dist_cm &lt; <span className="text-[#F5A524]">60.0</span> {'{'} RiskLevel::High {'}'} <span className="text-[#FF6542]">else</span> {'{'} RiskLevel::Low {'}'}{'\n'}
                  {'}'}
                </pre>
              )}
            </div>

            {/* Interactive Input / Dropzone */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <div className="flex-1 flex items-center gap-2 bg-[#181818] border border-[#151513] rounded-lg px-3 py-2 text-xs">
                <Terminal className="w-4 h-4 text-[#FF6542] shrink-0" />
                <input
                  type="text"
                  value={demoPrompt}
                  onChange={(e) => setDemoPrompt(e.target.value)}
                  placeholder="Enter audit command..."
                  className="w-full bg-transparent text-[#FBFAF9] focus:outline-none font-mono"
                />
              </div>

              <button
                type="button"
                onClick={() => handleRunDemo()}
                disabled={isExecuting}
                className="px-4 py-2 rounded-lg bg-[#FF6542] hover:bg-[#FF6542]/90 text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isExecuting ? 'Auditing...' : 'Run Audit'}</span>
              </button>
            </div>

            {/* Example Prompt Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <span className="text-[11px] text-[#898580] uppercase tracking-wider font-mono">
                Preset Scenarios:
              </span>
              {[
                { label: '[Live Countertop]', query: 'Live Countertop' },
                { label: '[Staircase Cables]', query: 'Staircase Cables' },
                { label: '[Playroom Floor]', query: 'Playroom Floor' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleChipClick(chip.query)}
                  className="text-xs px-2.5 py-1 rounded-md bg-[#181818] hover:bg-[#353431] text-[#898580] hover:text-[#FBFAF9] border border-[#151513] transition-colors cursor-pointer font-mono"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Output Feed if Triggered */}
            {consoleOutput && (
              <div className="mt-4 p-3 rounded-lg bg-[#181818] border border-[#151513] text-xs font-mono text-[#898580] space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[#898580] border-b border-[#151513] pb-1 mb-1">
                  <span>AUDIT CONSOLE OUTPUT</span>
                  <span className="text-[#FF6542]">TERMINAL EMBER v2.0</span>
                </div>
                <pre className="text-xs text-[#FBFAF9] whitespace-pre-wrap leading-relaxed">
                  {consoleOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Metric / Feature Row (3 Stacked Panels, Not a Grid) */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-4">
        <div className="text-left border-b border-[#151513] pb-2">
          <span className="text-xs text-[#898580] font-mono uppercase tracking-[0.2em]">
            CORE ARCHITECTURE // TRIPLE LAYER DEFENSE
          </span>
        </div>

        {/* Panel 1 */}
        <div className="w-full p-5 rounded-xl bg-[#252422] border border-[#151513] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors hover:border-[#353431]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#FF6542]">[ 01 ]</span>
              <span className="text-xs text-[#898580] font-mono uppercase tracking-wider">
                // EDGE_PERCEPTION_LAYER
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#FBFAF9] font-display">
              Sub-300ms Native Frame Ingest
            </h3>
            <p className="text-xs text-[#898580] max-w-xl">
              Camera buffers are captured client-side in browser memory with zero metadata transmission (EXIF/GPS stripped). Analyzed via multimodal perception with real-time blur and lighting rejection.
            </p>
          </div>
          <div className="px-3 py-1 rounded bg-[#181818] border border-[#151513] text-[11px] font-mono text-[#898580] shrink-0">
            INGEST: 1600px_JPEG
          </div>
        </div>

        {/* Panel 2 */}
        <div className="w-full p-5 rounded-xl bg-[#252422] border border-[#151513] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors hover:border-[#353431]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#FF6542]">[ 02 ]</span>
              <span className="text-xs text-[#898580] font-mono uppercase tracking-wider">
                // DETERMINISTIC_TAXONOMY
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#FBFAF9] font-display">
              14 Codified Hazard Categories
            </h3>
            <p className="text-xs text-[#898580] max-w-xl">
              Strict rule matrix checks electrical clearance, tip-over risks, choke hazards, and burn temperatures against auditable threshold tables. Zero generative hallucinations permitted.
            </p>
          </div>
          <div className="px-3 py-1 rounded bg-[#181818] border border-[#151513] text-[11px] font-mono text-[#898580] shrink-0">
            MATRIX: ZERO_HALLUCINATION
          </div>
        </div>

        {/* Panel 3 */}
        <div className="w-full p-5 rounded-xl bg-[#252422] border border-[#151513] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors hover:border-[#353431]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#FF6542]">[ 03 ]</span>
              <span className="text-xs text-[#898580] font-mono uppercase tracking-wider">
                // FAIL_CLOSED_VERIFICATION
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#FBFAF9] font-display">
              Dual-Pass Auditor & Provenance Lock
            </h3>
            <p className="text-xs text-[#898580] max-w-xl">
              Every identified precaution must cite an approved guideline ID. If an image is ambiguous or dark, the engine returns inconclusive rather than guessing.
            </p>
          </div>
          <div className="px-3 py-1 rounded bg-[#181818] border border-[#151513] text-[11px] font-mono text-[#898580] shrink-0">
            AUDIT: FAIL_CLOSED
          </div>
        </div>
      </section>

      {/* Active Session & Situation Board Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between border-b border-[#151513] pb-3">
          <div>
            <span className="text-xs text-[#898580] font-mono uppercase tracking-[0.2em] block">
              SITUATION_BOARD // LIVE SESSION TELEMETRY
            </span>
            <h2 className="text-lg font-bold text-[#FBFAF9] mt-0.5">
              Active Room Sweep & Hardware Status
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/photo')}
            className="text-xs font-mono text-[#FF6542] hover:underline flex items-center gap-1"
          >
            <span>Scan Camera View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* System Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-[#252422] border border-[#151513] flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                systemStatus?.backend_healthy
                  ? 'bg-[#FF6542]/15 text-[#FF6542] border border-[#FF6542]/30'
                  : 'bg-red-500/15 text-red-400 border border-red-500/30'
              }`}
            >
              <Server className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-[#898580] font-mono uppercase tracking-wider block">
                Backend Service
              </span>
              <p className="text-xs font-bold text-[#FBFAF9]">
                {systemStatus?.backend_healthy ? 'Ready & Online' : 'Unavailable'}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#252422] border border-[#151513] flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                systemStatus?.gemini_configured
                  ? 'bg-[#FF6542]/15 text-[#FF6542] border border-[#FF6542]/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              <Key className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-[#898580] font-mono uppercase tracking-wider block">
                Gemini Vision API
              </span>
              <p className="text-xs font-bold text-[#FBFAF9]">
                {systemStatus?.gemini_configured ? 'Key Configured' : 'Offline / Unset'}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#252422] border border-[#151513] flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                systemStatus?.telegram_configured
                  ? 'bg-[#FF6542]/15 text-[#FF6542] border border-[#FF6542]/30'
                  : 'bg-[#181818] text-[#898580] border border-[#151513]'
              }`}
            >
              <Send className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-[#898580] font-mono uppercase tracking-wider block">
                Caregiver Dispatch
              </span>
              <p className="text-xs font-bold text-[#FBFAF9]">
                {systemStatus?.telegram_configured ? 'Telegram Active' : 'Notifications Off'}
              </p>
            </div>
          </div>
        </div>

        {/* Coverage Arc + Last Result Pair */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Coverage Arc Card */}
          <div className="p-5 rounded-xl bg-[#252422] border border-[#151513] flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-full flex items-center justify-between border-b border-[#151513] pb-2">
              <span className="text-xs font-bold text-[#FBFAF9] font-mono">
                ROOM_SWEEP // COVERAGE_ARC
              </span>
              <span className="text-xs font-mono text-[#FF6542]">
                {completedSweepCount} of {segments.length} views
              </span>
            </div>

            <div className="py-2">
              <CoverageArc
                segments={segments}
                onCapture={() => navigate('/photo')}
                onFinishSweep={onFinishSweep}
              />
            </div>

            <p className="text-xs text-[#898580] max-w-xs leading-relaxed font-mono">
              {completedSweepCount === 0
                ? 'No views captured in this room sweep yet. Tap the shutter to start assessing the room.'
                : 'Keep sweeping corners, floors, and elevated ledges to complete the session.'}
            </p>

            <button
              type="button"
              onClick={() => navigate('/photo')}
              className="text-xs font-mono text-[#FF6542] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Continue room sweep</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Last Result Card */}
          <div className="p-5 rounded-xl bg-[#252422] border border-[#151513] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-[#151513] pb-2">
              <span className="text-xs font-bold text-[#FBFAF9] font-mono">
                LATEST_FINDING // SENSOR_LOG
              </span>
              {lastResult && (
                <RiskIndicator riskLevel={lastResult.overall_risk} size="sm" />
              )}
            </div>

            {lastResult ? (
              <div className="space-y-3 flex-1 flex flex-col justify-center font-mono">
                <div className="flex items-center justify-between text-xs text-[#898580]">
                  <span>
                    Demographic: <strong className="text-[#FBFAF9] capitalize">{lastResult.person_category}</strong>
                  </span>
                  <span>
                    {new Date(lastResult.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                </div>

                {lastResult.outcome === 'none_observed' ? (
                  <div className="p-3 rounded-lg bg-[#181818] border border-[#151513] text-xs text-[#898580]">
                    <p className="font-semibold text-[#FBFAF9]">No hazards observed in this view.</p>
                    <p className="text-[11px] mt-1 text-[#898580]">
                      Areas outside the frame were not assessed.
                    </p>
                  </div>
                ) : lastResult.hazards && lastResult.hazards.length > 0 ? (
                  <div className="space-y-2">
                    <HazardRow
                      hazard={lastResult.hazards[0]}
                      onSelect={() => navigate('/photo')}
                    />
                    {lastResult.hazards.length > 1 && (
                      <p className="text-[11px] text-[#898580] text-center">
                        +{lastResult.hazards.length - 1} more hazard(s) in this scan
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#898580] italic">No specific hazards found.</p>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-[#898580] font-mono">
                <Camera className="w-8 h-8 mb-2 text-[#353431]" />
                <p className="text-xs">No scan recorded yet in this session.</p>
              </div>
            )}

            <div className="pt-2 border-t border-[#151513] flex items-center justify-between font-mono">
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="text-xs text-[#898580] hover:text-[#FBFAF9] flex items-center gap-1 cursor-pointer"
              >
                <span>View scan history</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/photo')}
                className="text-xs text-[#FF6542] font-bold hover:underline cursor-pointer"
              >
                New scan →
              </button>
            </div>
          </div>
        </div>

        {/* Hazard History Frequency Chart (When Scans Exist) */}
        {chartData.length > 0 && (
          <div className="p-5 rounded-xl bg-[#252422] border border-[#151513] space-y-4">
            <div className="flex items-center justify-between border-b border-[#151513] pb-2">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#FF6542]" />
                <span className="text-xs font-bold text-[#FBFAF9] font-mono">
                  HAZARD_DISTRIBUTION // SAVED_SCANS
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#898580]">
                {history.length} total saved scans
              </span>
            </div>

            <div className="w-full h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="category"
                    stroke="#898580"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#151513' }}
                  />
                  <YAxis
                    stroke="#898580"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#151513' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#252422',
                      borderColor: '#151513',
                      borderRadius: '8px',
                      color: '#FBFAF9',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Bar dataKey="count" fill="#FF6542" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* Signature Full-Bleed Coral Footer Band */}
      <footer className="footer-coral-band bg-[#FF6542] text-white p-8 sm:p-12 mt-16 rounded-t-2xl space-y-10">
        {/* 4-Column Link List in White GeistMono */}
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs font-mono">
          <div className="space-y-3">
            <span className="uppercase tracking-widest text-white/70 font-semibold block text-[11px]">
              PRODUCT
            </span>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/photo')}
                  className="hover:underline text-white/90 hover:text-white cursor-pointer"
                >
                  Scanner HUD
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/video')}
                  className="hover:underline text-white/90 hover:text-white cursor-pointer"
                >
                  Video Batch Frames
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/live')}
                  className="hover:underline text-white/90 hover:text-white cursor-pointer"
                >
                  Live Camera Stream
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/workflow')}
                  className="hover:underline text-white/90 hover:text-white cursor-pointer"
                >
                  Agent Graph
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <span className="uppercase tracking-widest text-white/70 font-semibold block text-[11px]">
              TAXONOMY
            </span>
            <ul className="space-y-2">
              <li>
                <span className="text-white/90">14 Hazard Categories</span>
              </li>
              <li>
                <span className="text-white/90">Rule Engine v2</span>
              </li>
              <li>
                <span className="text-white/90">Guideline Provenance</span>
              </li>
              <li>
                <span className="text-white/90">Demographic Thresholds</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <span className="uppercase tracking-widest text-white/70 font-semibold block text-[11px]">
              DEVELOPERS
            </span>
            <ul className="space-y-2">
              <li>
                <a
                  href="/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline text-white/90 hover:text-white"
                >
                  REST API (/docs)
                </a>
              </li>
              <li>
                <span className="text-white/90">SSE Event Stream</span>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="hover:underline text-white/90 hover:text-white cursor-pointer"
                >
                  LAN Setup Guide
                </button>
              </li>
              <li>
                <span className="text-white/90">LangGraph Pipeline</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <span className="uppercase tracking-widest text-white/70 font-semibold block text-[11px]">
              AUDIT & SAFETY
            </span>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  className="hover:underline text-white/90 hover:text-white cursor-pointer"
                >
                  Formal Reports
                </button>
              </li>
              <li>
                <span className="text-white/90">Zero Data Retention</span>
              </li>
              <li>
                <span className="text-white/90">Local EXIF Stripping</span>
              </li>
              <li>
                <span className="text-white/90">Fail-Closed Verification</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Status Indicator & Backed-By Credit */}
        <div className="max-w-5xl mx-auto pt-6 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <span className="font-semibold tracking-wide">
              SYSTEM OPERATIONAL // VERIFIED ENGINE v2.0
            </span>
          </div>

          <div className="text-white/80 text-[11px]">
            BUILT ON GEMINI MULTIMODAL VISION // DETERMINISTIC SAFETY MATRIX
          </div>
        </div>

        {/* Massive Bold Outlined Wordmark Spanning Full Width */}
        <div className="max-w-5xl mx-auto pt-6 overflow-hidden select-none text-center">
          <span
            className="block text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter uppercase font-display leading-none text-transparent"
            style={{
              WebkitTextStroke: '2px rgba(255, 255, 255, 0.85)',
            }}
          >
            SENTINEL LENS
          </span>
        </div>
      </footer>
    </div>
  );
};
