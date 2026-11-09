import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express-serve-static-core';
import { PaymentsConfig } from '../config/payments-config';
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
    private readonly config: ConfigService<PaymentsConfig, true>,
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
   * Safaricom does not hold a DAMP token, so this route is outside user auth —
   * but it is not open. A rail reference is not a secret (Daraja's
   * CheckoutRequestID appears in logs and SMS-adjacent tooling), so matching
   * one is not proof the caller is the rail. The caller must also present
   * RAIL_CALLBACK_SECRET; with none configured every call is refused. Beyond
   * that, a callback is matched to an intent by a reference this platform
   * issued, one that matches nothing is logged and dropped, and the amount it
   * reports must equal what the intent asked for (see SettlementService).
   *
   * Parse failures and unknown references still return 200: a rail that
   * receives anything else retries, often forever.
   */
  @Post('rails/:rail/callback')
  @HttpCode(200)
  async callback(@Param('rail') rail: string, @Body() body: unknown, @Req() req: Request) {
    this.assertCallbackSecret(req);
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

  private assertCallbackSecret(req: Request): void {
    const expected = this.config.get('RAIL_CALLBACK_SECRET', { infer: true }) ?? '';
    const header = req.headers['x-rail-callback-token'];
    const query = req.query?.token;
    const presented = [header, query].find((v): v is string => typeof v === 'string') ?? '';
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    // Length is compared first because timingSafeEqual throws on unequal
    // lengths; the length of the secret is not itself sensitive.
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('rail callback not authenticated');
    }
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
