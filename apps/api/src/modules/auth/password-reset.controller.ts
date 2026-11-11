import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type VerifyResetCodeInput,
} from '@sondohub/contracts';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { PasswordResetService } from './password-reset.service.js';

@Controller('auth/password-reset')
@UseGuards(ThrottlerGuard) // limite por IP, definido no AuthModule
export class PasswordResetController {
  constructor(private readonly reset: PasswordResetService) {}

  @Post('request')
  @HttpCode(204)
  async request(
    @Body(new ZodValidationPipe(requestPasswordResetSchema))
    body: RequestPasswordResetInput,
  ) {
    await this.reset.request(body.email);
  }

  @Post('verify')
  @HttpCode(204)
  async verify(
    @Body(new ZodValidationPipe(verifyResetCodeSchema))
    body: VerifyResetCodeInput,
  ) {
    await this.reset.verify(body);
  }

  @Post('confirm')
  @HttpCode(204)
  async confirm(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ) {
    await this.reset.confirm(body);
  }
}
