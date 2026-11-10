import { Module } from '@nestjs/common';
import { ReserveTargetsRepository } from './reserve-targets.repository';
import { ReservesController } from './reserves.controller';

@Module({
  controllers: [ReservesController],
  providers: [ReserveTargetsRepository],
  exports: [ReserveTargetsRepository],
})
export class ReservesModule {}
