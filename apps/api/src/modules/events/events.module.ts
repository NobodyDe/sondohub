import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AppEventsController } from './app-events.controller.js';
import { AppEventsService } from './app-events.service.js';

@Module({
  imports: [SessionsModule], // o SessionGuard precisa do SessionsService.
  controllers: [AppEventsController],
  providers: [AppEventsService],
  exports: [AppEventsService],
})
export class EventsModule {}
