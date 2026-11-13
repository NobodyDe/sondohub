import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminUsersQuery,
  adminUsersQuerySchema,
  type AppAccessInput,
  appAccessSchema,
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '@sondohub/contracts';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { AdminUsersService } from './admin-users.service.js';
import { UsersRepository } from './users.repository.js';

@Controller('admin/users')
@UseGuards(SessionGuard, MasterGuard)
export class AdminUsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly admin: AdminUsersService,
  ) {}

  /** Uma página de usuários (cursor), com cargo, status e apps liberados. Filtro e busca no banco. */
  @Get()
  list(
    @Query(new ZodValidationPipe(adminUsersQuerySchema)) query: AdminUsersQuery,
  ) {
    return this.users.listPage(query);
  }

  /** Totais por cargo. Fica antes de :id, senão "summary" cairia no ParseUUIDPipe. */
  @Get('summary')
  summary() {
    return this.users.summary();
  }

  /** Cria o usuário com senha, cargo e apps. */
  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput) {
    return this.admin.create(body);
  }

  /** Um usuário, com todos os apps e o acesso dele em cada um. */
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getDetail(id);
  }

  /** Troca cargo e/ou ativo. */
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.admin.update(auth.user.id, id, body);
  }

  /** Libera o app ou troca o nível. */
  @Put(':id/apps/:slug')
  setAppLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(appAccessSchema)) body: AppAccessInput,
  ) {
    return this.admin.setAppLevel(id, slug, body.level);
  }

  /** Tira o acesso ao app. */
  @Delete(':id/apps/:slug')
  removeApp(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slug') slug: string,
  ) {
    return this.admin.removeApp(id, slug);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.remove(auth.user.id, id);
  }
}
