import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [WalletsModule, TransactionsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
