import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { AttestationsModule } from './attestations/attestations.module';
import { RmsConfig } from './config/rms-config';
import { CoreLedgerModule } from './core-ledger/core-ledger.module';
import { CustodiansModule } from './custodians/custodians.module';
import { DbModule } from './db/db.module';
import { ReservesModule } from './reserves/reserves.module';

/**
 * A factory function, not a plain `@Module`-decorated class — same reason
 * as bff's and identity's: PlatformConfigModule.forRoot() reads process.env
 * synchronously at evaluation time, which for a decorator's arguments means
 * class-definition time. Calling createAppModule() from inside main() (or a
 * test's bootstrap fixture) defers that read to exactly the right moment.
 */
export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: RmsConfig }),
      PlatformModule.forRoot({ service: 'rms', version, commit }),
      DbModule,
      CoreLedgerModule,
      CustodiansModule,
      ReservesModule,
      AttestationsModule,
    ],
  };
}

@Module({})
export class AppModule {}
