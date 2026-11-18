import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const produccion = configurarApp(app);

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
