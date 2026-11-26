import { Module } from '@nestjs/common';
import { KycGate } from '@damp/nest-platform';
import { WalletsModule } from '../wallets/wallets.module';
import { IssuanceController } from './issuance.controller';

@Module({
  imports: [WalletsModule],
  controllers: [IssuanceController],
  providers: [KycGate],
})
export class IssuanceModule {}
