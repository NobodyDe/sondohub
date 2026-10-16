import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.use(helmet());
app.use(cookieParser());
app.enableShutdownHooks();
await app.listen(env.API_PORT);
