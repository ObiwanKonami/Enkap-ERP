import { Module } from '@nestjs/common';
import { JournalEntryController } from './journal-entry.controller';
import { JournalEntryService }    from './journal-entry.service';

@Module({
  controllers: [JournalEntryController],
  providers:   [JournalEntryService],
  exports:     [JournalEntryService],
})
export class JournalEntryModule {}
