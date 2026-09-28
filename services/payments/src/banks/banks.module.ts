import { Global, Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { BanksRepository } from './banks.repository';

// @Global because IntentsService and SettlementService both need the
// repository and neither is in this module's import graph.
@Global()
@Module({
  controllers: [BanksController],
  providers: [BanksRepository],
  exports: [BanksRepository],
})
export class BanksModule {}
