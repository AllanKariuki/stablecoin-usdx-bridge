import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { toMoney } from '../money/money';
import { CustodianProvider, StubCustodianProvider } from './custodian-provider';
import { Custodian, CustodianStatement, CustodiansRepository } from './custodians.repository';

/**
 * CustodiansService is the writer reconciliation's Leg C never had.
 *
 * Two steps, always in this order: ask the custodian and write down what it
 * said, then tell core-ledger. Collapsing them into one call would make a
 * process that dies mid-report skip a statement, and a skipped custodian
 * snapshot is not a visible failure — it is a reconciliation that compares
 * against an older number and passes.
 */
@Injectable()
export class CustodiansService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustodiansService.name);
  private readonly providers = new Map<string, CustodianProvider>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repo: CustodiansRepository,
    private readonly ledger: CoreLedgerClient,
    private readonly config: ConfigService,
  ) {
    const stub = new StubCustodianProvider((currency) => this.ledger.ledgerCash(currency));
    this.providers.set(stub.name, stub);
  }

  onModuleInit(): void {
    if (!this.config.get<boolean>('CUSTODIAN_POLL_ENABLED', { infer: true })) {
      this.logger.log('custodian polling disabled; statements must be posted through the API');
      return;
    }
    const seconds = this.config.get<number>('CUSTODIAN_POLL_SECONDS', { infer: true })!;
    // unref so a pending tick never holds the process open during shutdown —
    // a poll that outlives its app is a poll writing through a closed pool.
    this.timer = setInterval(() => void this.pollAll(), seconds * 1000);
    this.timer.unref();
    this.logger.log(`polling custodians every ${seconds}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async pollAll(): Promise<void> {
    let custodians: Custodian[];
    try {
      custodians = await this.repo.active();
    } catch (err) {
      this.logger.error(`could not list custodians: ${message(err)}`);
      return;
    }

    for (const custodian of custodians) {
      try {
        await this.capture(custodian);
      } catch (err) {
        // One unreachable custodian must not stop the others from reporting.
        this.logger.error(`could not capture a statement for ${custodian.id}: ${message(err)}`);
      }
    }
    await this.drain();
  }

  /** Asks one custodian what it holds and records the answer locally. */
  async capture(custodian: Custodian): Promise<CustodianStatement> {
    const provider = this.providers.get(custodian.provider);
    if (!provider) {
      throw new Error(`custodian ${custodian.id} names provider "${custodian.provider}", which is not registered`);
    }

    const reported = await provider.fetchBalance({
      id: custodian.id,
      currency: custodian.currency,
      accountRef: custodian.accountRef,
      config: custodian.config,
    });

    return this.repo.recordStatement({
      custodianId: custodian.id,
      currency: custodian.currency,
      balance: reported.balance.amount,
      asOf: reported.asOf,
      statementRef: reported.statementRef,
      source: provider.name,
    });
  }

  /**
   * Posts every statement core-ledger has not yet acknowledged.
   *
   * It walks the backlog rather than only the newest because the ledger's
   * snapshot table is keyed by (custodian, currency, as_of): a gap in it is
   * a gap in the evidence trail, even though only each custodian's latest
   * row is what Leg C compares against today.
   */
  async drain(): Promise<void> {
    let pending: CustodianStatement[];
    try {
      pending = await this.repo.unposted();
    } catch (err) {
      this.logger.error(`could not read unposted statements: ${message(err)}`);
      return;
    }

    for (const statement of pending) {
      try {
        await this.ledger.postCustodianSnapshot({
          custodianId: statement.custodianId,
          currency: statement.currency,
          balance: statement.balance,
          asOf: statement.asOf,
          statementRef: statement.statementRef,
        });
        await this.repo.markPosted(statement.id);
        this.logger.log(
          `posted ${statement.custodianId} ${toMoney(statement.balance, statement.currency).display} ` +
            `as of ${statement.asOf.toISOString()}`,
        );
      } catch (err) {
        await this.repo.markFailed(statement.id, message(err));
        this.logger.warn(
          `core-ledger rejected the statement for ${statement.custodianId}; will retry: ${message(err)}`,
        );
      }
    }
  }

  /**
   * Captures and posts one custodian immediately.
   *
   * This is what POST /custodians/:id/poll calls, and what makes the DoD a
   * demo rather than a wait: set a drift, force a poll, and the break is
   * open by the next reconciliation run instead of the next poll interval.
   */
  async pollOne(custodianId: string): Promise<CustodianStatement | null> {
    const custodian = await this.repo.find(custodianId);
    if (!custodian) return null;
    const statement = await this.capture(custodian);
    await this.drain();
    return statement;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
