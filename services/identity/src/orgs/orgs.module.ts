import { Module } from '@nestjs/common';
import { OrgsRepository } from './orgs.repository';

@Module({
  providers: [OrgsRepository],
  exports: [OrgsRepository],
})
export class OrgsModule {}
