import { Module } from '@nestjs/common';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule }   from '@nestjs/config';
import { TenantModule }   from '@enkap/database';
import { MailerModule }   from '@enkap/mailer';
import { PaymentPlan }        from './entities/payment-plan.entity';
import { PaymentInstallment } from './entities/payment-installment.entity';
import { AgingService }           from './aging.service';
import { PaymentPlanService }     from './payment-plan.service';
import { ReminderService }        from './reminder.service';
import { ReconciliationService }  from './reconciliation.service';
import { ArApController }         from './ar-ap.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    TenantModule,
    MailerModule,
    // Tenant DataSource'dan alınan entity'ler burada TypeOrmModule ile kayıt edilir.
    // financial-service'in kendi DataSource'u tenant şemasına bağlı olduğundan
    // forFeature() burada tutulabilir — entity'ler migration V011 ile oluşturulur.
    TypeOrmModule.forFeature([PaymentPlan, PaymentInstallment]),
  ],
  controllers: [ArApController],
  providers:   [AgingService, PaymentPlanService, ReminderService, ReconciliationService],
  exports:     [AgingService, PaymentPlanService, ReconciliationService],
})
export class ArApModule {}
