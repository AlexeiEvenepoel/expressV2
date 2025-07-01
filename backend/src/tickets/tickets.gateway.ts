import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { RegisterTicketDto } from './dto/register-ticket.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TicketsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketsGateway.name);
  private activeRegistrations = new Map<string, boolean>();

  constructor(private readonly ticketsService: TicketsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
    this.activeRegistrations.delete(client.id);
  }

  @SubscribeMessage('registerTicket')
  async handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RegisterTicketDto,
  ): Promise<void> {
    try {
      this.activeRegistrations.set(client.id, true);

      // Notificar inicio del proceso
      client.emit('registerStatus', {
        status: 'started',
        message: 'Iniciando registro de ticket...',
      });

      const result = await this.ticketsService.registerTicket(payload);

      // Enviar resultado
      client.emit('registerResult', result);

      if (result.code === 201) {
        client.emit('registerStatus', {
          status: 'success',
          message: `¡Éxito! Ticket ${result.t2_codigo} obtenido`,
        });
      } else {
        client.emit('registerStatus', {
          status: 'failed',
          message: `Registro falló con código ${result.code}`,
        });
      }
    } catch (error) {
      client.emit('registerError', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.activeRegistrations.delete(client.id);
    }
  }

  @SubscribeMessage('parallelRegister')
  async handleParallelRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: number; attempts: number },
  ): Promise<void> {
    try {
      this.activeRegistrations.set(client.id, true);

      client.emit('registerStatus', {
        status: 'started',
        message: `Iniciando ${payload.attempts} intentos paralelos...`,
      });

      const results = await this.ticketsService.manualRegisterParallel(
        payload.userId,
      );

      // Enviar progreso
      const successResults = results.filter((r) => r.code === 201);

      client.emit('parallelResults', {
        total: results.length,
        successful: successResults.length,
        results: results,
      });

      if (successResults.length > 0) {
        client.emit('registerStatus', {
          status: 'success',
          message: `¡Éxito! ${successResults.length} tickets obtenidos`,
        });
      } else {
        client.emit('registerStatus', {
          status: 'failed',
          message: 'Ningún intento fue exitoso',
        });
      }
    } catch (error) {
      client.emit('registerError', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.activeRegistrations.delete(client.id);
    }
  }

  // Método para enviar actualizaciones a todos los clientes conectados
  broadcastStatus(message: string, data?: any) {
    this.server.emit('globalStatus', {
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
