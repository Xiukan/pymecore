import { Module } from '@nestjs/common';
import { TributarioController } from './tributario.controller';
import { TributarioService } from './tributario.service';

@Module({
  controllers: [TributarioController],
  providers: [TributarioService],
})
export class TributarioModule {}
