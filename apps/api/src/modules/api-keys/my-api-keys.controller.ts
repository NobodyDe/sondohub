import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateApiKeyInput,
  createApiKeySchema,
} from '@sondohub/contracts';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { ApiKeysService } from './api-keys.service.js';

/** As chaves de API da tela Desenvolvedor. Cada pessoa só vê e remove as próprias. */
@Controller('me/api-keys')
@UseGuards(SessionGuard)
export class MyApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.apiKeys.listOwn(auth.user.id);
  }

  /** Devolve o segredo inteiro uma única vez; depois disso só existe o hash. */
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    return this.apiKeys.create(auth.user, body);
  }

  /** Remover = revogar: a chave para de valer na hora e o registro fica. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeys.revokeOwn(auth.user.id, id);
  }
}
