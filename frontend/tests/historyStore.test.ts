import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveReport,
  getStoredReports,
  getReportById,
  deleteReport,
  clearAllReports,
  filterReports,
  MAX_HISTORY_ENTRIES,
} from '../src/lib/historyStore';
import { SafetyReport } from '../src/types/api';

describe('historyStore (S-09)', () => {
  beforeEach(() => {
    clearAllReports();
  });

  const createMockReport = (id: string, risk: 'low' | 'medium' | 'high' = 'high'): SafetyReport => ({
    id,
    timestamp: new Date().toISOString(),
    outcome: 'hazards_found',
    analysis_reliable: true,
    person_category: 'baby',
    language: 'en',
    scene: {
      environment: 'nursery',
      summary: 'Crib area with baby items',
      quality_flags: [],
      coverage_gaps: [],
    },
    hazards: [
      {
        id: `hz_${id}`,
        category_id: 'H09',
        title: 'Small coin on floor',
        status: 'observed',
        evidence_strength: 'clear',
        evidence: ['Shiny coin near crib foot'],
        risk: {
          level: risk,
          rule_ids: ['R-H09-BABY'],
          rationale: 'Choking hazard for baby',
        },
        precautions: [
          {
            text: 'Pick up small objects immediately.',
            provenance: 'guideline',
            priority: 1,
          },
        ],
      },
    ],
    overall_risk: risk,
    immediate_action: false,
    verification: {
      status: 'passed',
      issues: [],
      changes: [],
      retries_used: 0,
    },
    notification: { status: 'sent' },
    errors: [],
    trace: [],
    limits: 'Single frame analysis.',
  });

  it('saves and retrieves reports', () => {
    const report = createMockReport('rep_1');
    saveReport(report);

    const stored = getStoredReports();
    expect(stored.length).toBe(1);
    expect(stored[0].id).toBe('rep_1');
    expect(stored[0].localId).toBe('rep_1');
  });

  it('updates existing report in place if ID matches', () => {
    const r1 = createMockReport('rep_dup', 'medium');
    saveReport(r1, 'Initial note');

    const r2 = createMockReport('rep_dup', 'high');
    saveReport(r2, 'Updated note');

    const stored = getStoredReports();
    expect(stored.length).toBe(1);
    expect(stored[0].overall_risk).toBe('high');
    expect(stored[0].notes).toBe('Updated note');
  });

  it('fetches single report by ID', () => {
    saveReport(createMockReport('rep_find'));
    const item = getReportById('rep_find');
    expect(item).not.toBeNull();
    expect(item?.id).toBe('rep_find');
  });

  it('deletes report by ID', () => {
    saveReport(createMockReport('rep_del_1'));
    saveReport(createMockReport('rep_del_2'));

    const success = deleteReport('rep_del_1');
    expect(success).toBe(true);

    const stored = getStoredReports();
    expect(stored.length).toBe(1);
    expect(stored[0].id).toBe('rep_del_2');
  });

  it('clears all reports', () => {
    saveReport(createMockReport('rep_c1'));
    saveReport(createMockReport('rep_c2'));
    clearAllReports();

    expect(getStoredReports().length).toBe(0);
  });

  it('filters reports by risk level, person, and search query', () => {
    const rHigh = createMockReport('r_high', 'high');
    const rLow = createMockReport('r_low', 'low');
    rLow.scene.environment = 'kitchen';
    rLow.scene.summary = 'Kitchen cooking counter with clean dishes';
    rLow.hazards[0].title = 'Loose rug on tile';
    rLow.hazards[0].evidence = ['Curled rug corner near stove'];

    const savedHigh = saveReport(rHigh);
    const savedLow = saveReport(rLow);
    const all = [savedHigh, savedLow];

    // Filter by risk
    const highOnly = filterReports(all, { riskLevel: 'high' });
    expect(highOnly.length).toBe(1);
    expect(highOnly[0].id).toBe('r_high');

    // Filter by search query
    const rugSearch = filterReports(all, { searchQuery: 'rug' });
    expect(rugSearch.length).toBe(1);
    expect(rugSearch[0].id).toBe('r_low');

    const cribSearch = filterReports(all, { searchQuery: 'crib' });
    expect(cribSearch.length).toBe(1);
    expect(cribSearch[0].id).toBe('r_high');
  });

  it('enforces entry cap of MAX_HISTORY_ENTRIES (200)', () => {
    // Fill up to 205 items
    for (let i = 0; i < 205; i++) {
      saveReport(createMockReport(`rep_${i}`));
    }

    const stored = getStoredReports();
    expect(stored.length).toBeLessThanOrEqual(MAX_HISTORY_ENTRIES);
    expect(stored.length).toBe(200);
    // Newest is at index 0
    expect(stored[0].id).toBe('rep_204');
  });
});
