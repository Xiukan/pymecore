import { Module } from '@nestjs/common';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';
import { DteRecibidosService } from './dte-recibidos.service';

@Module({
  controllers: [ComprasController],
  providers: [ComprasService, DteRecibidosService],
})
export class ComprasModule {}
