import { Language } from '../../types/api';
import { formatTaxonomyTag as i18nFormatTaxonomyTag } from '../../i18n';

export const TAXONOMY_NAMES: Record<string, string> = {
  H01: 'SLIP & WET',
  H02: 'TRIP & CLUTTER',
  H03: 'ELECTRICAL',
  H04: 'FIRE & HEAT',
  H05: 'SHARP & GLASS',
  H06: 'FALL FROM HEIGHT',
  H07: 'UNSTABLE OBJECT',
  H08: 'CHEMICAL & POISON',
  H09: 'CHOKING',
  H10: 'WATER & DROWNING',
  H11: 'STRANGULATION',
  H12: 'STRUCTURAL',
  H13: 'POOR VISIBILITY',
  H14: 'OUTDOOR TRAFFIC',
  H15: 'OTHER',
};

/**
 * Format a category ID into a monospace taxonomy tag like [H03: ELECTRICAL],
 * [H03: ವಿದ್ಯುತ್ ಅಪಾಯ], or [H03: विद्युत खतरा].
 */
export function formatTaxonomyTag(categoryId?: string | null, lang?: Language): string {
  return i18nFormatTaxonomyTag(categoryId, lang);
}
