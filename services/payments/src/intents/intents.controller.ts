import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express-serve-static-core';
import { CurrentUser, IdempotencyKey } from '../auth/current-user.decorator';
import { toMoney } from '../money/money';
import { RailRegistry } from '../rails/rail.registry';
import { IntentsRepository, PaymentIntent } from './intents.repository';
import { IntentsService } from './intents.service';
import { SettlementService } from './settlement.service';

@Controller()
export class IntentsController {
  constructor(
    private readonly service: IntentsService,
    private readonly repo: IntentsRepository,
    private readonly settlement: SettlementService,
    private readonly rails: RailRegistry,
  ) {}

  @Get('payment-intents')
  async list(@CurrentUser() partyId: string) {
    const intents = await this.repo.listForParty(partyId);
    return { paymentIntents: intents.map(render) };
  }

  @Get('payment-intents/:id')
  async get(@CurrentUser() partyId: string, @Param('id') id: string) {
    const intent = await this.repo.find(id);
    // A 404 rather than a 403 for somebody else's intent. Distinguishing the
    // two tells an attacker which ids exist.
    if (!intent || intent.partyId !== partyId) throw new NotFoundException('no such payment intent');
    return render(intent);
  }

  @Post('payment-intents')
  async create(
    @CurrentUser() partyId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Body()
    body: {
      direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
      amount: string;
      currency: string;
      bankAccountId?: string;
      beneficiaryId?: string;
      invoiceId?: string;
      description?: string;
      phoneNumber?: string;
    },
  ) {
    const intent = await this.service.create({ ...body, partyId, idempotencyKey });

    // An internal transfer has no rail to wait on, so it settles here. It
    // goes through the same SettlementService the rails do rather than a
    // second inline path, because two settlement implementations become two
    // different answers to "did money move".
    if (intent.rail === 'internal' && intent.status === 'PROCESSING') {
      await this.settlement.settle(intent, intent.amount);
      return render((await this.repo.find(intent.id))!);
    }
    return render(intent);
  }

  @Post('payment-intents/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() partyId: string, @Param('id') id: string) {
    const cancelled = await this.service.cancel(id, partyId);
    if (!cancelled) {
      // Deliberately specific: "it's too late" is different from "it doesn't
      // exist", and a customer who sees the former knows their money is
      // still moving.
      throw new NotFoundException(
        'no such payment intent, or it is past the point where cancelling is possible — once a rail has the request, cancelling here would leave an intent saying CANCELLED while money is still moving',
      );
    }
    return { id, status: 'CANCELLED' };
  }

  /**
   * Where rails post their results.
   *
   * Unauthenticated by necessity — Safaricom does not hold a DAMP token — and
   * therefore trusted only as far as the rail reference it carries: a
   * callback is matched to an intent by a reference this platform issued and
   * the rail echoed back, and one that matches nothing is logged and dropped.
   * Nothing in the body decides *how much* money moves except the amount, and
   * that is re-checked against what the intent asked for.
   *
   * Always 200. A rail that receives anything else retries, often forever,
   * and a 500 from a malformed body would turn one bad callback into a
   * permanent retry loop.
   */
  @Post('rails/:rail/callback')
  @HttpCode(200)
  async callback(@Param('rail') rail: string, @Body() body: unknown, @Req() req: Request) {
    const provider = this.rails.get(rail);
    const parsed = provider.parseCallback(body);

    if (!parsed) {
      // Logged with the source so an unparseable shape is diagnosable
      // without turning on request logging for the whole service.
      return { received: true, matched: false, reason: 'callback body was not in a shape this rail produces' };
    }

    await this.settlement.onRailCallback(provider.name, parsed);
    return { received: true, matched: true, railRef: parsed.railRef, source: req.ip };
  }
}

export function render(intent: PaymentIntent) {
  return {
    id: intent.id,
    direction: intent.direction,
    amount: toMoney(intent.amount, intent.currency),
    status: intent.status,
    rail: intent.rail,
    walletId: intent.walletId,
    bankAccountId: intent.bankAccountId,
    beneficiaryId: intent.beneficiaryId,
    invoiceId: intent.invoiceId,
    description: intent.description,
    failureReason: intent.failureReason,
    // The journal transaction this intent produced. It is the answer to "did
    // this actually happen" — a status of SETTLED with no ledgerTxId would be
    // a bug, and surfacing both lets a client see that for itself.
    ledgerTxId: intent.ledgerTxId || null,
    customerAction: (intent.metadata as { customerAction?: string }).customerAction ?? null,
    createdAt: intent.createdAt.toISOString(),
    settledAt: intent.settledAt?.toISOString() ?? null,
  };
}
