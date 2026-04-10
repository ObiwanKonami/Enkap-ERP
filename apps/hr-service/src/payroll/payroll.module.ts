import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerModule } from '@enkap/mailer';
import { Payroll } from './entities/payroll.entity';
import { Employee } from '../employee/entities/employee.entity';
import { PayrollController } from './payroll.controller';
import { FiscalParamsController } from './fiscal-params.controller';
import { PayrollService } from './payroll.service';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { FiscalParamsService } from './fiscal-params.service';
import { PayslipBuilderService } from './payslip-builder.service';
import { EmployeeModule } from '../employee/employee.module';
import { HrEventsPublisher } from '../events/hr-events.publisher';

@Module({
  imports: [TypeOrmModule.forFeature([Payroll, Employee]), EmployeeModule, MailerModule],
  controllers: [PayrollController, FiscalParamsController],
  providers: [
    PayrollService,
    PayrollCalculatorService,
    FiscalParamsService,
    PayslipBuilderService,
    HrEventsPublisher,
  ],
  exports: [FiscalParamsService],
})
export class PayrollModule {}
