import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';
import { AppsRepository } from './modules/apps/apps.repository.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// Em produção a requisição passa por 2 nginx antes de chegar aqui. Sem isso, o req.ip
// (gravado na sessão, em "Dispositivos conectados") seria o IP do proxy, não o do usuário.
// Só endereços internos (127.x, 10.x, 172.16-31.x, 192.168.x) são tratados como proxy.
app.set('trust proxy', 'loopback, uniquelocal');
app.setGlobalPrefix('api');
app.use(helmet());
app.use(cookieParser());

app.enableCors({
  origin: await app.get(AppsRepository).listOrigins(),
  credentials: true,
});
app.enableShutdownHooks();
await app.listen(env.API_PORT);
