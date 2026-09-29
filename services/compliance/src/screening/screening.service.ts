import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export type ScreeningOutcome = 'CLEAR' | 'REVIEW' | 'BLOCK';

export interface ScreeningResult {
  outcome: ScreeningOutcome;
  riskScore: number;
  matches: unknown[];
  raw: Record<string, unknown>;
}

/**
 * The `ScreeningProvider` seam, with a deterministic stub behind it.
 *
 * Like KYC's, the stub is deterministic rather than random — a demo that
 * cannot be rehearsed is not a demo, and a randomly-hitting sanctions check
 * makes the block path untestable. Here the trigger is the *subject* rather
 * than an email domain: any address or party id containing `sanction`,
 * `ofac`, or `blocked` screens BLOCK, and one containing `pep` screens
 * REVIEW.
 *
 * Results are cached with a TTL. Screening every counterparty on every
 * transfer is slow and, with a real vendor, billed per call — and a sanctions
 * list does not change between two transfers a second apart. But the cache
 * expires, because a clear screen from six months ago is not evidence about
 * today's list.
 */
@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);
  private readonly ttlHours: number;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.ttlHours = config.get<number>('SCREENING_TTL_HOURS', { infer: true }) ?? 24;
  }

  async screen(subjectType: 'PARTY' | 'ADDRESS' | 'BANK_ACCOUNT', subject: string): Promise<ScreeningResult> {
    const cached = await this.cached(subjectType, subject);
    if (cached) return cached;

    const result = this.stubScreen(subject);
    await this.db.query(
      `INSERT INTO screenings (id, subject_type, subject, provider, outcome, risk_score, matches, raw, expires_at)
       VALUES ($1,$2,$3,'stub',$4,$5,$6,$7, now() + make_interval(hours => $8))`,
      [
        `scr_${randomUUID()}`,
        subjectType,
        subject,
        result.outcome,
        result.riskScore,
        JSON.stringify(result.matches),
        JSON.stringify(result.raw),
        this.ttlHours,
      ],
    );

    if (result.outcome !== 'CLEAR') {
      this.logger.warn(`${subjectType} ${subject} screened ${result.outcome} (score ${result.riskScore})`);
    }
    return result;
  }

  private async cached(subjectType: string, subject: string): Promise<ScreeningResult | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM screenings WHERE subject_type = $1 AND subject = $2 AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [subjectType, subject],
    );
    if (!rows[0]) return null;
    return {
      outcome: rows[0].outcome,
      riskScore: rows[0].risk_score,
      matches: rows[0].matches ?? [],
      raw: rows[0].raw ?? {},
    };
  }

  private stubScreen(subject: string): ScreeningResult {
    const lowered = subject.toLowerCase();
    const base = createHash('sha256').update(subject).digest()[0] % 40;

    if (/sanction|ofac|blocked/.test(lowered)) {
      return {
        outcome: 'BLOCK',
        riskScore: 95,
        matches: [{ list: 'OFAC SDN (simulated)', score: 0.98, name: subject }],
        raw: { provider: 'stub', determinedBy: 'subject substring', subject },
      };
    }
    if (/pep|politic/.test(lowered)) {
      return {
        outcome: 'REVIEW',
        riskScore: 65,
        matches: [{ list: 'PEP (simulated)', score: 0.8, name: subject }],
        raw: { provider: 'stub', determinedBy: 'subject substring', subject },
      };
    }
    return {
      outcome: 'CLEAR',
      riskScore: base,
      matches: [],
      raw: { provider: 'stub', determinedBy: 'no match', subject },
    };
  }
}
