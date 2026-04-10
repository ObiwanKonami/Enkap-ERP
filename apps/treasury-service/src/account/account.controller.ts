import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TenantGuard } from '@enkap/database';
import { AccountService }     from './account.service';
import { TransactionService } from '../transaction/transaction.service';
import { CreateAccountDto }   from './dto/create-account.dto';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';

@ApiTags('accounts')
@ApiBearerAuth('JWT')
@UseGuards(TenantGuard)
@Controller('accounts')
export class AccountController {
  constructor(
    private readonly accountService:     AccountService,
    private readonly transactionService: TransactionService,
  ) {}

  @ApiOperation({ summary: 'Yeni kasa/banka hesabı oluştur' })
  @ApiResponse({ status: 201, description: 'Hesap oluşturuldu' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAccountDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    return this.accountService.create(dto, req.user?.sub ?? '00000000-0000-0000-0000-000000000000');
  }

  @ApiOperation({ summary: 'Hesapları listele (sayfalanabilir)' })
  @ApiResponse({ status: 200, description: 'Aktif hesap listesi' })
  @ApiQuery({ name: 'page',  required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @Get()
  findAll(
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.findAll(
      page  ? parseInt(page,  10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @ApiOperation({ summary: 'Hesap detayı ve güncel bakiye' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountService.findOne(id);
  }

  @ApiOperation({ summary: 'Hesabı deaktive et' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204 })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.accountService.deactivate(id);
  }

  @ApiOperation({ summary: 'Para birimi bazında toplam bakiyeler' })
  @Get('summary/balances')
  getTotalBalances() {
    return this.accountService.getTotalBalances();
  }

  // ─── Hesap Hareketleri ───────────────────────────────────────────────────

  @ApiOperation({ summary: 'Hesaba yeni hareket ekle' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Hareket kaydedildi' })
  @Post(':id/transactions')
  @HttpCode(HttpStatus.CREATED)
  createTransaction(
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateTransactionDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    return this.transactionService.create(accountId, dto, req.user?.sub ?? '00000000-0000-0000-0000-000000000000');
  }

  @ApiOperation({ summary: 'Hesap hareket listesi' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  @ApiQuery({ name: 'offset',   required: false, type: Number })
  @ApiQuery({ name: 'fromDate', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'toDate',   required: false, type: String, description: 'YYYY-MM-DD' })
  @Get(':id/transactions')
  listTransactions(
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query('limit')    limit?: string,
    @Query('offset')   offset?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate')   toDate?: string,
  ) {
    return this.transactionService.listByAccount(accountId, {
      limit:    limit    ? parseInt(limit,  10) : undefined,
      offset:   offset   ? parseInt(offset, 10) : undefined,
      fromDate,
      toDate,
    });
  }
}
