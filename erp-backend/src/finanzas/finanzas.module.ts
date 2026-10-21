import { Module } from '@nestjs/common';
import { TributarioModule } from '../tributario/tributario.module';
import { FinanzasController } from './finanzas.controller';
import { FinanzasService } from './finanzas.service';

@Module({
  imports: [TributarioModule],
  controllers: [FinanzasController],
  providers: [FinanzasService],
})
export class FinanzasModule {}
