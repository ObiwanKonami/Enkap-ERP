import {
  Controller, Post, Body, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray, IsDateString, IsNotEmpty, IsNumber, IsString,
  IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantGuard } from '@enkap/database';
import { JournalEntryService } from './journal-entry.service';

class JournalLineDto {
  @IsString()  @MaxLength(20)  accountCode!:  string;
  @IsString()  @MaxLength(300) description!:  string;
  @IsNumber()  @Min(0)         debitAmount!:  number;
  @IsNumber()  @Min(0)         creditAmount!: number;
}

class CreateJournalEntryDto {
  @IsDateString()              entryDate!:     string;
  @IsString() @MaxLength(300)  description!:   string;
  @IsString() @MaxLength(50)   referenceType!: string;
  @IsUUID()                    referenceId!:   string;
  @IsString() @IsNotEmpty()    createdBy!:     string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

@ApiTags('Yevmiye')
@ApiBearerAuth()
@Controller('journal-entries')
@UseGuards(TenantGuard)
export class JournalEntryController {
  constructor(private readonly service: JournalEntryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yevmiye kaydı oluştur (harici servisler için)' })
  create(@Body() dto: CreateJournalEntryDto): Promise<{ id: string; entryNumber: string }> {
    return this.service.create(dto);
  }
}
