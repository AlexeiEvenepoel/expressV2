import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Delete,
  Get,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { RegisterTicketDto } from './dto/register-ticket.dto';
import { TicketResponse } from './interfaces/ticket-responde.interface';
import {
  BatchRegisterDto,
  ParallelRegisterDto,
} from './dto/batch-register.dto';

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

  // NUEVO: Registro paralelo ultra-rápido
  @Post('parallel/:userId')
  parallelRegister(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<TicketResponse[]> {
    return this.ticketsService.manualRegisterParallel(userId);
  }

  // NUEVO: Registro con sistema de carrera (devuelve el primer éxito)
  @Post('fast/:userId')
  fastRegister(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<TicketResponse> {
    return this.ticketsService.fastRegister(userId);
  }

  // NUEVO: Registro masivo para múltiples usuarios
  @Post('batch-register')
  batchRegister(
    @Body() batchDto: BatchRegisterDto,
  ): Promise<Record<number, TicketResponse>> {
    return this.ticketsService.batchRegister(batchDto.userIds);
  }

  // NUEVO: Estado del sistema
  @Get('status')
  getSystemStatus() {
    return this.ticketsService.getSystemStatus();
  }

  @Delete('schedule/:userId')
  cancelSchedule(@Param('userId', ParseIntPipe) userId: number) {
    return this.ticketsService.cancelScheduledRegistration(userId);
  }
}
