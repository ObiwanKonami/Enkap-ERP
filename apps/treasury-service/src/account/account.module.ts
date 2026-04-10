import { Module }         from '@nestjs/common';
import { TenantModule }   from '@enkap/database';
import { AccountService }     from './account.service';
import { AccountController }  from './account.controller';
import { TransactionService }       from '../transaction/transaction.service';
import { TreasuryEventsPublisher }  from '../events/treasury-events.publisher';

@Module({
  imports:     [TenantModule],
  controllers: [AccountController],
  providers:   [AccountService, TransactionService, TreasuryEventsPublisher],
  exports:     [AccountService, TransactionService],
})
export class AccountModule {}
