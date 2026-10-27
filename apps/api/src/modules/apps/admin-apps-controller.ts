import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateAppInput,
  createAppSchema,
  type UpdateAppInput,
  updateAppSchema,
} from '@sondohub/contracts';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { AdminAppsService } from './admin-apps.service.js';
import { AppsRepository } from './apps.repository.js';

@Controller('admin/apps')
@UseGuards(SessionGuard, MasterGuard)
export class AdminAppsController {
  constructor(
    private readonly apps: AppsRepository,
    private readonly admin: AdminAppsService,
  ) {}

  /** O catálogo inteiro, com quantas pessoas têm acesso a cada app. */
  @Get()
  list() {
    return this.apps.listAdmin();
  }

  /** Cadastra o app. Origem e ícone padrão saem da URL. */
  @Post()
  create(@Body(new ZodValidationPipe(createAppSchema)) body: CreateAppInput) {
    return this.admin.create(body);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getDetail(id);
  }

  /** Grava o app inteiro (menos o slug). */
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAppSchema)) body: UpdateAppInput,
  ) {
    return this.admin.update(id, body);
  }
}
