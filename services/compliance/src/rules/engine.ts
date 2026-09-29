/**
 * The rules engine.
 *
 * Pure functions over a transaction and a window of that party's recent
 * history. No database, no clock, no network — the caller supplies all three.
 *
 * That shape is not tidiness. A compliance rule decides whether somebody's
 * money is allowed to move, and the only way to know a rule does what its
 * name says is to be able to hand it a fabricated history and assert on the
 * answer. A rule that needs a populated Postgres and a mocked `Date.now()` to
 * test is a rule that gets tested once, at the wrong values.
 *
 * The vocabulary of rule kinds is fixed and small on purpose. A compliance
 * service with an expression language is one where a rule can throw at
 * evaluation time — on the path that decides whether a transaction is
 * allowed — and where "what do our rules actually say" has no answer short of
 * reading code.
 */

import { compareDecimal, toScaled } from '../money/money';

export type RuleKind =
  | 'AMOUNT_THRESHOLD'
  | 'VELOCITY'
  | 'AGGREGATE_WINDOW'
  | 'SANCTIONED_COUNTERPARTY'
  | 'NEW_PARTY_LARGE_TX'
  | 'STRUCTURING';

export type RuleAction = 'FLAG' | 'REVIEW' | 'BLOCK';

export interface Rule {
  id: string;
  name: string;
  kind: RuleKind;
  params: Record<string, unknown>;
  severity: string;
  action: RuleAction;
  active: boolean;
}

/** One posting, as compliance sees it. */
export interface Movement {
  transactionId: string;
  partyId: string;
  type: string;
  amount: string;
  currency: string;
  counterparty: string;
  postedAt: Date;
}

/** What the caller knows about the party, beyond this one movement. */
export interface Context {
  /** Every movement in the longest window any active rule asks for. */
  recent: Movement[];
  /** When the party first transacted. Null if this is their first. */
  firstSeenAt: Date | null;
  /** Screening outcome for the counterparty, when one has been done. */
  counterpartyScreening: { outcome: 'CLEAR' | 'REVIEW' | 'BLOCK'; matches: unknown[] } | null;
  now: Date;
}

export interface Finding {
  rule: Rule;
  detail: string;
  evidence: Record<string, unknown>;
}

export function evaluate(rules: Rule[], movement: Movement, context: Context): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const finding = evaluateOne(rule, movement, context);
    if (finding) findings.push(finding);
  }
  return findings;
}

function evaluateOne(rule: Rule, movement: Movement, context: Context): Finding | null {
  switch (rule.kind) {
    case 'AMOUNT_THRESHOLD':
      return amountThreshold(rule, movement);
    case 'VELOCITY':
      return velocity(rule, movement, context);
    case 'AGGREGATE_WINDOW':
      return aggregateWindow(rule, movement, context);
    case 'SANCTIONED_COUNTERPARTY':
      return sanctionedCounterparty(rule, movement, context);
    case 'NEW_PARTY_LARGE_TX':
      return newPartyLargeTx(rule, movement, context);
    case 'STRUCTURING':
      return structuring(rule, movement, context);
    default:
      // An unrecognised kind is silence, not a throw. A rule row written by a
      // newer version of this service must not stop an older replica from
      // evaluating every other rule on a movement.
      return null;
  }
}

// ---------------------------------------------------------------------------

function amountThreshold(rule: Rule, movement: Movement): Finding | null {
  const threshold = String(rule.params.threshold ?? '0');
  const currency = String(rule.params.currency ?? 'USD');
  if (movement.currency !== currency) return null;

  // `>=`, not `>`. A reporting threshold of $10,000 means a $10,000
  // transaction is reportable — treating it as "over ten thousand" is the
  // off-by-one that makes exactly-at-the-limit the safe amount to send.
  if (compareDecimal(movement.amount, threshold, decimalsFor(currency)) < 0) return null;

  return {
    rule,
    detail: `${movement.amount} ${currency} is at or above the ${threshold} threshold`,
    evidence: { amount: movement.amount, currency, threshold, transactionId: movement.transactionId },
  };
}

function velocity(rule: Rule, movement: Movement, context: Context): Finding | null {
  const count = Number(rule.params.count ?? 0);
  const windowMinutes = Number(rule.params.windowMinutes ?? 60);
  if (count <= 0) return null;

  const inWindow = within(context.recent, context.now, windowMinutes);
  // +1 for the movement being evaluated, which is not yet in `recent`.
  const total = inWindow.length + 1;
  if (total < count) return null;

  return {
    rule,
    detail: `${total} movements in ${windowMinutes} minutes (threshold ${count})`,
    evidence: {
      count: total,
      windowMinutes,
      threshold: count,
      transactionIds: [movement.transactionId, ...inWindow.map((m) => m.transactionId)].slice(0, 50),
    },
  };
}

function aggregateWindow(rule: Rule, movement: Movement, context: Context): Finding | null {
  const threshold = String(rule.params.threshold ?? '0');
  const currency = String(rule.params.currency ?? 'USD');
  const windowMinutes = Number(rule.params.windowMinutes ?? 1440);
  if (movement.currency !== currency) return null;

  const decimals = decimalsFor(currency);
  const inWindow = within(context.recent, context.now, windowMinutes).filter((m) => m.currency === currency);

  // Summed as scaled integers. A total accumulated as floats drifts, and a
  // rule that fires at $49,999.99999 instead of $50,000 is a rule somebody
  // will eventually be wrongly flagged by.
  let total = toScaled(movement.amount, decimals);
  for (const m of inWindow) total += toScaled(m.amount, decimals);

  if (total < toScaled(threshold, decimals)) return null;

  return {
    rule,
    detail: `${fromScaled(total, decimals)} ${currency} moved in ${windowMinutes} minutes (threshold ${threshold})`,
    evidence: {
      total: fromScaled(total, decimals),
      currency,
      threshold,
      windowMinutes,
      movementCount: inWindow.length + 1,
    },
  };
}

function sanctionedCounterparty(rule: Rule, movement: Movement, context: Context): Finding | null {
  const screening = context.counterpartyScreening;
  if (!screening || screening.outcome === 'CLEAR') return null;

  return {
    rule,
    detail: `counterparty ${movement.counterparty} screened ${screening.outcome}`,
    evidence: {
      counterparty: movement.counterparty,
      outcome: screening.outcome,
      matches: screening.matches,
      transactionId: movement.transactionId,
    },
  };
}

function newPartyLargeTx(rule: Rule, movement: Movement, context: Context): Finding | null {
  const threshold = String(rule.params.threshold ?? '0');
  const currency = String(rule.params.currency ?? 'USD');
  const accountAgeHours = Number(rule.params.accountAgeHours ?? 24);
  if (movement.currency !== currency) return null;

  // A party with no history at all is as new as it gets — treating null
  // firstSeenAt as "not new" would exempt the very first transaction, which
  // is the one this rule exists for.
  const ageHours = context.firstSeenAt
    ? (context.now.getTime() - context.firstSeenAt.getTime()) / 3_600_000
    : 0;
  if (ageHours > accountAgeHours) return null;
  if (compareDecimal(movement.amount, threshold, decimalsFor(currency)) < 0) return null;

  return {
    rule,
    detail: `${movement.amount} ${currency} from an account ${Math.floor(ageHours)}h old`,
    evidence: { amount: movement.amount, currency, threshold, accountAgeHours: ageHours },
  };
}

/**
 * Structuring: repeated amounts sitting just below a reporting threshold.
 *
 * It is the pattern thresholds themselves create, which is why a threshold
 * rule alone is not enough — somebody sending $9,900 three times a day trips
 * nothing, and that is the entire technique.
 *
 * "Just below" is a band, not a point: between `threshold * (1 - margin)` and
 * `threshold`. An exact-match test would catch nobody, because nobody sends
 * precisely the same amount every time.
 */
function structuring(rule: Rule, movement: Movement, context: Context): Finding | null {
  const threshold = String(rule.params.threshold ?? '0');
  const currency = String(rule.params.currency ?? 'USD');
  const marginPct = Number(rule.params.marginPct ?? 10);
  const count = Number(rule.params.count ?? 3);
  const windowMinutes = Number(rule.params.windowMinutes ?? 1440);
  if (movement.currency !== currency) return null;

  const decimals = decimalsFor(currency);
  const thresholdScaled = toScaled(threshold, decimals);
  const floor = thresholdScaled - (thresholdScaled * BigInt(Math.round(marginPct))) / 100n;

  const isJustUnder = (amount: string): boolean => {
    const scaled = toScaled(amount, decimals);
    return scaled >= floor && scaled < thresholdScaled;
  };

  if (!isJustUnder(movement.amount)) return null;

  const matches = within(context.recent, context.now, windowMinutes)
    .filter((m) => m.currency === currency && isJustUnder(m.amount));

  const total = matches.length + 1;
  if (total < count) return null;

  return {
    rule,
    detail: `${total} movements between ${fromScaled(floor, decimals)} and ${threshold} ${currency} in ${windowMinutes} minutes`,
    evidence: {
      count: total,
      band: { from: fromScaled(floor, decimals), to: threshold },
      currency,
      windowMinutes,
      amounts: [movement.amount, ...matches.map((m) => m.amount)].slice(0, 50),
    },
  };
}

// ---------------------------------------------------------------------------

function within(movements: Movement[], now: Date, windowMinutes: number): Movement[] {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  return movements.filter((m) => m.postedAt.getTime() >= cutoff);
}

function decimalsFor(currency: string): number {
  return currency === 'USDX' ? 6 : 2;
}

function fromScaled(scaled: bigint, decimals: number): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, '0');
  if (decimals === 0) return `${negative ? '-' : ''}${digits}`;
  return `${negative ? '-' : ''}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}
