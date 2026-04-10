import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhiteLabelConfig }     from './white-label-config.entity';
import { WhiteLabelService }    from './white-label.service';
import { WhiteLabelController } from './white-label.controller';

/**
 * White Label Modülü.
 *
 * ProvisioningModule 'control_plane' DataSource'u başlatmış olmalıdır —
 * AppModule'de ProvisioningModule'den sonra import edilir.
 *
 * JWT doğrulaması Kong seviyesinde yapılır; bu modülde Passport/JWT
 * bağımlılığı yoktur (diğer tenant-service controller'larıyla tutarlı).
 */
@Module({
  imports:     [TypeOrmModule.forFeature([WhiteLabelConfig], 'control_plane')],
  controllers: [WhiteLabelController],
  providers:   [WhiteLabelService],
  exports:     [WhiteLabelService],
})
export class WhiteLabelModule {}
