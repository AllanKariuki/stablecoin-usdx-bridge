import { Module } from '@nestjs/common';
import { MoneyMovementController } from './money-movement.controller';

@Module({
  controllers: [MoneyMovementController],
})
export class MoneyMovementModule {}
