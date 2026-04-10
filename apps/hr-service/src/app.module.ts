import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule }  from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule, AuditModule, TenantContextMiddleware } from '@enkap/database';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { EmployeeModule }    from './employee/employee.module';
import { PayrollModule }     from './payroll/payroll.module';
import { LeaveModule }       from './leave/leave.module';
import { SgkModule }         from './sgk/sgk.module';
import { ExpenseModule }     from './expense/expense.module';
import { AdvanceModule }     from './advance/advance.module';
import { AttendanceModule }  from './attendance/attendance.module';
import { OvertimeModule }    from './overtime/overtime.module';
import { AssetModule }       from './asset/asset.module';
import { TerminationModule } from './termination/termination.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Varsayılan DataSource: @InjectRepository için (leave entity'leri)
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: 'public',
      entities: [],
      autoLoadEntities: true,
      // Tenant entity'leri her zaman migration ile yönetilir — asla synchronize
      synchronize: false,
      ssl: false,
      applicationName: 'enkap_hr_service',
    }),

    // TenantRoutingService için control_plane DataSource
    TypeOrmModule.forRoot({
      name: 'control_plane',
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: 'public',
      entities: [],
      synchronize: false,
      ssl: false,
      applicationName: 'enkap_hr_service_cp',
    }),

    TenantModule,
    AuditModule,
    EmployeeModule,
    PayrollModule,
    LeaveModule,
    SgkModule,
    ExpenseModule,
    AdvanceModule,
    AttendanceModule,
    OvertimeModule,
    AssetModule,
    TerminationModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
