import { IsUUID, IsIn, IsString, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApplicationResponseDto {
  @ApiProperty({ description: 'Yanıt verilecek fatura UUID', format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ enum: ['KABUL', 'RED'], description: 'Yanıt türü' })
  @IsIn(['KABUL', 'RED'])
  responseType!: 'KABUL' | 'RED';

  @ApiPropertyOptional({ description: 'Red gerekçesi (responseType=RED ise zorunlu)' })
  @ValidateIf((o: CreateApplicationResponseDto) => o.responseType === 'RED')
  @IsString()
  rejectionReason?: string;
}

export class ApplicationResponseResultDto {
  success!: boolean;
  applicationResponseId?: string;
  envelopeId?: string;
  error?: string;
  /** 8 günlük süre ihlali ise true */
  deadlineExceeded?: boolean;
}
