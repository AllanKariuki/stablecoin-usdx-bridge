import { Module, OnModuleInit } from '@nestjs/common';
import { StubRail } from '../rails/stub.rail';
import { IntentsController } from './intents.controller';
import { IntentsRepository } from './intents.repository';
import { IntentsService } from './intents.service';
import { SettlementService } from './settlement.service';

@Module({
  controllers: [IntentsController],
  providers: [IntentsRepository, IntentsService, SettlementService],
  exports: [IntentsRepository, IntentsService, SettlementService],
})
export class IntentsModule implements OnModuleInit {
  constructor(
    private readonly stub: StubRail,
    private readonly settlement: SettlementService,
  ) {}

  /**
   * Wires the stub rail's simulated callback to the real settlement path.
   *
   * Done here rather than by injecting SettlementService into StubRail
   * because SettlementService depends (transitively) on the rail registry,
   * and the reverse injection would close a cycle Nest refuses to resolve.
   * A property set at init is the smallest thing that breaks it.
   */
  onModuleInit(): void {
    this.stub.onCallback = (callback) => this.settlement.onRailCallback(this.stub.name, callback);
  }
}
