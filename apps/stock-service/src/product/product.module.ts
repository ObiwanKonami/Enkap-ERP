import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';

@Module({
  imports:     [TenantModule],
  providers:   [ProductService],
  controllers: [ProductController],
  exports:     [ProductService],
})
export class ProductModule {}
