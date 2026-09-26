import { Module } from '@nestjs/common';
import { PartiesController } from './parties.controller';
import { PartiesRepository } from './parties.repository';

@Module({
  controllers: [PartiesController],
  providers: [PartiesRepository],
  exports: [PartiesRepository],
})
export class PartiesModule {}
