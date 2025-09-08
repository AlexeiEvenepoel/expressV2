import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketWorkerService } from './tickets.worker';
import { TicketsGateway } from './tickets.gateway';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [TicketsController, ScheduleController],
  providers: [
    TicketsService,
    TicketWorkerService,
    TicketsGateway,
    ScheduleService,
  ],
  exports: [TicketsService, TicketWorkerService, ScheduleService],
})
export class TicketsModule {}
