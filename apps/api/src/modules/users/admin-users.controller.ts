import { Controller, Get, UseGuards } from '@nestjs/common';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { UsersRepository } from './users.repository.js';

@Controller('admin/users')
@UseGuards(SessionGuard, MasterGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersRepository) {}

  /** Todos os usuários, com cargo, status e apps liberados. */
  @Get()
  list() {
    return this.users.listAll();
  }
}
