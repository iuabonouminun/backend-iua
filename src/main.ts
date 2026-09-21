/**
 * Point d'entrée de l'application NestJS — Backend Enseignant
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Préfixe global pour toutes les routes
  app.setGlobalPrefix('api');

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuration CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`Application démarrée sur le port ${port}`);
}

bootstrap();
