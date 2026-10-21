import { Module } from '@nestjs/common';
import { PreciosController } from './precios.controller';

@Module({ controllers: [PreciosController] })
export class PreciosModule {}
