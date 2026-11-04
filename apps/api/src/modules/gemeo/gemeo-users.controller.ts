import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { type UserLookupInput, userLookupSchema } from '@sondohub/contracts';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { GemeoApiKeyGuard } from './gemeo-api-key.guard.js';
import { GemeoUsersRepository } from './gemeo-users.repository.js';

// POST, e não GET ?ids=: a lista vai no corpo, validada pelo mesmo pipe, sem limite de URL.
@Controller('gemeo/users')
@UseGuards(GemeoApiKeyGuard)
export class GemeoUsersController {
  constructor(private readonly users: GemeoUsersRepository) {}

  @Post('lookup')
  @HttpCode(200)
  lookup(
    @Body(new ZodValidationPipe(userLookupSchema)) { ids }: UserLookupInput,
  ) {
    return this.users.findProfiles(ids);
  }
}
