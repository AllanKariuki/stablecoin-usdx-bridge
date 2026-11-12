import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AuditContext, AuditRequest, enqueueAuditEvent } from '@damp/nest-platform';
import { AUDIT, SERVICE } from '../audit/audit-actions';
import { Actor } from '../auth/actor.decorator';
import { DbService } from '../db/db.service';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { compareDecimal, decimalsFor, toMoney, toScaled, fromScaled } from '../money/money';
import { ReserveTargetsRepository } from './reserve-targets.repository';

/**
 * The treasury dashboard's one call.
 *
 * It is an aggregation rather than a passthrough of core-ledger's
 * /reserves/status because the ledger knows what the numbers *are* and rms
 * knows what they are *supposed to be*: the coverage ratio and whether it
 * is within mandate are policy questions, and policy lives here.
 */
@Controller('reserves')
export class ReservesController {
  constructor(
    private readonly ledger: CoreLedgerClient,
    private readonly targets: ReserveTargetsRepository,
    private readonly db: DbService,
  ) {}

  @Get('status')
  async status() {
    const status = await this.ledger.reserveStatus();
    const target = await this.targets.find(status.currency);

    const pegDecimals = decimalsFor(status.currency);
    const usdxDecimals = decimalsFor('USDX');

    // Issuance is in USD-X (6dp) and cash is in USD (2dp). Comparing them
    // needs one restated at the other's scale — doing the division at two
    // scales is a 10,000x error that would report 0.01% coverage on a fully
    // backed platform.
    const issuedAtPegScale = fromScaled(
      toScaled(status.issued, usdxDecimals) / 10n ** BigInt(usdxDecimals - pegDecimals),
      pegDecimals,
    );

    const custodianBalance = status.custodian?.balance ?? '0';
    const coverageBps = ratioBps(custodianBalance, issuedAtPegScale, pegDecimals);

    return {
      currency: status.currency,
      issued: toMoney(status.issued, 'USDX'),
      inTransit: toMoney(status.in_transit, 'USDX'),
      backing: toMoney(status.backing, status.currency),
      ledgerCash: toMoney(status.ledger_cash, status.currency),
      custodian: status.custodian
        ? {
            balance: toMoney(status.custodian.balance, status.currency),
            asOf: status.custodian.as_of,
            ageSeconds: status.custodian.age_seconds,
          }
        : null,
      chains: status.chains,
      target: target && {
        minRatioBps: target.minRatioBps,
        bufferAmount: toMoney(target.bufferAmount, status.currency),
        note: target.note,
      },
      coverage: {
        // null, not 100%, when nothing is issued: a ratio with a zero
        // denominator is undefined, and rendering it as "fully covered"
        // would make an empty platform and a healthy one look the same.
        ratioBps: coverageBps,
        // A custodian that has never reported leaves coverage unknown, which
        // is neither pass nor fail — the same three-valued honesty
        // core-ledger's leg_c_ok uses.
        withinMandate:
          coverageBps === null || !target ? null : coverageBps >= target.minRatioBps && withinBuffer(custodianBalance, issuedAtPegScale, target.bufferAmount, pegDecimals),
      },
      openBreaks: status.open_breaks,
      lastRun: status.last_run,
    };
  }

  @Get('targets')
  async list() {
    return { targets: await this.targets.list() };
  }

  /**
   * Sets the mandate for a currency. The path names the currency; a body
   * that names a different one is refused rather than silently writing a
   * target nobody addressed (the route used to read only the body's).
   */
  @Put('targets/:currency')
  async upsert(
    @Actor() actor: string,
    @AuditContext() audit: AuditRequest,
    @Param('currency') currency: string,
    @Body() body: { currency?: string; minRatioBps: number; bufferAmount?: string; note?: string },
  ) {
    if (body?.currency && body.currency !== currency) {
      throw new BadRequestException(`body names ${body.currency} but the path names ${currency}`);
    }
    return this.db.transaction(async (q) => {
      const { target, previous } = await this.targets.upsert(
        { currency, minRatioBps: body.minRatioBps, bufferAmount: body.bufferAmount ?? '0', note: body.note ?? '' },
        q,
      );
      await enqueueAuditEvent(
        q,
        {
          actor,
          action: AUDIT.reserveTargetSet,
          subjectType: 'RESERVE_TARGET',
          subjectId: currency,
          service: SERVICE,
          beforeState: previous ? { ...previous } : undefined,
          afterState: { ...target },
        },
        audit,
      );
      return target;
    });
  }
}

/** Coverage in basis points, exactly, on scaled integers. */
function ratioBps(held: string, owed: string, decimals: number): number | null {
  const owedScaled = toScaled(owed, decimals);
  if (owedScaled === 0n) return null;
  return Number((toScaled(held, decimals) * 10000n) / owedScaled);
}

function withinBuffer(held: string, owed: string, buffer: string, decimals: number): boolean {
  const required = fromScaled(toScaled(owed, decimals) + toScaled(buffer, decimals), decimals);
  return compareDecimal(held, required, decimals) >= 0;
}
