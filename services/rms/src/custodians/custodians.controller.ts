import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { toMoney } from '../money/money';
import { CustodiansRepository } from './custodians.repository';
import { CustodiansService } from './custodians.service';

@Controller('custodians')
export class CustodiansController {
  constructor(
    private readonly repo: CustodiansRepository,
    private readonly service: CustodiansService,
  ) {}

  @Get()
  async list() {
    const custodians = await this.repo.list();
    return {
      custodians: custodians.map((c) => ({
        id: c.id,
        name: c.name,
        currency: c.currency,
        provider: c.provider,
        accountRef: c.accountRef,
        status: c.status,
        // The configured drift is surfaced deliberately. A treasury console
        // that shows a shortfall without showing that somebody armed a demo
        // drift is a console that starts an incident.
        drift: typeof c.config.drift === 'string' ? c.config.drift : '0',
      })),
    };
  }

  @Get(':id/statements')
  async statements(@Param('id') id: string) {
    const custodian = await this.repo.find(id);
    if (!custodian) throw new NotFoundException(`no custodian ${id}`);

    const statements = await this.repo.statements(id);
    return {
      custodianId: id,
      statements: statements.map((s) => ({
        id: s.id,
        balance: toMoney(s.balance, s.currency),
        asOf: s.asOf.toISOString(),
        statementRef: s.statementRef,
        source: s.source,
        postedAt: s.postedAt?.toISOString() ?? null,
        postAttempts: s.postAttempts,
        lastError: s.lastError,
      })),
    };
  }

  /**
   * Forces one custodian to report now.
   *
   * This is the DoD's forcing function: set a drift, poll, and the break is
   * open by the next reconciliation run rather than the next poll interval.
   */
  @Post(':id/poll')
  @HttpCode(200)
  async poll(@Param('id') id: string) {
    const statement = await this.service.pollOne(id);
    if (!statement) throw new NotFoundException(`no custodian ${id}`);
    return {
      custodianId: statement.custodianId,
      balance: toMoney(statement.balance, statement.currency),
      asOf: statement.asOf.toISOString(),
      postedAt: statement.postedAt?.toISOString() ?? null,
    };
  }

  /**
   * Arms (or disarms) the stub custodian's drift.
   *
   * A reconciliation leg nobody has ever seen break is a leg nobody knows
   * works — R7 is exactly that the one control catching an unbacked mint
   * was decorative. `-1000.00` is the DoD's "$1,000 short"; `0` heals it
   * and the break auto-resolves on the next run.
   */
  @Post(':id/drift')
  @HttpCode(200)
  async setDrift(@Param('id') id: string, @Body() body: { drift?: string }) {
    const drift = (body?.drift ?? '0').trim();
    if (!/^-?\d+(\.\d+)?$/.test(drift)) {
      throw new NotFoundException(`drift must be a signed decimal amount, got "${drift}"`);
    }
    const custodian = await this.repo.setDrift(id, drift);
    if (!custodian) throw new NotFoundException(`no custodian ${id}`);

    // Report immediately so the armed drift is visible in the ledger without
    // waiting a poll interval — the demo is "change a number, watch a
    // control fire", and a minute of nothing happening in between makes it
    // look like nothing did.
    const statement = await this.service.pollOne(id);
    return {
      custodianId: id,
      drift,
      reported: statement
        ? { balance: toMoney(statement.balance, statement.currency), asOf: statement.asOf.toISOString() }
        : null,
    };
  }
}
