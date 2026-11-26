import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletOwnership } from './wallet-ownership.service';
import { WalletsService } from './wallets.service';

@Module({
  controllers: [WalletsController],
  providers: [WalletsService, WalletOwnership],
  exports: [WalletsService, WalletOwnership],
})
export class WalletsModule {}
