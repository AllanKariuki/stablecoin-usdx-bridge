import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

// @Global since every repository needs it and it's stateless-per-request
// (one shared pool) — same reasoning bff's CoreLedgerModule uses.
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
