import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaExceptionFilter } from './utils/prisma-exception.filter';

/** Configuración compartida por main.ts y las pruebas de integración. Devuelve si es producción. */
export function configurarApp(app: NestExpressApplication): boolean {
  // Los XML de DTE recibidos llegan en el cuerpo JSON; el tope real lo fija cada DTO.
  app.useBodyParser('json', { limit: '1mb' });

  // CORS: en producción solo los orígenes declarados (lista separada por comas).
  const produccion = process.env.NODE_ENV === 'production';
  const origenes = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (produccion && (origenes.length === 0 || origenes.includes('*'))) {
    throw new Error('Configure CORS_ORIGIN con los orígenes permitidos en producción.');
  }
  app.enableCors({
    origin: origenes.length === 0 || origenes.includes('*') ? '*' : origenes,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  // Validación global
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));

  return produccion;
}
