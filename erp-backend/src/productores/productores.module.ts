import { Module } from '@nestjs/common';
import { ProductoresController } from './productores.controller';
import { ProductoresService } from './productores.service';

@Module({
  controllers: [ProductoresController],
  providers: [ProductoresService],
})
export class ProductoresModule {}
