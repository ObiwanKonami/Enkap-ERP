import { Controller, Get, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantGuard } from '@enkap/database';
import { MrpService } from './mrp.service';

@ApiTags('MRP')
@ApiBearerAuth()
@Controller('mrp')
@UseGuards(TenantGuard)
export class MrpController {
  constructor(private readonly mrpService: MrpService) {}

  /** Hammadde ihtiyaç hesabı */
  @Get('requirements')
  @ApiOperation({ summary: 'Reçeteye göre hammadde ihtiyacı hesapla' })
  @ApiQuery({ name: 'bomId',   description: 'Reçete UUID', required: true })
  @ApiQuery({ name: 'quantity', description: 'Üretilecek miktar', type: Number, required: true })
  calculateRequirements(
    @Query('bomId', ParseUUIDPipe) bomId: string,
    @Query('quantity') quantity: string,
  ) {
    return this.mrpService.calculateRequirements(bomId, Number(quantity));
  }
}
