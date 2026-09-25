import { Module } from '@nestjs/common';
import { MembershipsRepository } from './memberships.repository';

@Module({
  providers: [MembershipsRepository],
  exports: [MembershipsRepository],
})
export class MembershipsModule {}
