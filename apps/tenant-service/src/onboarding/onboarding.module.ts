import { Module }     from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@enkap/mailer';
import { OnboardingService }       from './onboarding.service';
import { OnboardingController }    from './onboarding.controller';
import { TenantProfileModule }     from '../profile/tenant-profile.module';
import { ProvisioningModule }      from '../provisioning/provisioning.module';
import { BillingEventsPublisher }  from '../events/billing-events.publisher';

@Module({
  imports: [
    ConfigModule,
    MailerModule,
    HttpModule.register({
      timeout:      30_000,
      maxRedirects: 3,
    }),
    TenantProfileModule,
    ProvisioningModule,
  ],
  controllers: [OnboardingController],
  providers:   [OnboardingService, BillingEventsPublisher],
})
export class OnboardingModule {}
