import { Module } from '@nestjs/common';
import { KycGate } from '@damp/nest-platform';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { PricingClient } from './pricing.client';

@Module({
  imports: [WalletsModule, TransactionsModule],
  controllers: [FxController],
  providers: [FxService, PricingClient, KycGate],
})
export class FxModule {}
