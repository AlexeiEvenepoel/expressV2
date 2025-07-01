import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketWorkerService } from './tickets.worker';
import { TicketsGateway } from './tickets.gateway';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [TicketsController],
  providers: [TicketsService, TicketWorkerService, TicketsGateway],
  exports: [TicketsService, TicketWorkerService],
})
export class TicketsModule {}
