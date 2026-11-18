import { Module } from '@nestjs/common';
import { CampoController } from './campo.controller';
import { CampoService } from './campo.service';

@Module({
  controllers: [CampoController],
  providers: [CampoService],
})
export class CampoModule {}
