import './module-paths';
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3020', credentials: true });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4020);
  await app.listen(port);
  console.log(`ANANDA Agents API on :${port}`);
}
bootstrap();
