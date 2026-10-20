import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './utils/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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

  // Swagger solo fuera de producción (o si se pide explícitamente).
  if (!produccion || process.env.SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('PYMECORE API')
      .setDescription('Backend ERP para pymes — NestJS + Prisma + PostgreSQL')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(process.env.APP_PORT ?? 3000);
  console.log(`App corriendo en http://localhost:${process.env.APP_PORT ?? 3000}`);
  if (!produccion || process.env.SWAGGER === 'true') {
    console.log(`Swagger en   http://localhost:${process.env.APP_PORT ?? 3000}/api-docs`);
  }
}
bootstrap();
