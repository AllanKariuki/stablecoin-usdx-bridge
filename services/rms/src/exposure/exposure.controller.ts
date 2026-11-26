import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AuditContext, AuditRequest, enqueueAuditEvent, RequireServiceRole } from '@damp/nest-platform';
import { AUDIT, SERVICE } from '../audit/audit-actions';
import { Actor } from '../auth/actor.decorator';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { DbService } from '../db/db.service';
import { decimalsFor, toScaled, fromScaled } from '../money/money';
import { ExposureLimitsRepository } from './exposure-limits.repository';
import { ExposureService } from './exposure.service';
import { TreasuryRebalancesRepository } from './treasury-rebalances.repository';

/**
 * The treasury desk's surface: the house's crypto exposure with its policy
 * and reconciliation status, the check pricing runs before minting a quote,
 * the limits the treasury committee sets, and the rebalance trades the desk
 * posts.
 *
 * Everything except POST /exposure/check is an operator surface behind the
 * default rms.user-proxy role (svc-bff), mirroring the reserves/custodians
 * controllers; the check is the one service-to-service route and carries
 * its own role, rms.exposure.check (svc-pricing).
 */
/** The two rebalance outcomes: a fresh record, or the replay of one. */
type RebalanceResponse =
  | { replay: true; ledger_tx_id: string }
  | {
      id: string;
      side: string;
      currency: string;
      amount: string;
      fiat_currency: string;
      fiat_amount: string;
      custodian_ref: string;
      note: string;
      ledger_tx_id: string;
      created_by: string;
      created_at: string;
    };

@Controller()
export class ExposureController {
  constructor(
    private readonly exposure: ExposureService,
    private readonly ledger: CoreLedgerClient,
    private readonly limits: ExposureLimitsRepository,
    private readonly rebalances: TreasuryRebalancesRepository,
    private readonly db: DbService,
  ) {}

  @Get('exposure')
  async overview() {
    return { currencies: await this.exposure.overview() };
  }

  /**
   * The gate every crypto-legged quote passes: `delta` is the signed change
   * in customer liabilities the quote would cause (positive = customers gain
   * the currency = the house gets more short). 200 means the quote may
   * proceed; 422 EXPOSURE_LIMIT_EXCEEDED means pricing must refuse it.
   */
  @Post('exposure/check')
  @RequireServiceRole('rms.exposure.check')
  @HttpCode(200)
  async check(@Body() body: { currency?: string; delta?: string }) {
    const currency = (body?.currency ?? '').toUpperCase();
    if (!currency || body?.delta === undefined || body.delta === '') {
      throw new BadRequestException('currency and a signed delta are required');
    }
    return this.exposure.check(currency, body.delta);
  }

  @Get('exposure/limits/:currency')
  async getLimit(@Param('currency') currency: string) {
    const limit = await this.limits.find(currency.toUpperCase());
    if (!limit) {
      return { limit: null };
    }
    return { limit };
  }

  /**
   * Sets the mandate for one currency. The path names the currency; a body
   * that names a different one is refused rather than silently writing a
   * limit nobody addressed — the same shape as PUT /reserves/targets.
   */
  @Put('exposure/limits/:currency')
  async putLimit(
    @Actor() actor: string,
    @AuditContext() audit: AuditRequest,
    @Param('currency') currency: string,
    @Body() body: { currency?: string; max_short: string; max_long: string },
  ) {
    currency = currency.toUpperCase();
    if (body?.currency && body.currency !== currency) {
      throw new BadRequestException(`body names ${body.currency} but the path names ${currency}`);
    }
    if (!isNonNegativeDecimal(body.max_short, currency) || !isNonNegativeDecimal(body.max_long, currency)) {
      throw new BadRequestException(`max_short and max_long must be non-negative ${currency} decimal amounts`);
    }
    return this.db.transaction(async (q) => {
      const { limit, previous } = await this.limits.upsert(
        { currency, maxShort: body.max_short, maxLong: body.max_long, updatedBy: actor },
        q,
      );
      await enqueueAuditEvent(
        q,
        {
          actor,
          action: AUDIT.exposureLimitSet,
          subjectType: 'EXPOSURE_LIMIT',
          subjectId: currency,
          service: SERVICE,
          beforeState: previous ? { maxShort: previous.maxShort, maxLong: previous.maxLong } : undefined,
          afterState: { maxShort: limit.maxShort, maxLong: limit.maxLong },
        },
        audit,
      );
      return limit;
    });
  }

  /**
   * Posts one treasury desk trade: validate, call core-ledger's rebalance
   * journal under a deterministic Idempotency-Key, then record the trade
   * with its audit event — the record and the evidence commit or roll back
   * together. A retry of the same trade replays the ledger call (same key,
   * same journal transaction) and returns the existing row without auditing
   * twice.
   */
  @Post('treasury/rebalances')
  @HttpCode(201)
  async rebalance(
    @Actor() actor: string,
    @AuditContext() audit: AuditRequest,
    @Body() body: {
      side?: string;
      currency?: string;
      amount?: string;
      fiat_currency?: string;
      fiat_amount?: string;
      custodian_ref?: string;
      note?: string;
    },
  ): Promise<RebalanceResponse> {
    const trade = this.exposure.validateRebalance({
      side: body?.side ?? '',
      currency: body?.currency ?? '',
      amount: body?.amount ?? '',
      fiatCurrency: body?.fiat_currency ?? '',
      fiatAmount: body?.fiat_amount ?? '',
      custodianRef: body?.custodian_ref ?? '',
      note: body?.note ?? '',
    });

    const posted = await this.ledger.postTreasuryRebalance({
      side: trade.side,
      currency: trade.currency,
      amount: trade.amount,
      fiatCurrency: trade.fiatCurrency,
      fiatAmount: trade.fiatAmount,
      custodianRef: trade.custodianRef,
      note: trade.note,
    });

    const row = await this.db.transaction(async (q) => {
      const recorded = await this.rebalances.record(
        {
          side: trade.side,
          currency: trade.currency,
          amount: trade.amount,
          fiatCurrency: trade.fiatCurrency,
          fiatAmount: trade.fiatAmount,
          custodianRef: trade.custodianRef,
          note: trade.note,
          ledgerTxId: posted.id,
          createdBy: actor,
        },
        q,
      );
      if (!recorded) return null; // replay: the trade is already on record
      await enqueueAuditEvent(
        q,
        {
          actor,
          action: AUDIT.treasuryRebalancePosted,
          subjectType: 'TREASURY_REBALANCE',
          subjectId: recorded.id,
          service: SERVICE,
          afterState: {
            side: recorded.side,
            currency: recorded.currency,
            amount: recorded.amount,
            fiatCurrency: recorded.fiatCurrency,
            fiatAmount: recorded.fiatAmount,
            custodianRef: recorded.custodianRef,
            note: recorded.note,
          },
          metadata: { ledgerTxId: posted.id },
        },
        audit,
      );
      return recorded;
    });

    if (!row) {
      return { replay: true, ledger_tx_id: posted.id };
    }
    return {
      id: row.id,
      side: row.side,
      currency: row.currency,
      amount: row.amount,
      fiat_currency: row.fiatCurrency,
      fiat_amount: row.fiatAmount,
      custodian_ref: row.custodianRef,
      note: row.note,
      ledger_tx_id: posted.id,
      created_by: row.createdBy,
      created_at: row.createdAt.toISOString(),
    };
  }

  @Get('treasury/rebalances')
  async listRebalances(@Query('limit') limit?: string) {
    const parsed = Number(limit ?? '50');
    const capped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
    const rows = await this.rebalances.list(capped);
    return {
      rebalances: rows.map((row) => ({
        id: row.id,
        side: row.side,
        currency: row.currency,
        amount: row.amount,
        fiat_currency: row.fiatCurrency,
        fiat_amount: row.fiatAmount,
        custodian_ref: row.custodianRef,
        note: row.note,
        ledger_tx_id: row.ledgerTxId,
        created_by: row.createdBy,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }
}

/** A non-negative decimal at the currency's scale, never a float. */
function isNonNegativeDecimal(raw: string | undefined, currency: string): boolean {
  if (raw === undefined || raw.trim() === '') return false;
  try {
    const scaled = toScaled(raw.trim(), decimalsFor(currency));
    if (scaled < 0n) return false;
    fromScaled(scaled, decimalsFor(currency)); // round-trips: no more precision than the currency has
    return true;
  } catch {
    return false;
  }
}
