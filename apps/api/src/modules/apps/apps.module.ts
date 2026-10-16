import { Module } from '@nestjs/common';
import { AppsRepository } from './apps.repository.js';

@Module({ providers: [AppsRepository], exports: [AppsRepository] })
export class AppsModule {}
