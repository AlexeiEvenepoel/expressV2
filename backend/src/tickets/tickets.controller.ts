import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { RegisterTicketDto } from './dto/register-ticket.dto';
import { TicketResponse } from './interfaces/ticket-responde.interface';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('register')
  registerTicket(
    @Body() registerTicketDto: RegisterTicketDto,
  ): Promise<TicketResponse> {
    return this.ticketsService.registerTicket(registerTicketDto);
  }

  @Post('schedule/:userId')
  scheduleRegistration(
    @Param('userId', ParseIntPipe) userId: number,
    @Body('time') time?: string,
  ) {
    return this.ticketsService.scheduleTicketRegistration(userId, time);
  }

  @Post('manual/:userId')
  manualRegister(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<TicketResponse[]> {
    return this.ticketsService.manualRegister(userId);
  }

  @Delete('schedule/:userId')
  cancelSchedule(@Param('userId', ParseIntPipe) userId: number) {
    return this.ticketsService.cancelScheduledRegistration(userId);
  }
}
