import { Module } from '@nestjs/common';
import { CustodiansModule } from '../custodians/custodians.module';
import { ExposureController } from './exposure.controller';
import { ExposureLimitsRepository } from './exposure-limits.repository';
import { ExposureService } from './exposure.service';
import { TreasuryRebalancesRepository } from './treasury-rebalances.repository';

@Module({
  // CustodiansModule for the latest-statement reads the recon status is
  // built from; CoreLedgerClient comes from the @Global CoreLedgerModule.
  imports: [CustodiansModule],
  controllers: [ExposureController],
  providers: [ExposureService, ExposureLimitsRepository, TreasuryRebalancesRepository],
})
export class ExposureModule {}
