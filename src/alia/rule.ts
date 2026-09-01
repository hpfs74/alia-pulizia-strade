import type { CleaningRule, TimeWindow } from './types.ts';

export function parseRule(raw: string, window: TimeWindow): CleaningRule {
  return { weekday: 0, selector: { kind: 'unknown' }, window, raw };
}
