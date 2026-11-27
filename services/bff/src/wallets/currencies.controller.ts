import { Controller, Get } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CurrencyView } from './wallet.types';

/**
 * The supported-currency set (slice 4b), read straight from core-ledger's
 * chart — the same source of truth wallet creation validates against, so
 * the portal can never offer a currency the ledger would refuse. A read
 * route, so no ownership question arises; the gateway gates it on
 * wallets:read:own.
 */
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  list(): Promise<CurrencyView[]> {
    return this.wallets.listCurrencies();
  }
}
