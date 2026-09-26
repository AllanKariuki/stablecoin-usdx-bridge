import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrgsModule } from '../orgs/orgs.module';
import { PartiesModule } from '../parties/parties.module';
import { InternalPartiesController } from './internal.controller';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [PartiesModule, OrgsModule, MembershipsModule],
  controllers: [InternalPartiesController],
  providers: [ProvisioningService],
})
export class ProvisioningModule {}
