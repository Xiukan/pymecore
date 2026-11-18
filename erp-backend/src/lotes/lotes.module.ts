import { Module } from '@nestjs/common';
import { InventarioController, LotesController } from './lotes.controller';
import { LotesService } from './lotes.service';

@Module({
  controllers: [LotesController, InventarioController],
  providers: [LotesService],
})
export class LotesModule {}
