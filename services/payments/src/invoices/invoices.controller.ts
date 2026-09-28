import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, IdempotencyKey } from '../auth/current-user.decorator';
import { toMoney } from '../money/money';
import { NotificationsClient } from '../notifications/notifications.client';
import { render as renderIntent } from '../intents/intents.controller';
import { IntentsRepository } from '../intents/intents.repository';
import { IntentsService } from '../intents/intents.service';
import { SettlementService } from '../intents/settlement.service';
import { Invoice, InvoicesRepository } from './invoices.repository';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly repo: InvoicesRepository,
    private readonly intents: IntentsService,
    private readonly intentsRepo: IntentsRepository,
    private readonly settlement: SettlementService,
    private readonly notifications: NotificationsClient,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(@CurrentUser() partyId: string, @Query('role') role?: string) {
    // Two genuinely different lists, not a filter on one: "invoices I issued"
    // and "invoices I owe" are different objects to a user even when they are
    // the same rows to a database.
    const invoices = role === 'payer' ? await this.repo.listPayable(partyId) : await this.repo.listIssued(partyId);
    return { invoices: invoices.map((i) => this.render(i, partyId)) };
  }

  @Get(':id')
  async get(@CurrentUser() partyId: string, @Param('id') id: string) {
    const invoice = await this.repo.find(id);
    if (!invoice || (invoice.issuerPartyId !== partyId && invoice.payerPartyId !== partyId)) {
      throw new NotFoundException('no such invoice');
    }
    return this.render(invoice, partyId);
  }

  @Post()
  async create(
    @CurrentUser() partyId: string,
    @Body()
    body: {
      amount: string;
      currency: string;
      payerPartyId?: string;
      payerEmail?: string;
      payerName?: string;
      dueDate?: string;
      description?: string;
      lineItems?: unknown[];
    },
  ) {
    const invoice = await this.repo.create({ ...body, issuerPartyId: partyId });

    await this.notifications.invoiceIssued({
      // Addressed to the payer when there is one. An invoice issued to an
      // email address that isn't a party yet has nobody to notify in-app —
      // the payment link is the notification.
      partyId: invoice.payerPartyId || partyId,
      invoiceId: invoice.id,
      number: invoice.number,
      amount: invoice.amount,
      currency: invoice.currency,
      payLink: this.payLink(invoice),
    });

    return this.render(invoice, partyId);
  }

  @Post(':id/void')
  @HttpCode(200)
  async void(@CurrentUser() partyId: string, @Param('id') id: string) {
    const voided = await this.repo.void(id, partyId);
    if (!voided) throw new NotFoundException('no such open invoice');
    // Voiding clears pay_token, so the payment link stops resolving. That is
    // what makes voiding a revocation rather than a label.
    return { id, status: 'VOID' };
  }

  /**
   * Resolving a payment link.
   *
   * Unauthenticated: the token *is* the credential, and the whole point of a
   * payment link is that somebody without an account can open it. It
   * authorizes exactly one thing — seeing and paying this invoice — and only
   * while the invoice is OPEN.
   *
   * The issuer is named but not otherwise exposed, and no party ids appear:
   * a bearer token should not become a way to enumerate the platform's
   * customers.
   */
  @Get('pay/:token')
  async resolve(@Param('token') token: string) {
    const invoice = await this.repo.findByToken(token);
    if (!invoice) throw new NotFoundException('this payment link is not valid, or the invoice has been paid or voided');
    return {
      number: invoice.number,
      amount: toMoney(invoice.amount, invoice.currency),
      description: invoice.description,
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      lineItems: invoice.lineItems,
      payerName: invoice.payerName,
    };
  }

  /**
   * Paying an invoice you are logged in for.
   *
   * It creates a TRANSFER intent to the issuer rather than a DEPOSIT, because
   * the money is already inside the platform: the payer's wallet debits and
   * the issuer's credits, in one journal transaction stamped with the
   * invoice's intent id.
   */
  @Post(':id/pay')
  async pay(
    @CurrentUser() partyId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Param('id') id: string,
    @Body() body: { beneficiaryId?: string },
  ) {
    const invoice = await this.repo.find(id);
    if (!invoice || invoice.status !== 'OPEN') throw new NotFoundException('no such open invoice');

    const intent = await this.intents.create({
      partyId,
      direction: 'TRANSFER',
      amount: invoice.amount,
      currency: invoice.currency,
      invoiceId: invoice.id,
      beneficiaryId: body?.beneficiaryId,
      description: `Invoice ${invoice.number}`,
      idempotencyKey,
    });

    if (intent.rail === 'internal' && intent.status === 'PROCESSING') {
      await this.settlement.settle(intent, intent.amount);
    }
    return renderIntent((await this.intentsRepo.find(intent.id))!);
  }

  private render(invoice: Invoice, viewerPartyId: string) {
    return {
      id: invoice.id,
      number: invoice.number,
      amount: toMoney(invoice.amount, invoice.currency),
      status: invoice.status,
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      description: invoice.description,
      lineItems: invoice.lineItems,
      payerName: invoice.payerName,
      payerEmail: invoice.payerEmail,
      // The link is only ever shown to the issuer. Returning it to a payer
      // would be harmless (they can already pay) but returning it to anyone
      // else would turn a list endpoint into a token leak.
      payLink: invoice.issuerPartyId === viewerPartyId && invoice.payToken ? this.payLink(invoice) : null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
    };
  }

  private payLink(invoice: Invoice): string {
    const base = this.config.get<string>('PUBLIC_APP_URL', { infer: true }) ?? 'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/pay/${invoice.payToken}`;
  }
}
