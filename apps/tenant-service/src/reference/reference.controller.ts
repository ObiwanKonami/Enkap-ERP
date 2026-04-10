import { Controller, Get, Param, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TR_CITIES, TR_DISTRICTS } from '../provisioning/tr-geo.data';

@ApiTags('Reference')
@Controller('reference')
export class ReferenceController {
  @Get('cities')
  @ApiOperation({ summary: 'Türkiye il listesi (81 il)' })
  getCities() {
    return TR_CITIES.map((c) => ({
      id:        c.id,
      name:      c.name,
      plateCode: c.plateCode,
    }));
  }

  @Get('cities/:id/districts')
  @ApiOperation({ summary: 'İle ait ilçe listesi' })
  getDistricts(@Param('id', ParseIntPipe) id: number) {
    const city = TR_CITIES.find((c) => c.id === id);
    if (!city) {
      throw new NotFoundException(`İl bulunamadı: ${id}`);
    }
    return TR_DISTRICTS
      .filter((d) => d.cityId === id)
      .map((d) => ({ name: d.name }));
  }
}
