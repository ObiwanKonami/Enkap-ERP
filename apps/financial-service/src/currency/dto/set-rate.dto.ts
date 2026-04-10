import { IsIn, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Manuel kur girişi DTO */
export class SetRateDto {
  @ApiProperty({
    description: 'Para birimi kodu (TRY hariç)',
    enum: ['USD', 'EUR', 'GBP', 'SAR', 'AED'],
    example: 'USD',
  })
  @IsIn(['USD', 'EUR', 'GBP', 'SAR', 'AED'])
  currency!: 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED';

  @ApiProperty({
    description: 'Alış kuru (1 birim yabancı para = N TRY)',
    example: 32.5,
    minimum: 0.0001,
  })
  @IsNumber()
  @Min(0.0001)
  buyRate!: number;

  @ApiProperty({
    description: 'Satış kuru (1 birim yabancı para = N TRY)',
    example: 32.6,
    minimum: 0.0001,
  })
  @IsNumber()
  @Min(0.0001)
  sellRate!: number;

  @ApiProperty({
    description: 'Kur tarihi (yyyy-MM-dd formatı)',
    example: '2026-03-20',
  })
  @IsDateString()
  date!: string;
}
