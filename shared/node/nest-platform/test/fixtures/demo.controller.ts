import { Controller, Get, HttpStatus, NotFoundException } from '@nestjs/common';
import { PlatformException } from '../../src/errors/platform.exception';

@Controller()
export class DemoController {
  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }

  /** Exercises PlatformException's custom `code` reaching the envelope. */
  @Get('boom')
  boom(): never {
    throw new PlatformException(HttpStatus.CONFLICT, 'ACCOUNT_FROZEN', 'wallet is frozen');
  }

  /** Exercises a built-in Nest exception falling back to the generic mapping. */
  @Get('missing')
  missing(): never {
    throw new NotFoundException('wallet not found');
  }

  /** Exercises the default branch: a non-HttpException thrown value. */
  @Get('crash')
  crash(): never {
    throw new Error('unexpected failure');
  }
}
