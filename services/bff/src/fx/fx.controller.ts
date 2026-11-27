import { Body, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycGate } from '@damp/nest-platform';
import type { Response } from 'express-serve-static-core';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { requireIdempotencyKey } from '../money-movement/money-movement.controller';
import { TransactionPage } from '../transactions/transactions.service';
import { FxService } from './fx.service';
import { ConversionResultView, QuotePreviewView } from './fx.types';

interface QuoteBody {
  fromWalletId: string;
  toWalletId?: string;
  toCurrency?: string;
  amount: string;
  amountSide?: string;
}

interface ConvertBody {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  quoteId?: string;
}

/**
 * The customer-facing quote and conversion routes (slice 4b). The caller
 * is always the auth context — never a body field — and every wallet named
 * in a request is ownership-checked in FxService before any other service
 * hears about it.
 *
 * Idempotency-Key is mandatory on POST /conversions, exactly like every
 * other money-moving write (see MoneyMovementController's note on why bff
 * never generates one on a missing header).
 */
@Controller()
export class FxController {
  private readonly minTier: string;

  constructor(
    private readonly fx: FxService,
    private readonly kycGate: KycGate,
    config: ConfigService,
  ) {
    this.minTier = config.get<string>('KYC_MIN_TIER_ISSUANCE', { infer: true }) ?? 'TIER_1';
  }

  @Post('quotes')
  quote(@Body() body: QuoteBody, @CurrentUser() auth: AuthContext): Promise<QuotePreviewView> {
    return this.fx.quote(auth, body);
  }

  @Post('conversions')
  async convert(
    @Body() body: ConvertBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversionResultView> {
    requireIdempotencyKey(idempotencyKey);
    // KYC gating identical to POST /transfers: the caller's tier gates
    // every money movement, before the ownership reads and before any
    // core-ledger call. Quoting is deliberately not gated — a preview
    // moves nothing.
    await this.kycGate.require(auth.userId, this.minTier);
    const result = await this.fx.convert(auth, body, idempotencyKey);
    // FX books a journal entry synchronously (201, like core-ledger's
    // /fx/conversions); the peg routes accept a saga the way POST
    // /issuances and /redemptions do (202 — the mint/burn is not final).
    res.status(result.route === 'FX' ? 201 : 202);
    return result;
  }

  @Get('conversions')
  list(
    @CurrentUser() auth: AuthContext,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<TransactionPage> {
    return this.fx.listConversions(auth.userId, cursor, limit ? Number(limit) : undefined);
  }
}
