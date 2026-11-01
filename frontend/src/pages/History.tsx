import React, { useState, useMemo } from 'react';
import { useHistory } from '../hooks/useHistory';
import { RiskIndicator } from '../components/hazards/RiskIndicator';
import { exportToCSV } from '../lib/exporters';
import { useNavigate } from 'react-router-dom';
import {
  History as HistoryIcon,
  Search,
  Download,
  Trash2,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

export const History: React.FC = () => {
  const { history, clearAll } = useHistory();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      // Risk filter
      if (riskFilter !== 'all' && item.overall_risk !== riskFilter) {
        return false;
      }
      // Person filter
      if (personFilter !== 'all' && item.person_category !== personFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesSummary = item.scene?.summary?.toLowerCase().includes(query);
        const matchesHazards = (item.hazards || []).some(
          (h) =>
            h.title.toLowerCase().includes(query) ||
            h.category_id.toLowerCase().includes(query)
        );
        return matchesSummary || matchesHazards;
      }
      return true;
    });
  }, [history, searchQuery, riskFilter, personFilter]);

  const handleExportAllCsv = () => {
    if (filteredHistory.length > 0) {
      exportToCSV(filteredHistory, 'hazard-scan-history.csv');
    }
  };

  const handleClearHistory = () => {
    clearAll();
    setShowClearConfirm(false);
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-700 pb-3">
        <div>
          <h1 className="text-lg font-bold text-mist-100 flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-signal-cyan" />
            Scan Event History
          </h1>
          <p className="text-xs text-mist-400 mt-0.5">
            Locally stored scan results (persisted in browser; images are not retained).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAllCsv}
            disabled={filteredHistory.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 text-mist-100 text-xs border border-ink-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-800 hover:bg-risk-high/20 hover:text-risk-high text-mist-400 text-xs border border-ink-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="p-4 rounded-xl bg-risk-high/15 border border-risk-high text-xs text-mist-100 space-y-3 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-risk-high flex-shrink-0 mt-0.5" />
            <p>
              Are you sure you want to clear all locally stored scan history? This action cannot be undone.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClearHistory}
              className="px-3 py-1.5 rounded bg-risk-high hover:bg-risk-high/90 text-white font-semibold"
            >
              Yes, Clear All
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1.5 rounded bg-ink-700 hover:bg-ink-600 text-mist-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-mist-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search hazards or rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-mist-100 placeholder:text-mist-400 focus:outline-none focus:ring-2 focus:ring-signal-cyan"
          />
        </div>

        <div>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-xs text-mist-100 focus:outline-none focus:ring-2 focus:ring-signal-cyan cursor-pointer"
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk Only</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
            <option value="uncertain">Uncertain / Check this</option>
          </select>
        </div>

        <div>
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-xs text-mist-100 focus:outline-none focus:ring-2 focus:ring-signal-cyan cursor-pointer"
          >
            <option value="all">All Person Categories</option>
            <option value="child">Child</option>
            <option value="baby">Baby</option>
            <option value="elderly">Elderly</option>
            <option value="adult">Adult</option>
          </select>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {filteredHistory.length === 0 ? (
          <div className="p-8 rounded-2xl bg-ink-800/60 border border-ink-700/60 text-center text-xs text-mist-400 space-y-1">
            <p className="font-semibold text-mist-300">Nothing saved yet</p>
            <p>
              {history.length > 0
                ? 'No scans match your current filter settings.'
                : 'Finished scans will appear here automatically.'}
            </p>
          </div>
        ) : (
          filteredHistory.map((scan) => {
            const confirmedCount = (scan.hazards || []).filter(
              (h) => h.status === 'observed'
            ).length;
            const checkCount = (scan.hazards || []).filter(
              (h) => h.status !== 'observed'
            ).length;

            return (
              <div
                key={scan.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate('/reports', { state: { report: scan } })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate('/reports', { state: { report: scan } });
                  }
                }}
                className="group p-4 rounded-xl bg-ink-800 hover:bg-ink-700/80 border border-ink-700 transition-all flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-signal-cyan"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <RiskIndicator riskLevel={scan.overall_risk} size="sm" />
                    <span className="font-semibold text-mist-100 capitalize">
                      {scan.person_category}
                    </span>
                    <span className="text-mist-400 font-condensed">
                      • {scan.source || 'photo'}
                    </span>
                    <span className="text-[11px] text-mist-400 font-condensed">
                      {new Date(scan.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-mist-300 line-clamp-1">
                    {scan.scene?.summary ||
                      `${confirmedCount} confirmed hazards, ${checkCount} to check.`}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-condensed text-mist-400 hidden sm:inline">
                    {(scan.hazards || []).length} hazard(s)
                  </span>
                  <ChevronRight className="w-4 h-4 text-mist-400 group-hover:text-signal-cyan group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
