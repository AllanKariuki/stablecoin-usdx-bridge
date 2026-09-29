import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

export type ScreeningOutcome = 'CLEAR' | 'REVIEW' | 'REJECT';

export interface ScreeningResult {
  outcome: ScreeningOutcome;
  /** 0–100. Higher is riskier. */
  riskScore: number;
  providerRef: string;
  /** Kept verbatim on the case — "the provider said no" is not an answer without it. */
  raw: Record<string, unknown>;
  reasons: string[];
}

export interface ScreeningSubject {
  partyId: string;
  email: string;
  fullName: string;
  country: string;
  documentKinds: string[];
}

export interface KycProvider {
  readonly name: string;
  screen(subject: ScreeningSubject): Promise<ScreeningResult>;
}

/**
 * StubKyc is **deterministic by email domain**, which the plan asks for
 * explicitly: *"StubKyc deterministic by email domain so demos reproduce"*.
 *
 * A random stub makes a demo that cannot be rehearsed — you run through the
 * happy path three times and get a rejection on the fourth, in front of
 * whoever you were showing. Worse, it makes the rejection path untestable,
 * because no test can arrange for one.
 *
 * So the domain decides:
 *
 * | domain | outcome | what it's for |
 * |---|---|---|
 * | `@reject.test` | REJECT | the auto-decline path |
 * | `@review.test` | REVIEW | the queue a human works |
 * | `@pep.test` | REVIEW, high score | politically exposed person handling |
 * | anything else | CLEAR | the happy path |
 *
 * Within those, the risk score is derived from a hash of the party id rather
 * than a random number, so the same party screens to the same score every
 * time — including across a database reset, which is when a demo usually
 * breaks.
 */
@Injectable()
export class StubKycProvider implements KycProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(StubKycProvider.name);

  async screen(subject: ScreeningSubject): Promise<ScreeningResult> {
    const domain = subject.email.split('@')[1]?.toLowerCase() ?? '';
    const base = this.deterministicScore(subject.partyId);

    let outcome: ScreeningOutcome = 'CLEAR';
    let riskScore = Math.min(base, 30);
    const reasons: string[] = [];

    if (domain.endsWith('reject.test')) {
      outcome = 'REJECT';
      riskScore = 90 + (base % 10);
      reasons.push('Sanctions list match (simulated)');
    } else if (domain.endsWith('pep.test')) {
      outcome = 'REVIEW';
      riskScore = 60 + (base % 20);
      reasons.push('Politically exposed person (simulated)');
    } else if (domain.endsWith('review.test')) {
      outcome = 'REVIEW';
      riskScore = 40 + (base % 20);
      reasons.push('Adverse media match (simulated)');
    }

    // A missing required document is a REVIEW regardless of the domain: the
    // provider cannot clear somebody whose evidence is incomplete, and having
    // the stub say otherwise would let a demo approve a case that a real
    // provider would bounce.
    if (subject.documentKinds.length === 0) {
      outcome = outcome === 'REJECT' ? 'REJECT' : 'REVIEW';
      reasons.push('No documents submitted');
    }

    this.logger.log(
      `screened ${subject.partyId} (${domain || 'no domain'}) → ${outcome} score=${riskScore}`,
    );

    return {
      outcome,
      riskScore,
      providerRef: `stub_${this.deterministicRef(subject.partyId)}`,
      reasons,
      raw: {
        provider: 'stub',
        determinedBy: 'email domain',
        domain,
        documentKinds: subject.documentKinds,
        country: subject.country,
        screenedAt: new Date().toISOString(),
      },
    };
  }

  /** 0–99, stable for a given party id. */
  private deterministicScore(partyId: string): number {
    const hash = createHash('sha256').update(partyId).digest();
    return hash[0] % 100;
  }

  private deterministicRef(partyId: string): string {
    return createHash('sha256').update(partyId).digest('hex').slice(0, 16);
  }
}
