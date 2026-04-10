import { Module }    from '@nestjs/common';
import { AdminTenantsController } from './admin-tenants.controller';

@Module({
  controllers: [AdminTenantsController],
})
export class AdminModule {}
