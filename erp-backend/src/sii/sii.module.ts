import { Module } from '@nestjs/common';
import { SiiIntegrationService } from './sii-integration.service';

@Module({
  providers: [SiiIntegrationService],
  exports: [SiiIntegrationService],
})
export class SiiModule {}
