import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ControlPlaneHealthModule, MetricsMiddleware } from '@enkap/health';
import { ProvisioningModule }  from './provisioning/provisioning.module';
import { TenantProfileModule } from './profile/tenant-profile.module';
import { OnboardingModule }    from './onboarding/onboarding.module';
import { WhiteLabelModule }    from './white-label/white-label.module';
import { AdminModule }         from './admin/admin.module';
import { ReferenceModule }     from './reference/reference.module';

// Not: ProvisioningModule 'control_plane' DataSource'u ilk olarak kayıt eder.
// Diğer modüller buna bağımlı olduğundan ProvisioningModule'den sonra import edilir.
@Module({
  imports: [
    ProvisioningModule,
    TenantProfileModule,
    OnboardingModule,
    WhiteLabelModule,
    AdminModule,
    ReferenceModule,
    ControlPlaneHealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
