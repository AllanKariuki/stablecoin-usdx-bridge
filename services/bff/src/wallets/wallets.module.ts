import { Module } from '@nestjs/common';
import { CurrenciesController } from './currencies.controller';
import { WalletsController } from './wallets.controller';
import { WalletOwnership } from './wallet-ownership.service';
import { WalletsService } from './wallets.service';

@Module({
  controllers: [WalletsController, CurrenciesController],
  providers: [WalletsService, WalletOwnership],
  exports: [WalletsService, WalletOwnership],
})
export class WalletsModule {}
