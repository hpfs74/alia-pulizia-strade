import type { CleaningRule } from '../alia/types.ts';
import { matchesRule } from './occurrences.ts';

function normalise(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Compare what our parsed rule predicts against what Alia's own per-date city
 * listing says. Disagreement means our parse is wrong; callers must alert
 * conservatively and surface the mismatch.
 */
export function crossCheck(args: {
  rule: CleaningRule;
  street: string;
  date: string;
  cityList: string[];
}): { agrees: boolean; predicted: boolean; actual: boolean } {
  const predicted = matchesRule(args.rule, args.date);
  const target = normalise(args.street);
  const actual = args.cityList.some((entry) => normalise(entry) === target);
  return { agrees: predicted === actual, predicted, actual };
}
