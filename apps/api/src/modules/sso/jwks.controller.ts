import { Controller, Get } from '@nestjs/common';
import { TokenService } from './token.service.js';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokens: TokenService) {}

  @Get('jwks.json')
  getJwks() {
    return this.tokens.getJwks();
  }
}
