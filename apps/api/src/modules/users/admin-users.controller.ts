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
  UseGuards,
} from '@nestjs/common';
import {
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

  /** Todos os usuários, com cargo, status e apps liberados. */
  @Get()
  list() {
    return this.users.listAll();
  }

  /** Cria o usuário com cargo e apps. Sem senha: ela é definida pelo convite. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ) {
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
