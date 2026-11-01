import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CoverageArc } from '../src/components/capture/CoverageArc';
import { QualityHint } from '../src/components/capture/QualityHint';
import { NativeCapture } from '../src/components/capture/NativeCapture';
import { HazardRow } from '../src/components/hazards/HazardRow';
import { HazardDetail } from '../src/components/hazards/HazardDetail';
import { RiskIndicator } from '../src/components/hazards/RiskIndicator';
import { PipelineStrip } from '../src/components/pipeline/PipelineStrip';
import { ModeDial } from '../src/components/ui/ModeDial';
import { ReportView } from '../src/components/report/ReportView';
import { CoverageNotes } from '../src/components/report/CoverageNotes';
import { NotifyChip } from '../src/components/report/NotifyChip';
import { ResultSheet } from '../src/components/sheet/ResultSheet';
import { MemoryRouter } from 'react-router-dom';

import { AnalysisResult, Hazard } from '../src/types/api';

const sampleHazard: Hazard = {
  id: 'hz_test_1',
  category_id: 'H03',
  title: 'Power strip next to sink',
  status: 'likely',
  evidence_strength: 'partial',
  evidence: ['A multi-socket strip is 10cm from water source'],
  trigger: 'Water basin',
  person_relevance: 'high',
  risk: {
    level: 'high',
    potential_level: null,
    rule_ids: ['R-BASE-H03', 'R-COMBO-WATER-ELEC'],
    rationale: 'Electrical item near water source; reachable by children.',
  },
  precautions: [
    {
      text: 'Move strip away from water.',
      provenance: 'guideline',
      guideline_id: 'G-H03-002',
      priority: 1,
    },
  ],
};

const sampleResult: AnalysisResult = {
  id: 'an_test_123',
  timestamp: '2026-11-01T10:15:00Z',
  outcome: 'hazards_found',
  analysis_reliable: true,
  person_category: 'child',
  language: 'en',
  scene: {
    environment: 'kitchen',
    summary: 'Kitchen counter with kettle',
    quality_flags: ['slightly_dark'],
    coverage_gaps: ['Floor not visible in frame'],
  },
  hazards: [sampleHazard],
  overall_risk: 'high',
  immediate_action: true,
  verification: {
    status: 'passed',
    issues: [],
    changes: [],
    retries_used: 0,
  },
  notification: {
    status: 'sent',
    reason: 'high risk child alert',
  },
  errors: [],
  limits: 'Based on one still image. Hidden areas are not assessed.',
  trace: [],
};

describe('RiskIndicator component (Rule R1)', () => {
  it('renders High risk with distinct shape and color, NEVER says safe', () => {
    const { container } = render(<RiskIndicator riskLevel="high" />);
    expect(screen.getByText('High')).toBeTruthy();
    expect(container.textContent).toContain('●');
    expect(container.textContent?.toLowerCase()).not.toContain('safe');
    expect(container.textContent?.toLowerCase()).not.toContain('all clear');
  });

  it('renders Medium risk with exact text and no safe wording', () => {
    const { container } = render(<RiskIndicator riskLevel="medium" />);
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain('safe');
  });

  it('renders Low risk (steel blue, not green) without safe wording', () => {
    const { container } = render(<RiskIndicator riskLevel="low" />);
    expect(screen.getByText('Low')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain('safe');
  });

  it('renders Uncertain risk with exact text and diagonal hatch styling', () => {
    const { container } = render(<RiskIndicator riskLevel="uncertain" />);
    expect(screen.getByText('Uncertain')).toBeTruthy();
    expect(container.firstChild).toHaveClass('border-dashed');
    expect(container.textContent?.toLowerCase()).not.toContain('safe');
  });
});

describe('HazardRow and HazardDetail components', () => {
  it('renders hazard row with risk edge, taxonomy tag, and status chip', () => {
    const onSelect = vi.fn();
    render(<HazardRow hazard={sampleHazard} onSelect={onSelect} />);

    expect(screen.getByText('Power strip next to sink')).toBeTruthy();
    expect(screen.getByText('Likely')).toBeTruthy();
    expect(screen.getByText('[H03: ELECTRICAL]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(sampleHazard);
  });

  it('renders hazard detail with rule IDs, priority chip, and precaution provenance badge (Rule R4 & R8)', () => {
    render(<HazardDetail hazard={sampleHazard} personCategory="child" />);

    expect(screen.getByText('[H03: ELECTRICAL]')).toBeTruthy();
    expect(screen.getByText('R-BASE-H03')).toBeTruthy();
    expect(screen.getByText('R-COMBO-WATER-ELEC')).toBeTruthy();
    expect(screen.getByText('Guideline G-H03-002')).toBeTruthy();
    expect(screen.getByText('Move strip away from water.')).toBeTruthy();
    expect(screen.getByText('Priority 1')).toBeTruthy();
  });
});

describe('CoverageArc signature component', () => {
  it('renders shutter button and triggers onCapture on tap', () => {
    const onCapture = vi.fn();
    render(
      <CoverageArc
        segments={[
          { index: 0, state: 'done', maxRisk: 'high' },
          { index: 1, state: 'empty' },
        ]}
        onCapture={onCapture}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onCapture).toHaveBeenCalled();
  });
});

describe('NativeCapture component (S-01)', () => {
  it('renders file inputs with capture="environment" for LAN mobile support', () => {
    const onFile = vi.fn();
    render(<NativeCapture onFile={onFile} acceptMode="both" />);

    const photoInput = screen.getByTestId('native-photo-camera');
    const videoInput = screen.getByTestId('native-video-camera');

    expect(photoInput.getAttribute('capture')).toBe('environment');
    expect(videoInput.getAttribute('capture')).toBe('environment');
  });
});

describe('QualityHint component (S-04)', () => {
  it('renders advisory message and actions for dark scenes', () => {
    const onRetake = vi.fn();
    const onAnalyzeAnyway = vi.fn();

    render(
      <QualityHint
        assessment={{ isAcceptable: false, issue: 'dark' }}
        onRetake={onRetake}
        onAnalyzeAnyway={onAnalyzeAnyway}
      />
    );

    expect(screen.getByText(/Too dark to check reliably/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Retake'));
    expect(onRetake).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Analyze anyway'));
    expect(onAnalyzeAnyway).toHaveBeenCalled();
  });
});

describe('PipelineStrip component (Rule R14)', () => {
  it('renders canonical execution nodes reflecting real states', () => {
    render(
      <PipelineStrip
        activeNode="perceive"
        completedNodes={['ingest']}
      />
    );

    const runningBtn = screen.getByLabelText(/Perceive: currently running/i);
    expect(runningBtn).toBeTruthy();

    const doneBtn = screen.getByLabelText(/Ingest: completed/i);
    expect(doneBtn).toBeTruthy();
  });
});

describe('ModeDial component', () => {
  it('supports keyboard navigation across application modes', () => {
    const onSelect = vi.fn();
    render(<ModeDial currentMode="photo" onSelectMode={onSelect} />);

    const photoTab = screen.getByRole('tab', { name: 'Photo' });
    expect(photoTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(photoTab, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('video');
  });
});

describe('ReportView and CoverageNotes (Rule R1 & R11)', () => {
  it('renders formal report and mandatory safety disclaimer footer', () => {
    const { container } = render(<ReportView result={sampleResult} />);

    expect(screen.getByText(/Hazard Precaution Advisor Assessment/i)).toBeTruthy();
    expect(screen.getAllByText(/Floor not visible in frame/i).length).toBeGreaterThanOrEqual(1);

    // Verify Rule R1 mandatory footer statement
    expect(
      screen.getAllByText(/This report is based on the image\(s\) analyzed and does not guarantee safety/i).length
    ).toBeGreaterThanOrEqual(1);

    // Verify forbidden words are absent
    expect(container.textContent?.toLowerCase()).not.toContain('all clear');
    expect(container.textContent?.toLowerCase()).not.toContain('no danger');
  });

  it('renders frame sampling disclaimer when samplingIntervalSeconds is provided (Rule R11)', () => {
    render(
      <CoverageNotes
        coverageGaps={['Corner occluded']}
        samplingIntervalSeconds={3}
      />
    );

    expect(
      screen.getByText(/Checks one frame every 3 s\. Events between frames can be missed\./i)
    ).toBeTruthy();
  });
});

describe('NotifyChip component (S-27)', () => {
  it('mirrors Telegram notification status and reason', () => {
    render(
      <NotifyChip
        notification={{ status: 'sent', reason: 'High risk detected' }}
      />
    );

    expect(screen.getByText('Alert Sent')).toBeTruthy();
    expect(screen.getByText('(High risk detected)')).toBeTruthy();
  });
});

describe('ResultSheet component (Terminal Ember)', () => {
  it('renders monospace findings counter, Kalam annotation, and Editorial Cream Note Card', () => {
    const onRescan = vi.fn();
    render(
      <MemoryRouter>
        <ResultSheet result={sampleResult} onRescan={onRescan} />
      </MemoryRouter>
    );

    // Monospace headline counter
    expect(screen.getByText(/\[1 HAZARD DETECTED\]/i)).toBeTruthy();

    // Handwritten annotation in Kalam font
    expect(screen.getByText(/\/\/ verified scene scan/i)).toBeTruthy();

    // Editorial Cream Note Card (§133)
    expect(screen.getByText(/\[VERIFIED FINDINGS AUDIT\]/i)).toBeTruthy();
    expect(screen.getByText(/KEY ACTION:/i)).toBeTruthy();
    expect(screen.getByText('Move strip away from water.')).toBeTruthy();
  });

  it('renders fail-closed safety messaging on outcome: failed, adhering to Rule R1', () => {
    const onRescan = vi.fn();
    const failedResult: AnalysisResult = {
      ...sampleResult,
      outcome: 'failed',
      errors: ['Network timeout occurred'],
    };

    const { container } = render(
      <MemoryRouter>
        <ResultSheet result={failedResult} onRescan={onRescan} />
      </MemoryRouter>
    );

    expect(screen.getByText(/\[ANALYSIS FAILED \/\/ FAIL-CLOSED\]/i)).toBeTruthy();
    expect(screen.getByText(/\[FAIL-CLOSED SAFETY PROTOCOL\]/i)).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain('all clear');
    expect(container.textContent?.toLowerCase()).not.toContain('no danger');
  });

  it('renders fail-closed safety messaging on outcome: inconclusive, adhering to Rule R1', () => {
    const onRescan = vi.fn();
    const inconclusiveResult: AnalysisResult = {
      ...sampleResult,
      outcome: 'inconclusive',
      hazards: [],
    };

    const { container } = render(
      <MemoryRouter>
        <ResultSheet result={inconclusiveResult} onRescan={onRescan} />
      </MemoryRouter>
    );

    expect(screen.getByText(/\[ANALYSIS INCONCLUSIVE \/\/ FAIL-CLOSED\]/i)).toBeTruthy();
    expect(screen.getByText(/\[INCONCLUSIVE ASSESSMENT \/\/ FAIL-CLOSED\]/i)).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain('all clear');
    expect(container.textContent?.toLowerCase()).not.toContain('no danger');
  });

  it('renders Rule R1 compliant wording for none_observed outcome', () => {
    const onRescan = vi.fn();
    const noneObservedResult: AnalysisResult = {
      ...sampleResult,
      outcome: 'none_observed',
      hazards: [],
    };

    const { container } = render(
      <MemoryRouter>
        <ResultSheet result={noneObservedResult} onRescan={onRescan} />
      </MemoryRouter>
    );

    expect(screen.getByText('[NO HAZARDS OBSERVED IN THIS VIEW]')).toBeTruthy();
    expect(screen.getAllByText(/No hazards observed in this view/i).length).toBeGreaterThanOrEqual(1);
    expect(container.textContent?.toLowerCase()).not.toContain('all clear');
    expect(container.textContent?.toLowerCase()).not.toContain('no danger');
  });
});

