import { Module } from '@nestjs/common';
import { OfertasController } from './ofertas.controller';
import { OfertasService } from './ofertas.service';

@Module({
  controllers: [OfertasController],
  providers: [OfertasService],
  exports: [OfertasService],
})
export class OfertasModule {}
