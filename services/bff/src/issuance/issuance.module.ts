import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { IssuanceController } from './issuance.controller';

@Module({
  imports: [WalletsModule],
  controllers: [IssuanceController],
})
export class IssuanceModule {}
