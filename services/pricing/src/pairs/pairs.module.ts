import { Module } from '@nestjs/common';
import { PairsController } from './pairs.controller';
import { PairsRepository } from './pairs.repository';

@Module({
  controllers: [PairsController],
  providers: [PairsRepository],
  exports: [PairsRepository],
})
export class PairsModule {}
