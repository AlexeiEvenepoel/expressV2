import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as schedule from 'node-schedule';
import * as FormData from 'form-data';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterTicketDto } from './dto/register-ticket.dto';
import { TicketResponse } from './interfaces/ticket-responde.interface';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly API_URL = 'https://comensales.uncp.edu.pe/api/registros';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  async registerTicket(
    registerTicketDto: RegisterTicketDto,
  ): Promise<TicketResponse> {
    try {
      this.logger.log(
        `Enviando solicitud para DNI: ${registerTicketDto.dni}, Código: ${registerTicketDto.code}`,
      );

      const payload = {
        t1_id: null,
        t1_dni: registerTicketDto.dni,
        t1_codigo: registerTicketDto.code,
        t1_nombres: '',
        t1_escuela: '',
        t1_estado: null,
        t3_periodos_t3_id: null,
      };

      this.logger.log(`Payload: ${JSON.stringify(payload)}`);

      // Crear FormData y añadir el JSON como campo "data" - CLAVE DEL ÉXITO
      const form = new FormData();
      form.append('data', JSON.stringify(payload));

      const startTime = Date.now();
      const response = await axios.post(this.API_URL, form, {
        headers: {
          ...form.getHeaders(),
          Referer: 'https://comensales.uncp.edu.pe/', // Importante: añadir el referer
        },
      });
      const endTime = Date.now();

      this.logger.log(`Respuesta recibida (${endTime - startTime}ms)`);
      this.logger.log(`Código de estado: ${response.status}`);
      this.logger.log(`Datos: ${JSON.stringify(response.data)}`);

      if (response.data.code === 201) {
        this.logger.log(
          `¡REGISTRO EXITOSO! Ticket obtenido: ${response.data.t2_codigo}`,
        );
        this.logger.log(`Estudiante: ${response.data.t1_nombres}`);
        this.logger.log(`Escuela: ${response.data.t1_escuela}`);
      } else {
        this.logger.log(`Registro fallido con código: ${response.data.code}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Error de API: ${error.message}`);
        if (error.response) {
          this.logger.error(`Estado de respuesta: ${error.response.status}`);
          this.logger.error(
            `Datos de respuesta: ${JSON.stringify(error.response.data)}`,
          );
        } else if (error.request) {
          this.logger.error('No se recibió respuesta del servidor');
        }
      } else {
        this.logger.error(`Error inesperado: ${error.message}`);
      }

      // Devolver objeto de respuesta estándar para errores
      return { code: 500 };
    }
  }

  async registerTicketWithRetry(
    registerTicketDto: RegisterTicketDto,
    maxRetries = 3,
  ): Promise<TicketResponse> {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.registerTicket(registerTicketDto);
        if (result.code !== 500) {
          return result;
        }
        // Si obtenemos código 500, intentamos de nuevo
        this.logger.warn(
          `Intento ${attempt}/${maxRetries} falló con código 500, reintentando...`,
        );
      } catch (error) {
        lastError = error;
        this.logger.error(
          `Error en intento ${attempt}/${maxRetries}: ${error.message}`,
        );
      }

      // Esperar antes del siguiente intento (backoff exponencial)
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, etc.
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Si llegamos aquí, todos los intentos fallaron
    return { code: 500 };
  }

  async manualRegister(userId: number): Promise<TicketResponse[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get default number of requests from .env or fallback to 10
    const defaultRequests = this.configService.get<string>('DEFAULT_REQUESTS');
    const numRequests = defaultRequests ? parseInt(defaultRequests, 10) : 10;

    // Get interval between requests from .env or fallback to 50ms
    const defaultInterval = this.configService.get<string>(
      'DEFAULT_INTERVAL_MS',
    );
    const intervalMs = defaultInterval ? parseInt(defaultInterval, 10) : 50;

    const results: TicketResponse[] = [];

    for (let i = 0; i < numRequests; i++) {
      try {
        // Usar el método con reintentos para mayor fiabilidad
        const result = await this.registerTicketWithRetry({
          dni: user.dni,
          code: user.code,
        });

        results.push(result);

        if (result.code === 201) {
          // Éxito - parar de enviar solicitudes
          this.logger.log(
            `Registro exitoso conseguido en el intento ${i + 1}. Deteniendo proceso.`,
          );
          break;
        }

        // Pequeño retraso entre solicitudes
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (error) {
        this.logger.error(`Intento ${i + 1} falló: ${error.message}`);
      }
    }

    return results;
  }

  async scheduleTicketRegistration(userId: number, time: string = '10:00:00') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Parse schedule time (format: HH:MM:SS or HH:MM)
    const timeParts = time.split(':').map(Number);
    const hour = timeParts[0];
    const minute = timeParts[1];
    const second = timeParts[2] || 0; // Default to 0 seconds if not specified

    // Create a job name based on user
    const jobName = `ticket_registration_${user.id}`;

    // Check if a job already exists for this user and delete it
    try {
      const existingJob = this.schedulerRegistry.getCronJob(jobName);
      if (existingJob) {
        this.logger.log(`Cancelling existing job for user ${user.id}`);
        existingJob.stop();
        this.schedulerRegistry.deleteCronJob(jobName);
      }
    } catch (error) {
      // No existing job found, continue with scheduling
      this.logger.log(
        `No existing job found for user ${user.id}, creating new one`,
      );
    }

    // Schedule the job - run Monday to Friday at the specified time
    const job = schedule.scheduleJob(
      `${second} ${minute} ${hour} * * 1-5`,
      async () => {
        this.logger.log(
          `Running scheduled ticket registration for user ${user.name}`,
        );

        // Get default number of requests from .env or fallback to 10
        const defaultRequests =
          this.configService.get<string>('DEFAULT_REQUESTS');
        const numRequests = defaultRequests
          ? parseInt(defaultRequests, 10)
          : 10;

        // Get interval between requests from .env or fallback to 50ms
        const defaultInterval = this.configService.get<string>(
          'DEFAULT_INTERVAL_MS',
        );
        const intervalMs = defaultInterval ? parseInt(defaultInterval, 10) : 50;

        // Send multiple requests with short intervals to maximize chances
        for (let i = 0; i < numRequests; i++) {
          try {
            const result = await this.registerTicketWithRetry({
              dni: user.dni,
              code: user.code,
            });

            if (result.code === 201) {
              this.logger.log(
                `Successfully registered ticket for ${user.name}: ${JSON.stringify(result)}`,
              );
              // Stop sending requests if one succeeds
              break;
            }

            // Small delay between requests
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
          } catch (error) {
            this.logger.error(`Attempt ${i + 1} failed: ${error.message}`);
          }
        }
      },
    );

    // Add job to registry
    this.schedulerRegistry.addCronJob(jobName, job);

    return {
      message: `Scheduled ticket registration for user ${user.name} at ${hour}:${minute}:${second}`,
      jobName: jobName,
    };
  }

  async cancelScheduledRegistration(userId: number) {
    const jobName = `ticket_registration_${userId}`;

    try {
      // Verificar si existe el trabajo programado
      const job = this.schedulerRegistry.getCronJob(jobName);

      // Detener el trabajo
      job.stop();

      // Eliminar del registro
      this.schedulerRegistry.deleteCronJob(jobName);

      this.logger.log(
        `Cancelled scheduled registration for user with ID ${userId}`,
      );

      return {
        success: true,
        message: `Programación de registro de ticket cancelada para el usuario ${userId}`,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobName}: ${error.message}`);
      return {
        success: false,
        message: `No se encontró ninguna programación para el usuario ${userId}`,
      };
    }
  }
}
