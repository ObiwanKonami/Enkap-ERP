import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { AccountService } from './account.service';

@ApiTags('accounts')
@ApiBearerAuth('JWT')
@Controller('accounts')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  /**
   * Mizan raporu.
   * ?start=2026-01-01&end=2026-03-31
   */
  @ApiOperation({ summary: 'Mizan raporu', description: 'Belirtilen dönem için hesap mizan raporunu getirir. Tüm hesapların borç/alacak/net bakiye özetini içerir' })
  @ApiQuery({ name: 'start', required: true, description: 'Dönem başlangıç tarihi (ISO 8601)', example: '2026-01-01' })
  @ApiQuery({ name: 'end', required: true, description: 'Dönem bitiş tarihi (ISO 8601)', example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('mizan')
  async getMizan(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const mizan = await this.accountService.getMizan(
      new Date(start),
      new Date(end),
    );
    return {
      ...mizan,
      rows: mizan.rows.map((r) => ({
        ...r,
        totalDebit: r.totalDebit.toDecimal(),
        totalCredit: r.totalCredit.toDecimal(),
        netBalance: r.netBalance.toDecimal(),
      })),
      totalDebit: mizan.totalDebit.toDecimal(),
      totalCredit: mizan.totalCredit.toDecimal(),
    };
  }

  /**
   * Bilanço.
   * ?asOf=2026-03-31
   */
  @ApiOperation({ summary: 'Bilanço', description: 'Belirtilen tarihe göre aktif ve pasif kalemlerini içeren bilanço raporunu getirir' })
  @ApiQuery({ name: 'asOf', required: true, description: 'Bilanço tarihi (ISO 8601)', example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('bilanco')
  async getBilanco(@Query('asOf') asOf: string) {
    const bilanco = await this.accountService.getBilanco(new Date(asOf));
    return {
      ...bilanco,
      aktif: bilanco.aktif.map((s) => ({
        ...s,
        accounts: s.accounts.map((a) => ({
          ...a,
          amount: a.amount.toDecimal(),
        })),
        total: s.total.toDecimal(),
      })),
      pasif: bilanco.pasif.map((s) => ({
        ...s,
        accounts: s.accounts.map((a) => ({
          ...a,
          amount: a.amount.toDecimal(),
        })),
        total: s.total.toDecimal(),
      })),
      aktifTotal: bilanco.aktifTotal.toDecimal(),
      pasifTotal: bilanco.pasifTotal.toDecimal(),
    };
  }
}
