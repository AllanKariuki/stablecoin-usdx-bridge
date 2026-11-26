import { Module } from '@nestjs/common';
import { KycGate } from '@damp/nest-platform';
import { WalletsModule } from '../wallets/wallets.module';
import { MoneyMovementController } from './money-movement.controller';

@Module({
  imports: [WalletsModule],
  controllers: [MoneyMovementController],
  providers: [KycGate],
})
export class MoneyMovementModule {}
