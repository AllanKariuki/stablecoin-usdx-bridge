import { Global, Module } from '@nestjs/common';
import { MpesaRail } from './mpesa.rail';
import { RailRegistry } from './rail.registry';
import { StubRail } from './stub.rail';

@Global()
@Module({
  providers: [StubRail, MpesaRail, RailRegistry],
  exports: [StubRail, MpesaRail, RailRegistry],
})
export class RailsModule {}
