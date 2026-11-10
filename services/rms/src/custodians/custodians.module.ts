import { Module } from '@nestjs/common';
import { CustodiansController } from './custodians.controller';
import { CustodiansRepository } from './custodians.repository';
import { CustodiansService } from './custodians.service';

@Module({
  controllers: [CustodiansController],
  providers: [CustodiansRepository, CustodiansService],
  exports: [CustodiansRepository, CustodiansService],
})
export class CustodiansModule {}
