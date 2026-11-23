import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { MoneyMovementController } from './money-movement.controller';

@Module({
  imports: [WalletsModule],
  controllers: [MoneyMovementController],
})
export class MoneyMovementModule {}
