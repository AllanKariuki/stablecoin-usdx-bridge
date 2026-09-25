import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PartiesRepository } from './parties.repository';
import { Party } from './party.types';

@Controller('parties')
export class PartiesController {
  constructor(private readonly parties: PartiesRepository) {}

  @Get(':id')
  async get(@Param('id') id: string): Promise<Party> {
    const party = await this.parties.findById(id);
    if (!party) {
      throw new NotFoundException(`no party ${id}`);
    }
    return party;
  }
}
