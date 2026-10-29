import { Module } from '@nestjs/common';
import { NubeController } from './nube.controller';
import { NubeService } from './nube.service';
import { TenantGuard } from './tenant.guard';

@Module({
  controllers: [NubeController],
  providers: [NubeService, TenantGuard],
})
export class NubeModule {}
