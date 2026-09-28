import { Module } from '@nestjs/common';
import { AttestationsController } from './attestations.controller';

@Module({
  controllers: [AttestationsController],
})
export class AttestationsModule {}
