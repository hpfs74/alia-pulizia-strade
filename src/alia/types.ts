/** Alia's street classification. ASM streets require a civic number; EXQ do not. */
export type TipoStrada = 'EXQ' | 'ASM' | (string & {});

export interface Street {
  idStrada: string;
  nome: string;
  tipoStrada: TipoStrada;
}

/** 0 = Sunday, matching JavaScript's Date#getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimeWindow {
  /** Minutes from midnight, inclusive. */
  startMinutes: number;
  /** Minutes from midnight, exclusive. 06.00 becomes 360. */
  endMinutes: number;
}

/**
 * Which occurrences of `weekday` within a month are selected.
 * `oddDayOfMonth` means the DATE is odd (1st, 3rd, 15th...), NOT the
 * first/third occurrence. See the spec's "dispari trap" section.
 */
export type Selector =
  | { kind: 'oddDayOfMonth' }
  | { kind: 'evenDayOfMonth' }
  | { kind: 'nthOfMonth'; n: number }
  | { kind: 'everyWeek' }
  | { kind: 'unknown' };

export interface CleaningRule {
  weekday: Weekday;
  selector: Selector;
  window: TimeWindow;
  /** The original Italian sentence, kept for debugging and audit. */
  raw: string;
}

export type LookupResult =
  | {
      status: 'scheduled';
      street: string;
      /** YYYY-MM-DD, Europe/Rome local. */
      nextDate: string;
      window: TimeWindow;
      rule: CleaningRule;
      raw: string;
    }
  | { status: 'expired'; street: string; raw: string }
  | { status: 'none'; street: string; raw: string };
