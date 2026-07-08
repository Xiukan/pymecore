import { Module } from '@nestjs/common';
import { GuiasDespachoController } from './guias-despacho.controller';
import { GuiasDespachoService } from './guias-despacho.service';

@Module({
  controllers: [GuiasDespachoController],
  providers: [GuiasDespachoService],
})
export class GuiasDespachoModule {}
