import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeCSVCell,
  generateReportsCSV,
  generateTrilingualHTML,
  downloadTrilingualHTMLReport,
  triggerPrint,
} from '../src/lib/exporters';
import { SafetyReport } from '../src/types/api';

describe('exporters (S-26)', () => {
  describe('sanitizeCSVCell (CSV Injection Prevention)', () => {
    it('prefixes formula triggers (=, +, -, @) with a single quote', () => {
      expect(sanitizeCSVCell('=1+1')).toBe("'=1+1");
      expect(sanitizeCSVCell('+100')).toBe("'+100");
      expect(sanitizeCSVCell('-50')).toBe("'-50");
      expect(sanitizeCSVCell('@SUM(A1:A5)')).toBe("'@SUM(A1:A5)");
    });

    it('escapes quotes and wraps values with commas in double quotes (RFC 4180)', () => {
      expect(sanitizeCSVCell('Hello, world')).toBe('"Hello, world"');
      expect(sanitizeCSVCell('He said "Danger"')).toBe('"He said ""Danger"""');
      expect(sanitizeCSVCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    it('neutralizes formula injection even when followed by quotes or commas', () => {
      // ='cmd|' /C calc'!A0
      const sanitized = sanitizeCSVCell('="alert(1)"');
      // Contains the prepended apostrophe before the '='
      expect(sanitized).toBe('"\'=""alert(1)"""');
    });

    it('handles null and undefined values safely', () => {
      expect(sanitizeCSVCell(null)).toBe('');
      expect(sanitizeCSVCell(undefined)).toBe('');
    });
  });

  describe('generateReportsCSV & Rule R1 Compliance', () => {
    const mockReport: SafetyReport = {
      id: 'an_test_123',
      timestamp: '2026-11-01T10:00:00Z',
      outcome: 'none_observed',
      analysis_reliable: true,
      person_category: 'child',
      language: 'en',
      scene: {
        environment: 'living_room',
        summary: 'Clear living room floor',
        quality_flags: [],
        coverage_gaps: ['Behind the sofa not visible'],
      },
      hazards: [],
      overall_risk: 'low',
      immediate_action: false,
      verification: {
        status: 'passed',
        issues: [],
        changes: [],
        retries_used: 0,
      },
      notification: {
        status: 'disabled',
      },
      errors: [],
      trace: [],
      limits: 'Based on one still image.',
    };

    it('uses "No hazards observed in this view" when no hazards were found', () => {
      const csv = generateReportsCSV([mockReport]);
      expect(csv).toContain('No hazards observed in this view');

      // Check Rule R1: Never say 'safe', 'no danger', or 'all clear'
      const lower = csv.toLowerCase();
      expect(lower).not.toContain('safe');
      expect(lower).not.toContain('no danger');
      expect(lower).not.toContain('all clear');
    });

    it('includes hazard details when hazards are present', () => {
      const reportWithHazard: SafetyReport = {
        ...mockReport,
        outcome: 'hazards_found',
        overall_risk: 'high',
        hazards: [
          {
            id: 'hz_1',
            category_id: 'H03',
            title: 'Exposed wire',
            status: 'likely',
            evidence_strength: 'partial',
            evidence: ['Visible copper strand'],
            risk: {
              level: 'high',
              rule_ids: ['R-H03-BASE'],
              rationale: 'Exposed live wiring',
            },
            precautions: [
              {
                text: 'Turn off power breaker and repair immediately.',
                provenance: 'guideline',
                priority: 1,
              },
            ],
          },
        ],
      };

      const csv = generateReportsCSV([reportWithHazard]);
      expect(csv).toContain('Exposed wire');
      expect(csv).toContain('H03');
      expect(csv).toContain('Visible copper strand');
      expect(csv).toContain('Turn off power breaker');
    });
  });

  describe('Trilingual Report Generator (Issue 2)', () => {
    const trilingualSampleReport: SafetyReport = {
      id: 'audit_789xyz',
      timestamp: '2026-11-01T15:30:00Z',
      outcome: 'hazards_found',
      analysis_reliable: true,
      person_category: 'child',
      language: 'en',
      scene: {
        environment: 'kitchen',
        summary: 'Kitchen counter with electrical appliances near sink',
        quality_flags: [],
        coverage_gaps: ['Concealed spaces behind refrigerator not visible'],
      },
      hazards: [
        {
          id: 'hz_elec_1',
          category_id: 'H03',
          title: 'Damaged power cord near sink',
          status: 'observed',
          evidence_strength: 'clear',
          evidence: ['Frayed insulation exposing copper core', 'Water puddle 5cm from plug'],
          trigger: 'Appliance cord fray',
          risk: {
            level: 'high',
            rule_ids: ['R-BASE-H03', 'R-COMBO-WATER-ELEC'],
            rationale: 'Severe shock and electrocution hazard near water source',
          },
          precautions: [
            {
              text: 'Disconnect and replace damaged, pinched, or frayed power cords without attempting temporary tape repairs.',
              provenance: 'guideline',
              guideline_id: 'G-H03-001',
              priority: 1,
            },
            {
              text: 'Relocate power strips, chargers, and extension cords away from sinks, basins, and moisture sources.',
              provenance: 'guideline',
              guideline_id: 'G-H03-002',
              priority: 2,
            },
          ],
        },
      ],
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
        reason: 'Immediate action required',
      },
      errors: [],
      trace: [],
      limits: 'Based on 1 camera frame.',
    };

    it('generates a full trilingual report with EN, KN, and HI titles and headers', () => {
      const html = generateTrilingualHTML(trilingualSampleReport);

      // Trilingual Header verification
      expect(html).toContain('Sentinel Lens Safety Assessment Report');
      expect(html).toContain('ಸೆಂಟಿನೆಲ್ ಲೆನ್ಸ್ ಸುರಕ್ಷತಾ ಮೌಲ್ಯಮಾಪನ ವರದಿ');
      expect(html).toContain('सेंटिनल लेंस सुरक्षा मूल्यांकन रिपोर्ट');

      // Demographic metadata in 3 languages
      expect(html).toContain('Child (1-12 years)');
      expect(html).toContain('ಮಗು (1-12 ವರ್ಷಗಳು)');
      expect(html).toContain('बच्चा (1-12 वर्ष)');

      // Category code and title in 3 languages
      expect(html).toContain('H03: ELECTRICAL');
      expect(html).toContain('ವಿದ್ಯುತ್ ಅಪಾಯ');
      expect(html).toContain('बिजली का ख़तरा');

      // Hazard title and evidence
      expect(html).toContain('Damaged power cord near sink');
      expect(html).toContain('Frayed insulation exposing copper core');

      // Auditable rules and rationale
      expect(html).toContain('R-BASE-H03');
      expect(html).toContain('R-COMBO-WATER-ELEC');
      expect(html).toContain('Severe shock and electrocution hazard');

      // Prescribed precautions in 3 languages (English, Kannada, Hindi)
      expect(html).toContain('Disconnect and replace damaged, pinched, or frayed power cords');
      expect(html).toContain('ಹಾನಿಗೊಳಗಾದ ಅಥವಾ ಸವೆದ ವಿದ್ಯುತ್ ತಂತಿಗಳನ್ನು ತಾತ್ಕಾಲಿಕ ಟೇಪ್ ಹಚ್ಚದೆ ತಕ್ಷಣ ಬದಲಾಯಿಸಿ');
      expect(html).toContain('क्षतिग्रस्त या कटे-फटे बिजली के तारों पर टेप लगाने के बजाय उन्हें तुरंत बदलें');

      // Provenance tag (Rule R8)
      expect(html).toContain('GUIDELINE: G-H03-001');

      // Coverage gaps in 3 languages
      expect(html).toContain('COVERAGE_GAPS &amp; LIMITS');

      // Mandatory Rule R1 Safety Precaution Disclaimers in all 3 languages
      expect(html).toContain('This report is based on the image(s) analyzed and does not guarantee safety');
      expect(html).toContain('ಈ ವರದಿಯು ವಿಶ್ಲೇಷಿಸಿದ ಚಿತ್ರ(ಗಳ)ವನ್ನು ಆಧರಿಸಿದೆ ಮತ್ತು ಸುರಕ್ಷತೆಯನ್ನು ಖಾತರಿಪಡಿಸುವುದಿಲ್ಲ');
      expect(html).toContain('यह रिपोर्ट विश्लेषित छवि/छवियों पर आधारित है और सुरक्षा की गारंटी नहीं देती है');

      // Google Fonts embed for Kannada and Devanagari
      expect(html).toContain('Noto+Sans+Kannada');
      expect(html).toContain('Noto+Sans+Devanagari');
      expect(html).toContain('Geist+Mono');

      // Multi-page page-break print styles
      expect(html).toContain('page-break-inside: avoid');
      expect(html).toContain('@media print');
    });

    it('enforces Rule R1 in none_observed outcome across all 3 languages', () => {
      const emptyReport: SafetyReport = {
        ...trilingualSampleReport,
        outcome: 'none_observed',
        hazards: [],
        overall_risk: 'low',
        immediate_action: false,
      };

      const html = generateTrilingualHTML(emptyReport);
      expect(html).toContain('No hazards observed in this view');
      expect(html).toContain('ಈ ವೀಕ್ಷಣೆಯಲ್ಲಿ ಯಾವುದೇ ಅಪಾಯಗಳು ಕಂಡುಬಂದಿಲ್ಲ');
      expect(html).toContain('इस दृश्य में कोई ख़तरा नहीं दिखा');

      // Rule R1: Never say 'safe', 'no danger', 'all clear'
      const lower = html.toLowerCase();
      expect(lower).not.toContain('all clear');
      expect(lower).not.toContain('no danger');
      // Ensure 'safe' is not used as an assertion of security
      expect(lower).not.toContain('is safe');
      expect(lower).not.toContain('area is safe');
    });

    it('downloadTrilingualHTMLReport triggers file download without throwing', () => {
      const mockCreateElement = vi.spyOn(document, 'createElement');
      downloadTrilingualHTMLReport(trilingualSampleReport);
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      mockCreateElement.mockRestore();
    });

    it('triggerPrint adds unconstrained printing class and calls window.print', () => {
      const printSpy = vi.fn();
      window.print = printSpy;
      triggerPrint();
      expect(printSpy).toHaveBeenCalled();
    });
  });
});
